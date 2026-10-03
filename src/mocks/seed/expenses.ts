import type { ExpenseInput, Frequency } from '../../api/types';

/** Forma de pago genérica: se traduce al medio de pago propio de quien paga. */
export type PayKind = 'cash' | 'debit' | 'credit' | 'wallet' | 'transfer';
export type SplitPreset = 'all' | 'couple' | NonNullable<ExpenseInput['split']>;

/** Gastos variables que se repiten con frecuencia distinta cada mes. Montos en pesos uruguayos. */
export interface ExpenseTemplate { category: string; items: [description: string, merchant: string][]; min: number; max: number; perMonth: number; shared?: SplitPreset; payers: number[]; methods: PayKind[] }

export const TEMPLATES: ExpenseTemplate[] = [
  { category: 'Supermercado', items: [['Compra semanal', 'Tienda Inglesa'], ['Compra del súper', 'Disco'], ['Reposición de la semana', 'Devoto'], ['Compra grande', 'Ta-Ta']], min: 1800, max: 5200, perMonth: 6, shared: 'all', payers: [1, 2, 2, 3], methods: ['debit', 'credit'] },
  { category: 'Supermercado', items: [['Feria del domingo', 'Feria de Tristán Narvaja'], ['Carnicería', 'Carnicería El Novillo'], ['Verdulería', 'Verdulería Don Julio']], min: 450, max: 1600, perMonth: 4, shared: 'all', payers: [1, 2], methods: ['cash', 'wallet'] },
  { category: 'Delivery', items: [['Pizza del viernes', 'Pizzería Trouville'], ['Chivitos para la cena', 'La Pasiva'], ['Sushi', 'Sushi Bar Pocitos'], ['Empanadas', 'PedidosYa'], ['Hamburguesas', 'PedidosYa'], ['Almuerzo del domingo', 'Parrilla El Fogón']], min: 750, max: 2300, perMonth: 4, shared: 'all', payers: [1, 2, 3], methods: ['wallet', 'credit'] },
  { category: 'Delivery', items: [['Bizcochos', 'Panadería La Ibérica'], ['Café', 'Café Brasilero']], min: 180, max: 520, perMonth: 3, payers: [1, 2, 3], methods: ['cash', 'wallet'] },
  { category: 'Transporte', items: [['Carga de nafta', 'ANCAP'], ['Carga de nafta', 'Petrobras']], min: 1900, max: 3400, perMonth: 2, payers: [1], methods: ['credit'] },
  { category: 'Transporte', items: [['Recarga STM', 'STM']], min: 400, max: 800, perMonth: 2, payers: [3, 2], methods: ['wallet', 'debit'] },
  { category: 'Transporte', items: [['Viaje en Uber', 'Uber']], min: 220, max: 650, perMonth: 2, payers: [2, 3], methods: ['credit', 'wallet'] },
  { category: 'Salud', items: [['Farmacia', 'Farmashop'], ['Remedios', 'Farmacia San Roque'], ['Orden de consulta', 'Médica Uruguaya']], min: 380, max: 1900, perMonth: 2, payers: [2, 1, 3], methods: ['debit'] },
  { category: 'Ocio', items: [['Cine', 'Movie Montevideo Shopping'], ['Salida con amigos', 'Bar La Esquina'], ['Partido de fútbol', 'Estadio Centenario'], ['Obra de teatro', 'Teatro Solís']], min: 600, max: 2800, perMonth: 2, payers: [3, 1, 2], methods: ['credit', 'wallet'] },
  { category: 'Hogar', items: [['Artículos de limpieza', 'Ta-Ta'], ['Ferretería', 'Ferretería Americana'], ['Bazar', 'Bazar Lola'], ['Lamparitas y enchufes', 'Sodimac']], min: 300, max: 2900, perMonth: 1, shared: 'all', payers: [1, 2], methods: ['debit'] },
  { category: 'Mascotas', items: [['Ración para Toby', 'Pet Shop Patitas']], min: 1700, max: 2400, perMonth: 1, shared: 'couple', payers: [2], methods: ['credit'] },
];

/** Gastos puntuales con fecha exacta: cuotas, dólares, divisiones especiales y casos para las alertas. */
export interface OneOffExpense { description: string; merchant: string | null; pesos: number; currency?: string; rate?: number; date: string; category: string; paidBy: number; method: PayKind; split?: SplitPreset; installments?: number; notes?: string; createdBy?: number }

