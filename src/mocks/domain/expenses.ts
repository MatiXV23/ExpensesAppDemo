import type { Expense, ExpenseInput, ExpenseSource, User } from '../../api/types';
import { allocate } from '../../lib/splits';
import { addDays, addMonths, demoNowIso, isValidDate, monthRange } from '../clock';
import { markDirty, nextId, type MockDB } from '../db';
import { badRequest, forbidden, notFound } from '../errors';

export type SplitInput = NonNullable<ExpenseInput['split']>;
export interface ExpensePatch extends Partial<Omit<ExpenseInput, 'installments' | 'source'>> { applyToGroup?: boolean }
export interface CreateOptions { source?: ExpenseSource; receiptId?: number | null; recurringId?: number | null }

const toBaseCents = (amountCents: number, rate: number) => Math.round(amountCents * rate);

/** Cotización de referencia a la moneda base (misma regla que server/src/services/exchange.ts). */
export function referenceRate(db: MockDB, currency: string): number | null {
  const base = db.settings.baseCurrency;
  if (currency === base) return 1;
  const usdRate = db.settings.usdRate;
  if (!usdRate) return null;
  if (currency === 'USD') return usdRate;
  if (base === 'USD' && currency === 'UYU') return 1 / usdRate;
  return null;
}

function resolveCurrency(db: MockDB, currency: string | undefined, exchangeRate: number | undefined) {
  const base = db.settings.baseCurrency;
  const cur = currency ?? base;
  if (cur === base) return { currency: cur, exchangeRate: 1 };
  if (exchangeRate && exchangeRate > 0) return { currency: cur, exchangeRate };
  const reference = referenceRate(db, cur);
  if (!reference) throw badRequest(`Indica la cotización de ${cur} a ${base}, o configura la cotización del dólar en Configuración → Hogar`);
  return { currency: cur, exchangeRate: reference };
}

function validateInput(input: Partial<ExpenseInput>, creating: boolean) {
  if (creating || input.description !== undefined) {
    const description = input.description?.trim() ?? '';
    if (!description) throw badRequest('Escribe una descripción.');
    if (description.length > 200) throw badRequest('La descripción no puede superar los 200 caracteres.');
  }
  if (creating || input.amountCents !== undefined) {
    if (!Number.isInteger(input.amountCents) || input.amountCents === 0) throw badRequest('Ingresa un monto distinto de cero.');
    if (Math.abs(input.amountCents!) > 100_000_000_00) throw badRequest('El monto es demasiado grande.');
  }
  if ((creating || input.date !== undefined) && !isValidDate(input.date ?? '')) throw badRequest('Elige una fecha válida.');
  if (creating && input.installments !== undefined && (!Number.isInteger(input.installments) || input.installments < 1 || input.installments > 60)) throw badRequest('Elige entre 1 y 60 cuotas.');
}

function assertReferences(db: MockDB, input: Partial<ExpenseInput>, userIds: number[]) {
  if (input.categoryId != null && !db.categories.some(c => c.id === input.categoryId)) throw badRequest(`La categoría ${input.categoryId} no existe`);
  if (input.paymentMethodId != null && !db.methods.some(m => m.id === input.paymentMethodId)) throw badRequest(`El medio de pago ${input.paymentMethodId} no existe`);
  const missing = [...new Set(userIds)].filter(id => !db.users.some(u => u.id === id && u.active));
  if (missing.length) throw badRequest(`Integrante inexistente o inactivo: ${missing.join(', ')}`);
}

