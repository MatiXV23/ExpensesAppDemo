import type { Expense, Recurring, User } from '../../api/types';
import { addDays, addMonths, dayOfMonth, demoNowIso, demoToday, isValidDate } from '../clock';
import { markDirty, nextId, type DbRecurring, type MockDB } from '../db';
import { badRequest, forbidden, notFound } from '../errors';
import { createExpenses, referenceRate, splitWeights, type SplitInput } from './expenses';

export type RecurringInput = Omit<Recurring, 'id' | 'nextDate' | 'createdById' | 'createdAt'> & { nextDate?: string };

export function toRecurringDTO(r: DbRecurring): Recurring {
  const { anchorDay: _anchor, ...dto } = r;
  return dto;
}

export function nextOccurrence(r: Pick<DbRecurring, 'frequency' | 'interval' | 'anchorDay'>, date: string): string {
  switch (r.frequency) {
    case 'weekly': return addDays(date, 7 * r.interval);
    case 'monthly': return addMonths(date, r.interval, r.anchorDay);
    case 'yearly': return addMonths(date, 12 * r.interval, r.anchorDay);
  }
}

function validate(db: MockDB, data: { description?: string; mode: 'auto' | 'remind'; amountCents: number | null; currency: string; exchangeRate: number; split?: SplitInput | null; startDate: string; endDate?: string | null; interval: number; frequency: string }) {
  if (data.description !== undefined && !data.description.trim()) throw badRequest('Escribe una descripción.');
  if (!isValidDate(data.startDate)) throw badRequest('Elige una fecha válida.');
  if (!['weekly', 'monthly', 'yearly'].includes(data.frequency)) throw badRequest('Elige una frecuencia válida.');
  if (!Number.isInteger(data.interval) || data.interval < 1 || data.interval > 52) throw badRequest('Usa un intervalo entre 1 y 52.');
  if (data.amountCents !== null && (!Number.isInteger(data.amountCents) || data.amountCents <= 0)) throw badRequest('Ingresa un monto mayor a cero.');
  if (data.mode === 'auto' && data.amountCents == null) throw badRequest('Un gasto fijo automático necesita un monto fijo (o usa el modo recordatorio)');
  if (data.currency !== db.settings.baseCurrency && !(data.exchangeRate > 0)) throw badRequest('Indica la cotización para un gasto fijo en moneda extranjera');
  if (data.split) {
    if (data.split.mode === 'exact' && data.amountCents == null) throw badRequest('La división por montos exactos necesita un monto fijo');
    splitWeights(data.split, data.amountCents ?? 100);
  }
  if (data.endDate && data.endDate < data.startDate) throw badRequest('La fecha de fin es anterior al inicio');
}

export const listRecurring = (db: MockDB) => [...db.recurring].sort((a, b) => a.nextDate.localeCompare(b.nextDate) || a.id - b.id).map(toRecurringDTO);

function getRow(db: MockDB, id: number) {
  const row = db.recurring.find(r => r.id === id);
  if (!row) throw notFound('Gasto fijo');
  return row;
}
const canModify = (user: User, row: DbRecurring) => user.role === 'admin' || row.createdById === user.id || row.paidById === user.id;

export function createRecurring(db: MockDB, input: RecurringInput, user: User): Recurring {
  const currency = input.currency ?? db.settings.baseCurrency;
  const exchangeRate = currency === db.settings.baseCurrency ? 1 : input.exchangeRate ?? referenceRate(db, currency) ?? 0;
  // El formulario manda el primer vencimiento como nextDate; el backend lo toma de startDate.
  const startDate = input.nextDate ?? input.startDate;
  const data = { ...input, currency, exchangeRate, startDate, interval: input.interval ?? 1 };
  validate(db, data);
  const row: DbRecurring = {
    id: nextId(db, 'recurring'), description: input.description.trim(), merchant: input.merchant?.trim() || null, amountCents: input.amountCents, currency, exchangeRate,
    categoryId: input.categoryId ?? null, paidById: input.paidById ?? user.id, paymentMethodId: input.paymentMethodId ?? null, notes: input.notes ?? null,
    frequency: input.frequency, interval: data.interval, anchorDay: dayOfMonth(startDate), startDate, nextDate: startDate, endDate: input.endDate ?? null,
    mode: input.mode, split: input.split ?? null, active: input.active ?? true, createdById: user.id, createdAt: demoNowIso(),
  };
  db.recurring.push(row);
  markDirty();
  return toRecurringDTO(row);
}

