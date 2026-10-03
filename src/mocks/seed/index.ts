import type { ExpenseInput, User } from '../../api/types';
import { DEMO_TODAY, demoMonth, addMonthsToMonth, formatDate, monthDays } from '../clock';
import type { DbReceipt, MockDB } from '../db';
import { readReceipt, SIMULATED_MODEL } from '../domain/ai';
import { createSettlement } from '../domain/balances';
import { setBudget } from '../domain/budgets';
import { createExpenses } from '../domain/expenses';
import { createRecurring, processDueRecurring } from '../domain/recurring';
import { createCategories, SEED_PAYMENT_METHODS, SEED_SETTINGS } from './catalog';
import { BUDGETS, ONE_OFF, RECURRING, SETTLEMENTS, TEMPLATES, type PayKind, type SplitPreset } from './expenses';
import { SEED_RECEIPTS } from './receipts';
import { DEMO_PASSWORD, SEED_USERS } from './users';

/** Generador pseudoaleatorio determinístico: la demo siempre arranca con los mismos datos. */
function random(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Medio de pago de cada integrante según la forma de pago. */
const METHOD_BY_USER: Record<number, Record<PayKind, number>> = {
  1: { cash: 1, debit: 2, credit: 3, wallet: 7, transfer: 8 },
  2: { cash: 1, debit: 5, credit: 4, wallet: 7, transfer: 8 },
  3: { cash: 1, debit: 6, credit: 6, wallet: 6, transfer: 8 },
};

function emptyDb(): MockDB {
  return { version: 2, initialized: false, sessionId: null, settings: { ...SEED_SETTINGS, householdName: '' }, users: [], passwords: {}, categories: [], methods: [], expenses: [], receipts: [], recurring: [], settlements: [], budgets: [], reports: {}, seq: {} };
}

/** Un hogar sin configurar, para probar el asistente de primer arranque. */
export const createEmptyHousehold = emptyDb;

/** Hogar de ejemplo: tres integrantes y cuatro meses de gastos que terminan en el "hoy" de la demo. */
export function createSeed(): MockDB {
  const db = emptyDb();
  Object.assign(db, { initialized: true, settings: structuredClone(SEED_SETTINGS), users: structuredClone(SEED_USERS), categories: createCategories(), methods: structuredClone(SEED_PAYMENT_METHODS) });
  for (const u of db.users) db.passwords[u.id] = DEMO_PASSWORD;
  const rand = random(2026);
  const user = (id: number) => db.users.find(u => u.id === id) as User;
  const cat = (prefix: string) => db.categories.find(c => c.name.startsWith(prefix))!.id;
  const everyone = { mode: 'equal' as const, participants: db.users.map(u => ({ userId: u.id })) };
  const split = (preset?: SplitPreset): ExpenseInput['split'] => preset === 'all' ? everyone : preset === 'couple' ? { mode: 'equal', participants: [{ userId: 1 }, { userId: 2 }] } : preset ?? null;
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  const between = (min: number, max: number) => Math.round((min + rand() * (max - min)) / 10) * 10;

  // Gastos fijos (y los meses ya registrados de los que tienen monto variable).
  for (const r of RECURRING) {
    const created = createRecurring(db, { description: r.description, merchant: r.merchant, amountCents: r.pesos === null ? null : Math.round(r.pesos * 100), currency: r.currency ?? 'UYU', exchangeRate: r.rate, categoryId: cat(r.category), paidById: r.paidBy, paymentMethodId: METHOD_BY_USER[r.paidBy][r.method], notes: null, frequency: r.frequency, interval: r.interval ?? 1, startDate: r.startDate, endDate: null, mode: r.mode, split: split(r.split), active: true }, user(r.paidBy));
    const row = db.recurring.find(x => x.id === created.id)!;
    for (const [date, pesos] of r.history ?? []) createExpenses(db, { description: r.description, merchant: r.merchant, amountCents: pesos * 100, date, categoryId: row.categoryId, paidById: r.paidBy, paymentMethodId: row.paymentMethodId, split: row.split }, user(r.paidBy), { source: 'recurring', recurringId: row.id });
    if (r.nextDate) row.nextDate = r.nextDate;
    if (r.active === false) row.active = false;
    row.createdAt = `${r.startDate}T13:00:00.000Z`;
  }

  // Gastos variables de los últimos cuatro meses (los precios suben un poco mes a mes).
  const months = [-3, -2, -1, 0].map(n => addMonthsToMonth(demoMonth(), n));
  months.forEach((month, m) => {
    const lastDay = month === demoMonth() ? Number(DEMO_TODAY.slice(8)) : monthDays(month);
    const inflation = 1 + m * 0.012;
    for (const t of TEMPLATES) {
      const n = month === demoMonth() ? Math.ceil((t.perMonth * lastDay) / monthDays(month)) : t.perMonth;
      for (let i = 0; i < n; i++) {
        const [description, merchant] = pick(t.items);
        const payer = pick(t.payers);
        // A veces carga el gasto alguien distinto de quien pagó (sirve para probar los permisos).
        const creator = rand() < 0.15 ? pick(db.users.filter(u => u.id !== payer)).id : payer;
        createExpenses(db, { description, merchant, amountCents: Math.round(between(t.min, t.max) * inflation / 10) * 1000, date: formatDate(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1 + Math.floor(rand() * lastDay)), categoryId: cat(t.category), paidById: payer, paymentMethodId: METHOD_BY_USER[payer][pick(t.methods)], split: split(t.shared) }, user(creator));
      }
    }
  });

  // Gastos puntuales: cuotas, dólares, divisiones por porcentaje y montos exactos.
  for (const e of ONE_OFF) createExpenses(db, { description: e.description, merchant: e.merchant, amountCents: Math.round(e.pesos * 100), currency: e.currency ?? 'UYU', exchangeRate: e.rate, date: e.date, categoryId: cat(e.category), paidById: e.paidBy, paymentMethodId: METHOD_BY_USER[e.paidBy][e.method], split: split(e.split), installments: e.installments, notes: e.notes }, user(e.createdBy ?? e.paidBy));

  // Lo que el servidor ya habría registrado solo: alquiler, gastos comunes, internet...
  processDueRecurring(db, DEMO_TODAY);

  for (const [month, category, pesos] of BUDGETS) setBudget(db, month, category === null ? null : cat(category), pesos * 100);
  for (const s of SETTLEMENTS) createSettlement(db, { fromUserId: s.from, toUserId: s.to, amountCents: s.pesos * 100, date: s.date, note: s.note }, user(s.from)).createdAt = `${s.date}T20:00:00.000Z`;

  // Bandeja de comprobantes.
  for (const r of SEED_RECEIPTS) {
    const receipt: DbReceipt = { id: r.id, status: r.status, fileUrl: r.file, thumbnailUrl: null, mimeType: 'image/svg+xml', originalName: r.name, sizeBytes: 180_000 + r.id * 23_417, uploadedById: r.uploadedBy, documentType: null, summary: null, drafts: [], error: r.error ?? null, expenseIds: [], model: SIMULATED_MODEL, createdAt: r.createdAt, processedAt: r.createdAt, readyAt: null, template: r.template, attempts: 1 };
    if (r.template && r.status === 'needs_review') Object.assign(receipt, readReceipt(db, r.template, r.uploadedBy));
    if (r.expense) {
      const e = r.expense;
      const created = createExpenses(db, { description: e.description, merchant: e.merchant, amountCents: e.pesos * 100, date: e.date, categoryId: cat(e.category), paidById: r.uploadedBy, paymentMethodId: METHOD_BY_USER[r.uploadedBy][e.method] }, user(r.uploadedBy), { source: 'receipt', receiptId: r.id });
      Object.assign(receipt, { documentType: 'receipt', summary: `Ticket de ${e.merchant} con ${e.items.length} artículos.`, expenseIds: created.map(x => x.id), drafts: [{ description: e.description, merchant: e.merchant, amountCents: e.pesos * 100, currency: 'UYU', date: e.date, categoryId: cat(e.category), paymentMethodId: created[0].paymentMethodId, paidById: null, installments: 1, confidence: 'high', notes: null, split: null, items: e.items.map(([description, quantity, pesos]) => ({ description, quantity, amountCents: pesos * 100 })), possibleDuplicates: [] }] });
    }
    db.receipts.push(receipt);
  }
  db.seq.receipts = Math.max(...db.receipts.map(r => r.id));

  // Fechas de carga verosímiles (la hora del día varía).
  for (const e of db.expenses) { const hour = 12 + Math.floor(rand() * 11); e.createdAt = e.updatedAt = `${e.date}T${String(hour).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00.000Z`; }
  return db;
}