/** Valida la división y devuelve los pesos de cada participante (port de splitWeights del backend). */
export function splitWeights(split: SplitInput, totalAmountCents: number): number[] {
  const ids = split.participants.map(p => p.userId);
  if (!ids.length) throw badRequest('Selecciona al menos un participante para dividir el gasto.');
  if (new Set(ids).size !== ids.length) throw badRequest('Hay participantes repetidos en la división');
  switch (split.mode) {
    case 'equal': return split.participants.map(() => 1);
    case 'shares': {
      const values = split.participants.map(p => p.value);
      if (values.some(v => v == null || !(v > 0))) throw badRequest('Cada proporción debe ser mayor a 0');
      return values as number[];
    }
    case 'percentage': {
      const values = split.participants.map(p => p.value ?? NaN);
      if (values.some(v => Number.isNaN(v) || v < 0)) throw badRequest('Falta el porcentaje de algún participante');
      const sum = values.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.01) throw badRequest(`Los porcentajes deben sumar 100 (suman ${+sum.toFixed(2)})`);
      return values;
    }
    case 'exact': {
      const values = split.participants.map(p => p.value ?? NaN);
      if (values.some(v => Number.isNaN(v) || !Number.isInteger(v) || v < 0)) throw badRequest('Los montos exactos deben ser enteros en centavos');
      const sum = values.reduce((a, b) => a + b, 0);
      if (sum !== Math.abs(totalAmountCents)) throw badRequest('Los montos exactos deben sumar el total del gasto', { expected: Math.abs(totalAmountCents), actual: sum });
      if (sum === 0) throw badRequest('Los montos exactos no pueden ser todos 0');
      return values;
    }
  }
}

function buildSplits(split: SplitInput, weights: number[], amountCents: number, amountBaseCents: number) {
  // allocate trabaja con montos positivos; los reintegros (negativos) se reparten igual y se les devuelve el signo.
  const sign = amountCents < 0 ? -1 : 1;
  const amounts = allocate(Math.abs(amountCents), weights);
  const bases = allocate(Math.abs(amountBaseCents), weights);
  return split.participants.map((p, i) => ({ userId: p.userId, value: split.mode === 'equal' ? null : p.value ?? null, amountCents: sign * amounts[i], amountBaseCents: sign * bases[i] }));
}
const signedAllocate = (total: number, n: number) => allocate(Math.abs(total), Array(n).fill(1)).map(v => (total < 0 ? -v : v));

/** Crea un gasto (o N cuotas mensuales si installments > 1). */
export function createExpenses(db: MockDB, input: ExpenseInput, user: User, opts: CreateOptions = {}): Expense[] {
  validateInput(input, true);
  const { currency, exchangeRate } = resolveCurrency(db, input.currency, input.exchangeRate);
  const paidById = input.paidById ?? user.id;
  assertReferences(db, input, [paidById, ...(input.split?.participants.map(p => p.userId) ?? [])]);
  const split = input.split ?? null;
  const weights = split ? splitWeights(split, input.amountCents) : null;
  const n = input.installments ?? 1;
  const amounts = signedAllocate(input.amountCents, n);
  const bases = signedAllocate(toBaseCents(input.amountCents, exchangeRate), n);
  const groupId = n > 1 ? crypto.randomUUID() : null;
  const now = demoNowIso();
  const created: Expense[] = [];
  for (let i = 0; i < n; i++) {
    const expense: Expense = {
      id: nextId(db, 'expenses'), description: input.description.trim(), merchant: input.merchant?.trim() || null, amountCents: amounts[i], currency, exchangeRate, amountBaseCents: bases[i],
      date: i === 0 ? input.date : addMonths(input.date, i), categoryId: input.categoryId ?? null, paidById, paymentMethodId: input.paymentMethodId ?? null, notes: input.notes?.trim() || null,
      source: opts.source ?? (input.source === 'text' ? 'text' : 'manual'), isShared: split !== null, splitMode: split?.mode ?? null, splits: split && weights ? buildSplits(split, weights, amounts[i], bases[i]) : [],
      installment: groupId ? { number: i + 1, total: n, groupId } : null, receiptId: opts.receiptId ?? null, recurringId: opts.recurringId ?? null, createdById: user.id, createdAt: now, updatedAt: now,
    };
    db.expenses.push(expense);
    created.push(expense);
  }
  markDirty();
  return created;
}

export function getExpense(db: MockDB, id: number): Expense {
  const expense = db.expenses.find(e => e.id === id);
  if (!expense) throw notFound('Gasto');
  return expense;
}

export const canModify = (user: User, expense: Pick<Expense, 'createdById' | 'paidById'>) => user.role === 'admin' || expense.createdById === user.id || expense.paidById === user.id;

