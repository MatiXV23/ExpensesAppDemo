import type { Balances, Debt, MemberBalance, Settlement, User } from '../../api/types';
import { demoNowIso, demoToday, isValidDate } from '../clock';
import { markDirty, nextId, type MockDB } from '../db';
import { badRequest, forbidden, notFound } from '../errors';

/** Saldos entre integrantes a partir de gastos compartidos y pagos registrados (port de balances.ts). */
export function computeBalances(db: MockDB, range: { from?: string; to?: string } = {}): Balances {
  const inRange = (date: string) => (!range.from || date >= range.from) && (!range.to || date <= range.to);
  const shared = db.expenses.filter(e => e.isShared && inRange(e.date));
  const settlements = db.settlements.filter(s => inRange(s.date));
  const members: MemberBalance[] = db.users.map(u => {
    const paidCents = shared.filter(e => e.paidById === u.id).reduce((a, e) => a + e.amountBaseCents, 0);
    const owedCents = shared.reduce((a, e) => a + (e.splits.find(s => s.userId === u.id)?.amountBaseCents ?? 0), 0);
    const settlementsSentCents = settlements.filter(s => s.fromUserId === u.id).reduce((a, s) => a + s.amountCents, 0);
    const settlementsReceivedCents = settlements.filter(s => s.toUserId === u.id).reduce((a, s) => a + s.amountCents, 0);
    return { userId: u.id, name: u.name, color: u.color, active: u.active, paidCents, owedCents, settlementsSentCents, settlementsReceivedCents, netCents: paidCents - owedCents + settlementsSentCents - settlementsReceivedCents };
  }).filter(m => m.active || m.paidCents || m.owedCents || m.netCents);
  return { members, debts: simplifyDebts(members) };
}

/** Minimiza la cantidad de transferencias necesarias para saldar todas las cuentas. */
export function simplifyDebts(members: Pick<MemberBalance, 'userId' | 'netCents'>[]): Debt[] {
  const creditors = members.filter(m => m.netCents > 0).map(m => ({ id: m.userId, amount: m.netCents })).sort((a, b) => b.amount - a.amount);
  const debtors = members.filter(m => m.netCents < 0).map(m => ({ id: m.userId, amount: -m.netCents })).sort((a, b) => b.amount - a.amount);
  const debts: Debt[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) debts.push({ fromUserId: debtors[i].id, toUserId: creditors[j].id, amountCents: amount });
    debtors[i].amount -= amount; creditors[j].amount -= amount;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return debts;
}

export const listSettlements = (db: MockDB, limit = 100) => [...db.settlements].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, limit);

export function createSettlement(db: MockDB, body: Pick<Settlement, 'fromUserId' | 'toUserId' | 'amountCents'> & { date?: string; note?: string | null }, user: User): Settlement {
  if (!Number.isInteger(body.amountCents) || body.amountCents <= 0) throw badRequest('Ingresa un monto mayor a cero.');
  if (body.fromUserId === body.toUserId) throw badRequest('Quien paga y quien recibe tienen que ser personas distintas');
  for (const id of [body.fromUserId, body.toUserId]) if (!db.users.some(u => u.id === id)) throw badRequest(`Integrante inexistente: ${id}`);
  if (body.date && !isValidDate(body.date)) throw badRequest('Elige una fecha válida.');
  const settlement: Settlement = { id: nextId(db, 'settlements'), fromUserId: body.fromUserId, toUserId: body.toUserId, amountCents: body.amountCents, date: body.date ?? demoToday(), note: body.note?.trim() || null, createdById: user.id, createdAt: demoNowIso() };
  db.settlements.push(settlement);
  markDirty();
  return settlement;
}

export function deleteSettlement(db: MockDB, id: number, user: User) {
  const row = db.settlements.find(s => s.id === id);
  if (!row) throw notFound('Pago');
  if (user.role !== 'admin' && ![row.createdById, row.fromUserId, row.toUserId].includes(user.id)) throw forbidden('Solo un admin o alguno de los involucrados puede borrar este pago');
  db.settlements = db.settlements.filter(s => s.id !== id);
  markDirty();
}
