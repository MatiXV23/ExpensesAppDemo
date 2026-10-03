import type { ReceiptStatus } from '../../api/types';

/** Comprobantes de la bandeja inicial. Las imágenes están en public/samples. */
export interface ReceiptSeed { id: number; status: ReceiptStatus; file: string; name: string; uploadedBy: number; createdAt: string; template: string | null; error?: string; expense?: { description: string; merchant: string; pesos: number; date: string; category: string; method: 'debit' | 'credit'; items: [string, number, number][] } }

export const SEED_RECEIPTS: ReceiptSeed[] = [
  // Pendiente de revisión: la IA detecta que el gasto ya estaba cargado (posible duplicado).
  { id: 1, status: 'needs_review', file: 'samples/ticket-tienda-inglesa.svg', name: 'Ticket_TiendaInglesa.jpg', uploadedBy: 1, createdAt: '2026-10-18T13:32:00.000Z', template: 'ticket-tienda-inglesa' },
  // Captura de home banking con varios movimientos.
  { id: 2, status: 'needs_review', file: 'samples/captura-banco.svg', name: 'Captura_movimientos.png', uploadedBy: 2, createdAt: '2026-10-17T21:10:00.000Z', template: 'captura-banco' },
  // Ya confirmado: el gasto quedó asociado al comprobante.
  { id: 3, status: 'confirmed', file: 'samples/ticket-farmashop.svg', name: 'Farmashop_setiembre.jpg', uploadedBy: 2, createdAt: '2026-09-16T19:40:00.000Z', template: null, expense: { description: 'Farmacia', merchant: 'Farmashop', pesos: 1630, date: '2026-09-16', category: 'Salud', method: 'debit', items: [['Ibuprofeno 400 mg x20', 1, 189], ['Protector solar FPS 50', 1, 890], ['Vitamina C x30', 1, 351], ['Curitas x20', 1, 200]] } },
  // La IA no pudo leerlo: se puede reintentar o cargar a mano.
  { id: 4, status: 'failed', file: 'samples/foto-borrosa.svg', name: 'IMG_2041.jpg', uploadedBy: 3, createdAt: '2026-10-14T22:05:00.000Z', template: 'blurry', error: 'La foto salió movida y no se pueden leer los importes. Prueba con otra foto o cárgalo a mano.' },
];