function currentSplit(expense: Expense): SplitInput | null {
  if (!expense.isShared || !expense.splitMode) return null;
  return { mode: expense.splitMode, participants: expense.splits.map(s => ({ userId: s.userId, value: s.value ?? undefined })) };
}

export function updateExpense(db: MockDB, id: number, patch: ExpensePatch, user: User): Expense {
  const expense = getExpense(db, id);
  if (!canModify(user, expense)) throw forbidden('Solo quien cargó o pagó el gasto (o un admin) puede editarlo');
  validateInput(patch, false);
  const amountCents = patch.amountCents ?? expense.amountCents;
  let { currency, exchangeRate } = expense;
  if (patch.currency !== undefined || patch.exchangeRate !== undefined) ({ currency, exchangeRate } = resolveCurrency(db, patch.currency ?? expense.currency, patch.exchangeRate ?? (patch.currency && patch.currency !== expense.currency ? undefined : expense.exchangeRate)));
  const amountBaseCents = toBaseCents(amountCents, exchangeRate);
  const split = patch.split !== undefined ? patch.split : currentSplit(expense);
  const paidById = patch.paidById ?? expense.paidById;
  assertReferences(db, patch, [...(patch.paidById !== undefined ? [paidById] : []), ...(patch.split ? patch.split.participants.map(p => p.userId) : [])]);
  const weights = split ? splitWeights(split, amountCents) : null;
  const shared = {
    ...(patch.description !== undefined && { description: patch.description.trim() }),
    ...(patch.merchant !== undefined && { merchant: patch.merchant?.trim() || null }),
    ...(patch.categoryId !== undefined && { categoryId: patch.categoryId ?? null }),
    ...(patch.paymentMethodId !== undefined && { paymentMethodId: patch.paymentMethodId ?? null }),
    ...(patch.notes !== undefined && { notes: patch.notes?.trim() || null }),
  };
  const now = demoNowIso();
  Object.assign(expense, shared, patch.date !== undefined ? { date: patch.date } : {}, {
    amountCents, currency, exchangeRate, amountBaseCents, paidById, isShared: split !== null, splitMode: split?.mode ?? null,
    splits: split && weights ? buildSplits(split, weights, amountCents, amountBaseCents) : [], updatedAt: now,
  });
  if (patch.applyToGroup && expense.installment && Object.keys(shared).length) {
    for (const other of db.expenses.filter(e => e.installment?.groupId === expense.installment!.groupId)) Object.assign(other, shared, { updatedAt: now });
  }
  markDirty();
  return expense;
}

export function deleteExpense(db: MockDB, id: number, scope: 'single' | 'group', user: User): { deletedIds: number[] } {
  const expense = getExpense(db, id);
  if (!canModify(user, expense)) throw forbidden('Solo quien cargó o pagó el gasto (o un admin) puede borrarlo');
  const groupId = scope === 'group' ? expense.installment?.groupId : undefined;
  const deleted = db.expenses.filter(e => (groupId ? e.installment?.groupId === groupId : e.id === id));
  db.expenses = db.expenses.filter(e => !deleted.includes(e));
  markDirty();
  return { deletedIds: deleted.map(e => e.id) };
}

// ---------------------------------------------------------------------------
// Listado con filtros (mismos parámetros que GET /api/expenses)
// ---------------------------------------------------------------------------
export type ExpenseFilters = Record<string, string | number | boolean | undefined | null>;
const str = (v: unknown) => (v === undefined || v === null || v === '' || v === false ? undefined : String(v));