export function updateRecurring(db: MockDB, id: number, patch: Partial<RecurringInput>, user: User): Recurring {
  const row = getRow(db, id);
  if (!canModify(user, row)) throw forbidden('Solo quien creó o paga el gasto fijo (o un admin) puede modificarlo');
  const merged = {
    description: patch.description ?? row.description,
    mode: patch.mode ?? row.mode,
    amountCents: patch.amountCents !== undefined ? patch.amountCents : row.amountCents,
    currency: patch.currency ?? row.currency,
    exchangeRate: patch.exchangeRate ?? row.exchangeRate,
    split: patch.split !== undefined ? patch.split : row.split,
    startDate: patch.startDate ?? row.startDate,
    endDate: patch.endDate !== undefined ? patch.endDate : row.endDate,
    interval: patch.interval ?? row.interval,
    frequency: patch.frequency ?? row.frequency,
  };
  if (merged.currency === db.settings.baseCurrency) merged.exchangeRate = 1;
  validate(db, merged);
  const startChanged = patch.startDate !== undefined && patch.startDate !== row.startDate;
  const nextChanged = !startChanged && patch.nextDate !== undefined && patch.nextDate !== row.nextDate;
  if (nextChanged && !isValidDate(patch.nextDate!)) throw badRequest('Elige una fecha válida.');
  Object.assign(row, {
    ...(patch.merchant !== undefined && { merchant: patch.merchant?.trim() || null }),
    ...(patch.categoryId !== undefined && { categoryId: patch.categoryId ?? null }),
    ...(patch.paidById !== undefined && { paidById: patch.paidById }),
    ...(patch.paymentMethodId !== undefined && { paymentMethodId: patch.paymentMethodId ?? null }),
    ...(patch.notes !== undefined && { notes: patch.notes }),
    ...(patch.active !== undefined && { active: patch.active }),
    ...(startChanged && { startDate: merged.startDate, nextDate: merged.startDate, anchorDay: dayOfMonth(merged.startDate) }),
    ...(nextChanged && { nextDate: patch.nextDate, anchorDay: dayOfMonth(patch.nextDate!) }),
    description: merged.description.trim(), frequency: merged.frequency, interval: merged.interval, mode: merged.mode, amountCents: merged.amountCents,
    currency: merged.currency, exchangeRate: merged.exchangeRate, split: merged.split ?? null, endDate: merged.endDate ?? null,
  });
  markDirty();
  return toRecurringDTO(row);
}

export function deleteRecurring(db: MockDB, id: number, user: User) {
  const row = getRow(db, id);
  if (!canModify(user, row)) throw forbidden('Solo quien creó o paga el gasto fijo (o un admin) puede eliminarlo');
  db.recurring = db.recurring.filter(r => r.id !== id);
  markDirty();
}

function advance(row: DbRecurring) {
  const next = nextOccurrence(row, row.nextDate);
  row.nextDate = next;
  if (row.endDate !== null && next > row.endDate) row.active = false;
}

function generate(db: MockDB, row: DbRecurring, user: User, amountCents: number, date: string, exchangeRate?: number): Expense[] {
  return createExpenses(db, {
    description: row.description, merchant: row.merchant, amountCents, currency: row.currency,
    exchangeRate: exchangeRate ?? (row.currency !== db.settings.baseCurrency ? referenceRate(db, row.currency) : null) ?? row.exchangeRate,
    date, categoryId: row.categoryId, paidById: row.paidById, paymentMethodId: row.paymentMethodId, notes: row.notes, split: row.split ?? null,
  }, user, { source: 'recurring', recurringId: row.id });
}

/** Registra la ocurrencia pendiente con el monto real y avanza al siguiente vencimiento. */
export function confirmRecurring(db: MockDB, id: number, body: { amountCents?: number; date?: string; exchangeRate?: number }, user: User): Expense[] {
  const row = getRow(db, id);
  if (!row.active) throw badRequest('El gasto fijo está pausado');
  const amount = body.amountCents ?? row.amountCents;
  if (!amount || !(amount > 0)) throw badRequest('Indica el monto de este mes');
  const created = generate(db, row, user, amount, body.date ?? row.nextDate, body.exchangeRate);
  advance(row);
  markDirty();
  return created;
}

export function skipRecurring(db: MockDB, id: number): Recurring {
  const row = getRow(db, id);
  advance(row);
  markDirty();
  return toRecurringDTO(row);
}

/** Recordatorios pendientes: modo recordatorio con vencimiento <= hoy + days. */
export const dueRecurring = (db: MockDB, days = 0) => db.recurring
  .filter(r => r.active && r.mode === 'remind' && r.nextDate <= addDays(demoToday(), days))
  .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
  .map(toRecurringDTO);

/** Ocurrencias futuras (aún no registradas) entre `from` y `to` inclusive. */
export function upcomingOccurrences(db: MockDB, from: string, to: string) {
  const out: { recurring: Recurring; date: string; amountBaseCents: number | null }[] = [];
  for (const r of db.recurring.filter(r => r.active)) {
    let date = r.nextDate;
    for (let guard = 0; date <= to && guard < 60; guard++) {
      if (r.endDate && date > r.endDate) break;
      if (date >= from) out.push({ recurring: toRecurringDTO(r), date, amountBaseCents: r.amountCents == null ? null : Math.round(r.amountCents * r.exchangeRate) });
      date = nextOccurrence(r, date);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Genera los gastos de los fijos automáticos vencidos (en la app real lo hace el servidor cada hora).
 * Devuelve las descripciones de lo que registró.
 */
export function processDueRecurring(db: MockDB, today = demoToday()): string[] {
  const generated: string[] = [];
  for (const row of db.recurring.filter(r => r.active && r.mode === 'auto' && r.nextDate <= today)) {
    const owner = db.users.find(u => u.id === row.createdById) ?? db.users.find(u => u.role === 'admin');
    if (!owner) continue;
    for (let guard = 0; row.active && row.nextDate <= today && guard < 36; guard++) {
      if (row.endDate && row.nextDate > row.endDate) { row.active = false; break; }
      try {
        generate(db, row, owner, row.amountCents!, row.nextDate);
        generated.push(row.description);
      } catch {
        row.active = false; // como el backend: si no se puede generar, se pausa
        break;
      }
      advance(row);
    }
    markDirty();
  }
  return generated;
}