export const ONE_OFF: OneOffExpense[] = [
  { description: 'Cabaña en Punta del Diablo', merchant: 'Cabañas La Viuda', pesos: 180, currency: 'USD', rate: 39.85, date: '2026-07-18', category: 'Ocio', paidBy: 2, method: 'credit', split: 'all', notes: 'Fin de semana largo de julio' },
  { description: 'Lavarropas', merchant: 'Multi Ahorro Hogar', pesos: 36000, date: '2026-08-14', category: 'Hogar', paidBy: 1, method: 'credit', split: 'all', installments: 6, notes: '6 cuotas sin recargo' },
  { description: 'Regalo de cumpleaños para Sofía', merchant: 'Montevideo Shopping', pesos: 3000, date: '2026-08-27', category: 'Otros', paidBy: 1, method: 'credit', split: { mode: 'percentage', participants: [{ userId: 1, value: 60 }, { userId: 3, value: 40 }] } },
  { description: 'Colchón nuevo', merchant: 'Divino', pesos: 18900, date: '2026-09-03', category: 'Hogar', paidBy: 2, method: 'credit', split: 'couple', installments: 3 },
  { description: 'Curso online de inglés', merchant: 'Coursera', pesos: 49, currency: 'USD', rate: 40.1, date: '2026-09-08', category: 'Educación', paidBy: 3, method: 'wallet' },
  { description: 'Libros para facultad', merchant: 'Librería Puro Verso', pesos: 1450, date: '2026-09-21', category: 'Educación', paidBy: 3, method: 'wallet' },
  { description: 'Súper y cosas personales', merchant: 'Tienda Inglesa', pesos: 4200, date: '2026-09-26', category: 'Supermercado', paidBy: 1, method: 'debit', split: { mode: 'exact', participants: [{ userId: 1, value: 170000 }, { userId: 2, value: 125000 }, { userId: 3, value: 125000 }] }, notes: 'Cada uno pagó lo suyo de la parte personal' },
  { description: 'Arreglo del calefón', merchant: 'Service Calefones Pocitos', pesos: 7800, date: '2026-10-09', category: 'Hogar', paidBy: 1, method: 'debit', split: 'all', notes: 'Cambio de resistencia y termostato' },
  // El ticket del comprobante pendiente de Matías ya está cargado: la IA lo marca como posible duplicado.
  { description: 'Compra semanal', merchant: 'Tienda Inglesa', pesos: 3284, date: '2026-10-17', category: 'Supermercado', paidBy: 1, method: 'debit', split: 'all' },
  // Lucas cargó un gasto que pagó Sofía: ambos pueden editarlo.
  { description: 'Pizza con amigos', merchant: 'Pizzería Trouville', pesos: 2150, date: '2026-10-11', category: 'Delivery', paidBy: 2, method: 'wallet', split: 'all', createdBy: 3 },
  { description: 'Sushi para festejar', merchant: 'Sushi Bar Pocitos', pesos: 2480, date: '2026-10-16', category: 'Delivery', paidBy: 3, method: 'wallet', split: 'all' },
];

/** Gastos fijos. history: fechas ya registradas antes de hoy (para los recordatorios de monto variable). */
export interface RecurringSeed { description: string; merchant: string | null; pesos: number | null; currency?: string; rate?: number; category: string; paidBy: number; method: PayKind; frequency: Frequency; interval?: number; startDate: string; nextDate?: string; mode: 'auto' | 'remind'; split?: SplitPreset; active?: boolean; history?: [date: string, pesos: number][] }

export const RECURRING: RecurringSeed[] = [
  { description: 'Alquiler', merchant: 'Inmobiliaria del Parque', pesos: 32000, category: 'Alquiler', paidBy: 1, method: 'transfer', frequency: 'monthly', startDate: '2026-07-01', mode: 'auto', split: { mode: 'shares', participants: [{ userId: 1, value: 2 }, { userId: 2, value: 1 }, { userId: 3, value: 1 }] } },
  { description: 'Netflix', merchant: 'Netflix', pesos: 15.99, currency: 'USD', rate: 40.25, category: 'Suscripciones', paidBy: 2, method: 'credit', frequency: 'monthly', startDate: '2026-07-05', mode: 'auto', split: 'couple' },
  { description: 'Gastos comunes', merchant: 'Administración Pérez', pesos: 6800, category: 'Alquiler', paidBy: 2, method: 'transfer', frequency: 'monthly', startDate: '2026-07-10', mode: 'auto', split: 'all' },
  { description: 'Internet fibra', merchant: 'Antel', pesos: 1990, category: 'Internet', paidBy: 3, method: 'wallet', frequency: 'monthly', startDate: '2026-07-15', mode: 'auto', split: 'all' },
  { description: 'Seguro del auto', merchant: 'Porto Seguro', pesos: 2650, category: 'Transporte', paidBy: 1, method: 'credit', frequency: 'monthly', startDate: '2026-07-25', mode: 'auto' },
  { description: 'Factura de luz', merchant: 'UTE', pesos: null, category: 'Servicios', paidBy: 1, method: 'debit', frequency: 'monthly', startDate: '2026-07-16', nextDate: '2026-10-16', mode: 'remind', split: 'all', history: [['2026-07-16', 2980], ['2026-08-16', 3410], ['2026-09-16', 3150]] },
  { description: 'Factura de agua', merchant: 'OSE', pesos: null, category: 'Servicios', paidBy: 2, method: 'debit', frequency: 'monthly', interval: 2, startDate: '2026-08-12', nextDate: '2026-10-12', mode: 'remind', split: 'all', history: [['2026-08-12', 1180]] },
  { description: 'Gimnasio', merchant: 'Sport Club Pocitos', pesos: 1900, category: 'Salud', paidBy: 3, method: 'wallet', frequency: 'monthly', startDate: '2026-07-03', nextDate: '2026-09-03', mode: 'auto', active: false, history: [['2026-07-03', 1900], ['2026-08-03', 1900]] },
];

/** Presupuestos: rigen desde el mes indicado hasta que se cambian (en setiembre se ajustó el total). */
export const BUDGETS: [effectiveFrom: string, category: string | null, pesos: number][] = [
  ['2026-07', null, 120000], ['2026-09', null, 135000],
  ['2026-07', 'Supermercado', 26000], ['2026-07', 'Delivery', 6000], ['2026-07', 'Transporte', 9000],
  ['2026-07', 'Ocio', 5000], ['2026-07', 'Mascotas', 2500], ['2026-07', 'Servicios', 6000],
];

/** Pagos entre integrantes ya registrados. */
export const SETTLEMENTS: { from: number; to: number; pesos: number; date: string; note: string }[] = [
  { from: 3, to: 1, pesos: 16000, date: '2026-07-31', note: 'Transferencia por Prex' },
  { from: 3, to: 1, pesos: 17500, date: '2026-08-31', note: 'Transferencia por Prex' },
  { from: 3, to: 1, pesos: 18000, date: '2026-09-30', note: 'Transferencia BROU' },
];