export function filterExpenses(db: MockDB, f: ExpenseFilters): Expense[] {
  const month = str(f.month), from = str(f.from), to = str(f.to), categoryId = str(f.categoryId), paidById = str(f.paidById), participantId = str(f.participantId), paymentMethodId = str(f.paymentMethodId), shared = str(f.shared), source = str(f.source), receiptId = str(f.receiptId), installments = str(f.installments), q = str(f.q)?.toLocaleLowerCase('es').trim();
  const range = month ? monthRange(month) : null;
  const rows = db.expenses.filter(e =>
    (!range || (e.date >= range.start && e.date < range.end)) &&
    (!from || e.date >= from) && (!to || e.date <= to) &&
    (!categoryId || (categoryId === 'none' ? e.categoryId === null : e.categoryId === Number(categoryId))) &&
    (!paidById || e.paidById === Number(paidById)) &&
    (!paymentMethodId || e.paymentMethodId === Number(paymentMethodId)) &&
    (!shared || e.isShared === (shared === 'true')) &&
    (!source || e.source === source) &&
    (!receiptId || e.receiptId === Number(receiptId)) &&
    (!installments || (installments === 'true') === !!e.installment) &&
    (!participantId || e.splits.some(s => s.userId === Number(participantId)) || (!e.isShared && e.paidById === Number(participantId))) &&
    (!q || `${e.description} ${e.merchant ?? ''} ${e.notes ?? ''}`.toLocaleLowerCase('es').includes(q)));
  const sort = str(f.sort) ?? 'date_desc';
  const compare: Record<string, (a: Expense, b: Expense) => number> = {
    date_desc: (a, b) => b.date.localeCompare(a.date) || b.id - a.id,
    date_asc: (a, b) => a.date.localeCompare(b.date) || a.id - b.id,
    amount_desc: (a, b) => b.amountBaseCents - a.amountBaseCents || b.id - a.id,
    amount_asc: (a, b) => a.amountBaseCents - b.amountBaseCents || a.id - b.id,
  };
  return rows.sort(compare[sort] ?? compare.date_desc);
}

/** Gastos parecidos (mismo monto y moneda, fecha cercana) para avisar posibles duplicados. */
export function findPossibleDuplicates(db: MockDB, amountCents: number, currency: string, date: string | null) {
  return db.expenses
    .filter(e => e.amountCents === amountCents && e.currency === currency && (!date || (e.date >= addDays(date, -3) && e.date <= addDays(date, 3))))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map(e => ({ id: e.id, description: e.description, amountCents: e.amountCents, date: e.date }));
}

/** Categoría más usada históricamente para un comercio (así "aprende" la IA del historial). */
export function categoryForMerchant(db: MockDB, merchant: string | null): number | null {
  if (!merchant) return null;
  const key = merchant.trim().toLowerCase();
  const counts = new Map<number, number>();
  for (const e of db.expenses) if (e.categoryId !== null && e.merchant?.trim().toLowerCase() === key) counts.set(e.categoryId, (counts.get(e.categoryId) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** CSV con `;` y coma decimal, como el backend: abre bien en Excel en español. */
export function expensesCsv(db: MockDB, rows: Expense[]): Blob {
  const cell = (value: unknown) => { let v = String(value ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`; return /[;"\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v; };
  const decimal = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
  const header = ['Fecha', 'Descripción', 'Comercio', 'Categoría', 'Monto', 'Moneda', 'Cotización', `Monto en ${db.settings.baseCurrency}`, 'Pagó', 'Medio de pago', 'Compartido', 'División', 'Cuota', 'Origen', 'Notas'];
  const sources: Record<ExpenseSource, string> = { manual: 'Manual', receipt: 'Comprobante (IA)', text: 'Texto (IA)', recurring: 'Gasto fijo' };
  const lines = rows.map(e => [
    e.date, e.description, e.merchant, db.categories.find(c => c.id === e.categoryId)?.name ?? 'Sin categoría', decimal(e.amountCents), e.currency, String(e.exchangeRate).replace('.', ','), decimal(e.amountBaseCents),
    db.users.find(u => u.id === e.paidById)?.name, db.methods.find(m => m.id === e.paymentMethodId)?.name, e.isShared ? 'Sí' : 'No',
    e.splits.map(s => `${db.users.find(u => u.id === s.userId)?.name}: ${decimal(s.amountBaseCents)}`).join(' / '), e.installment ? `${e.installment.number}/${e.installment.total}` : '', sources[e.source], e.notes,
  ].map(cell).join(';'));
  return new Blob(['﻿' + [header.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
}
