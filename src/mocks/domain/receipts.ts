import type { Expense, ExpenseInput, Receipt, ReceiptStatus, User } from '../../api/types';
import { demoNowIso } from '../clock';
import { getConfig, RECEIPT_PROCESSING_MS } from '../config';
import { markDirty, nextId, type DbReceipt, type MockDB } from '../db';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { readingFor, readReceipt, SIMULATED_MODEL } from './ai';
import { createExpenses } from './expenses';

export interface PreparedFile { name: string; type: string; size: number; dataUrl: string }

const processingDelay = () => RECEIPT_PROCESSING_MS.min + Math.random() * (RECEIPT_PROCESSING_MS.max - RECEIPT_PROCESSING_MS.min);

export function toReceiptDTO(db: MockDB, r: DbReceipt): Receipt {
  const { readyAt: _r, template: _t, attempts: _a, ...dto } = r;
  // Si un gasto marcado como posible duplicado se borró, deja de avisarse.
  return { ...dto, drafts: dto.drafts.map(d => ({ ...d, possibleDuplicates: d.possibleDuplicates.filter(p => db.expenses.some(e => e.id === p.id)) })) };
}

export function getReceiptRow(db: MockDB, id: number) {
  const row = db.receipts.find(r => r.id === id);
  if (!row) throw notFound('Comprobante');
  return row;
}

export function listReceipts(db: MockDB, statuses?: ReceiptStatus[]) {
  // Por día y después por orden de carga: lo recién subido queda primero aunque la hora real sea anterior a la de los ejemplos.
  return db.receipts.filter(r => !statuses?.length || statuses.includes(r.status)).sort((a, b) => b.createdAt.slice(0, 10).localeCompare(a.createdAt.slice(0, 10)) || b.id - a.id).slice(0, 200);
}

export function storeReceipt(db: MockDB, file: PreparedFile, user: User): DbReceipt {
  const receipt: DbReceipt = {
    id: nextId(db, 'receipts'), status: 'processing', fileUrl: file.dataUrl, thumbnailUrl: null, mimeType: file.type, originalName: file.name, sizeBytes: file.size, uploadedById: user.id,
    documentType: null, summary: null, drafts: [], error: null, expenseIds: [], model: null, createdAt: demoNowIso(), processedAt: null,
    readyAt: Date.now() + processingDelay(), template: readingFor(file.name), attempts: 1,
  };
  db.receipts.push(receipt);
  markDirty();
  return receipt;
}

/** Termina el "procesamiento" de los comprobantes cuyo tiempo de lectura ya pasó. */
export function finishProcessedReceipts(db: MockDB, now = Date.now()) {
  const config = getConfig();
  for (const r of db.receipts.filter(r => r.status === 'processing' && (r.readyAt ?? 0) <= now)) {
    r.processedAt = demoNowIso();
    r.model = SIMULATED_MODEL;
    r.readyAt = null;
    if (config.errors && Math.random() < config.errorRate) {
      r.status = 'failed';
      r.error = 'La IA no respondió a tiempo (error simulado). Puedes reintentar o cargar el gasto a mano mirando el comprobante.';
    } else if (r.template === 'blurry' && (r.attempts ?? 1) < 2) {
      r.status = 'failed';
      r.error = 'La foto salió movida y no se pueden leer los importes. Prueba con otra foto o cárgalo a mano.';
    } else {
      const reading = readReceipt(db, r.template === 'blurry' ? 'blurry-retry' : r.template ?? 'generico', r.uploadedById);
      Object.assign(r, { status: reading.drafts.length ? 'needs_review' : 'failed', documentType: reading.documentType, summary: reading.summary, drafts: reading.drafts, error: null });
    }
    markDirty();
  }
}

export function confirmReceipt(db: MockDB, id: number, inputs: ExpenseInput[], user: User): Expense[] {
  const r = getReceiptRow(db, id);
  if (!['needs_review', 'failed'].includes(r.status)) throw conflict(r.status === 'confirmed' ? 'Este comprobante ya fue confirmado' : 'Este comprobante no se puede confirmar en su estado actual');
  if (!inputs?.length) throw badRequest('Elige al menos un gasto para confirmar.');
  const created = inputs.flatMap(input => createExpenses(db, input, user, { source: 'receipt', receiptId: id }));
  Object.assign(r, { status: 'confirmed', expenseIds: created.map(e => e.id) });
  markDirty();
  return created;
}

export function retryReceipt(db: MockDB, id: number) {
  const r = getReceiptRow(db, id);
  if (r.status === 'confirmed') throw conflict('Este comprobante ya fue confirmado');
  Object.assign(r, { status: 'processing', error: null, drafts: [], summary: null, readyAt: Date.now() + processingDelay(), attempts: (r.attempts ?? 1) + 1 });
  markDirty();
  return r;
}

export function discardReceipt(db: MockDB, id: number) {
  const r = getReceiptRow(db, id);
  if (r.status === 'confirmed') throw conflict('Este comprobante ya fue confirmado');
  r.status = 'discarded';
  markDirty();
  return r;
}

export function deleteReceipt(db: MockDB, id: number, user: User) {
  const r = getReceiptRow(db, id);
  if (user.role !== 'admin' && r.uploadedById !== user.id) throw forbidden('Solo quien subió el comprobante (o un admin) puede eliminarlo');
  db.receipts = db.receipts.filter(x => x.id !== id);
  for (const e of db.expenses) if (e.receiptId === id) e.receiptId = null;
  markDirty();
}
