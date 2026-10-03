import type { BudgetLine, BudgetsResponse } from '../../api/types';
import { monthRange } from '../clock';
import { markDirty, nextId, type MockDB } from '../db';
import { badRequest } from '../errors';

/**
 * Presupuestos vigentes en un mes: para cada categoría (y el total) rige el último valor definido
 * con effectiveFrom <= mes. Un monto 0 significa "sin presupuesto" (port de server/src/services/budgets.ts).
 */
export function effectiveBudgets(db: MockDB, month: string) {
  const map = new Map<number | null, { amountCents: number; effectiveFrom: string }>();
  for (const b of db.budgets.filter(b => b.effectiveFrom <= month).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.id - b.id)) map.set(b.categoryId, { amountCents: b.amountCents, effectiveFrom: b.effectiveFrom });
  for (const [k, v] of map) if (v.amountCents <= 0) map.delete(k);
  return map;
}

export function spentByCategory(db: MockDB, month: string) {
  const { start, end } = monthRange(month);
  const map = new Map<number | null, number>();
  for (const e of db.expenses) if (e.date >= start && e.date < end) map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + e.amountBaseCents);
  return map;
}

const line = (categoryId: number | null, budget: { amountCents: number; effectiveFrom: string }, spent: number): BudgetLine => ({
  categoryId, amountCents: budget.amountCents, effectiveFrom: budget.effectiveFrom, spentCents: spent,
  pct: budget.amountCents > 0 ? Math.round((spent / budget.amountCents) * 1000) / 10 : 0, remainingCents: budget.amountCents - spent,
});

export function getBudgets(db: MockDB, month: string): BudgetsResponse {
  const eff = effectiveBudgets(db, month);
  const spent = spentByCategory(db, month);
  const totalSpent = [...spent.values()].reduce((a, b) => a + b, 0);
  const total = eff.get(null);
  const lines = [...db.categories].sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id)).filter(c => eff.has(c.id)).map(c => line(c.id, eff.get(c.id)!, spent.get(c.id) ?? 0));
  return { month, total: total ? line(null, total, totalSpent) : null, categories: lines, categoriesSumCents: lines.reduce((a, l) => a + l.amountCents, 0) };
}

/** Define el presupuesto desde `month` en adelante (hasta que se cambie). */
export function setBudget(db: MockDB, month: string, categoryId: number | null, amountCents: number) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest('Elige un mes válido.');
  if (!Number.isInteger(amountCents) || amountCents < 0) throw badRequest('Ingresa un monto válido.');
  if (categoryId !== null && !db.categories.some(c => c.id === categoryId)) throw badRequest(`La categoría ${categoryId} no existe`);
  const existing = db.budgets.find(b => b.categoryId === categoryId && b.effectiveFrom === month);
  if (existing) existing.amountCents = amountCents;
  else db.budgets.push({ id: nextId(db, 'budgets'), categoryId, amountCents, effectiveFrom: month });
  markDirty();
}

/** Borra la definición hecha en ese mes exacto (vuelve a regir la anterior). */
export function deleteBudget(db: MockDB, month: string, categoryId: number | null) {
  const before = db.budgets.length;
  db.budgets = db.budgets.filter(b => !(b.categoryId === categoryId && b.effectiveFrom === month));
  markDirty();
  return db.budgets.length < before;
}
