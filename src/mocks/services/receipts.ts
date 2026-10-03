import type { Expense, ExpenseInput, Receipt, ReceiptStatus } from '../../api/types';
import { getDb } from '../db';
import { badRequest } from '../errors';
import { notify, track } from '../events';
import { confirmReceipt, deleteReceipt, discardReceipt, getReceiptRow, listReceipts, retryReceipt, storeReceipt, toReceiptDTO, type PreparedFile } from '../domain/receipts';
import type { MockDB, DbReceipt } from '../db';
import { currentUser, run } from '../runtime';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_PDF_BYTES = 1.5 * 1024 * 1024;
const MAX_SIDE = 1400;

const readAsDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });

/** Reduce las fotos a 1400 px en JPEG para que entren en el almacenamiento del navegador (el backend real las reduce a 2000 px). */
async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.8);
}

async function prepare(file: File): Promise<PreparedFile> {
  if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) throw badRequest('Las fotos HEIC del iPhone no se pueden abrir en el navegador. En la app real el servidor las convierte; acá usa JPG o PNG.');
  if (file.type === 'image/svg+xml') return { name: file.name, type: file.type, size: file.size, dataUrl: await readAsDataUrl(file) };
  if (IMAGE_TYPES.includes(file.type)) {
    try { return { name: file.name, type: 'image/jpeg', size: file.size, dataUrl: await shrinkImage(file) }; } catch { throw badRequest(`No pudimos abrir "${file.name}". Prueba con otra imagen.`); }
  }
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) throw badRequest('En la demo los PDF pueden pesar hasta 1,5 MB porque se guardan en el navegador. La app real acepta hasta 15 MB.');
    return { name: file.name, type: file.type, size: file.size, dataUrl: await readAsDataUrl(file) };
  }
  throw badRequest('Usa imágenes JPG, PNG o WebP, o un PDF.');
}

// Los PDF guardados como data URL se muestran mejor como blob URL dentro del iframe.
const pdfUrls = new Map<string, string>();
function fileUrlFor(r: DbReceipt) {
  if (!r.fileUrl.startsWith('data:application/pdf') || typeof URL.createObjectURL !== 'function') return r.fileUrl;
  const key = `${r.id}:${r.fileUrl.length}`;
  if (!pdfUrls.has(key)) { const [, b64] = r.fileUrl.split(','); const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); pdfUrls.set(key, URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))); }
  return pdfUrls.get(key)!;
}
const dto = (db: MockDB, r: DbReceipt): Receipt => ({ ...toReceiptDTO(db, r), fileUrl: fileUrlFor(r) });

let explained = false;
function explainAi() {
  if (explained) return;
  explained = true;
  notify({ kind: 'ai', level: 'modal', title: 'La IA está leyendo tu comprobante', description: 'En unos segundos vas a ver los gastos propuestos para revisar. En esta demo no hay IA real: los comprobantes de ejemplo tienen su lectura preparada y, para tus propios archivos, se propone un gasto de ejemplo según el nombre del archivo.', real: 'Claude lee la foto, el PDF o la captura: detecta comercio, fecha, monto, ítems y medio de pago, sugiere la categoría según el historial y avisa si el gasto parece duplicado. Nunca guarda nada solo: siempre revisas y confirmas.', details: [{ label: 'Modelo', value: 'Claude (simulado)' }, { label: 'Tiempo de lectura', value: '3 a 4 segundos' }] });
}

/** Misma interfaz que src/api/receipts.ts del cliente real. */
export const receiptsApi = {
  list: (status?: string) => run(db => listReceipts(db, status ? status.split(',').map(s => s.trim()) as ReceiptStatus[] : undefined).map(r => dto(db, r))),

  get: (id: number) => run(db => dto(db, getReceiptRow(db, id))),

  upload: async (files: File[]): Promise<Receipt[]> => {
    if (!files.length) throw badRequest('No se recibió ningún archivo');
    if (files.length > 10) throw badRequest('Puedes subir hasta 10 archivos a la vez.');
    const prepared = await Promise.all(files.map(prepare));
    const created = await run(db => { const me = currentUser(db); return prepared.map(file => dto(db, storeReceipt(db, file, me))); });
    explainAi();
    return created;
  },

  /** GET /receipts/:id/file → en la demo, la URL local del archivo. */
  file: (id: number) => { const r = getDb().receipts.find(x => x.id === id); return r ? fileUrlFor(r) : ''; },

  confirm: (id: number, expenses: ExpenseInput[]) => run((db): Expense[] => { const created = confirmReceipt(db, id, expenses, currentUser(db)); track('receipt'); return created; }),

  retry: (id: number) => run(db => dto(db, retryReceipt(db, id))),

  discard: (id: number) => run(db => dto(db, discardReceipt(db, id))),

  remove: (id: number) => run(db => { deleteReceipt(db, id, currentUser(db)); }),
};
