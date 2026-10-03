import type { CategoryTotal, Expense, Insight, MonthSummary, Trends } from '../../api/types';
import { addDays, addMonthsToMonth, dayOfMonth, demoMonth, demoToday, formatDate, monthDays, monthRange, monthsBetween, weekday } from '../clock';
import type { MockDB } from '../db';
import { effectiveBudgets } from './budgets';
import { dueRecurring, upcomingOccurrences } from './recurring';

// Port de server/src/services/analytics.ts sobre los datos en memoria.
const UNCATEGORIZED = { name: 'Sin categoría', icon: 'Shapes', color: '#9da5a7' };

const monthRows = (db: MockDB, month: string) => { const { start, end } = monthRange(month); return db.expenses.filter(e => e.date >= start && e.date < end); };
function sumBy<T>(rows: T[], key: (r: T) => string | number | null, value: (r: T) => number) {
  const map = new Map<string | number | null, number>();
  for (const r of rows) map.set(key(r), (map.get(key(r)) ?? 0) + value(r));
  return map;
}
const pctChange = (current: number, previous: number) => (previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null);
const isFixed = (e: Expense) => e.source === 'recurring' || e.installment !== null;

/** Promedio mensual de gasto variable (sin fijos ni cuotas) de los `n` meses previos con datos. */
function variableHistoryAverage(db: MockDB, month: string, n: number): number | null {
  const start = `${addMonthsToMonth(month, -n)}-01`;
  const totals = sumBy(db.expenses.filter(e => e.date >= start && e.date < `${month}-01` && !isFixed(e)), e => e.date.slice(0, 7), e => e.amountBaseCents);
  if (!totals.size) return null;
  return [...totals.values()].reduce((a, b) => a + b, 0) / totals.size;
}

export function monthSummary(db: MockDB, month: string): MonthSummary {
  const rows = monthRows(db, month);
  const prevMonth = addMonthsToMonth(month, -1);
  const prevRows = monthRows(db, prevMonth);
  const isCurrent = month === demoMonth();
  const todayStr = demoToday();
  const days = monthDays(month);
  const elapsedDays = isCurrent ? dayOfMonth(todayStr) : month < demoMonth() ? days : 0;
  const total = rows.reduce((a, r) => a + r.amountBaseCents, 0);
  const prevTotal = prevRows.reduce((a, r) => a + r.amountBaseCents, 0);

  // Comparación justa para el mes en curso: mes anterior hasta el mismo día.
  let prevToDate: number | null = null;
  if (isCurrent) {
    const cutoff = formatDate(Number(prevMonth.slice(0, 4)), Number(prevMonth.slice(5, 7)), Math.min(elapsedDays, monthDays(prevMonth)));
    prevToDate = prevRows.filter(r => r.date <= cutoff).reduce((a, r) => a + r.amountBaseCents, 0);
  }
  const totalToDate = isCurrent ? rows.filter(r => r.date <= todayStr).reduce((a, r) => a + r.amountBaseCents, 0) : total;
  const sameMonthLastYear = monthRows(db, addMonthsToMonth(month, -12)).reduce((a, r) => a + r.amountBaseCents, 0);

  const budgets = effectiveBudgets(db, month);
  const catBudgetSum = [...budgets.entries()].filter(([k]) => k !== null).reduce((a, [, v]) => a + v.amountCents, 0);
  const budgetCents = budgets.get(null)?.amountCents ?? (catBudgetSum > 0 ? catBudgetSum : null);

  // Proyección a fin de mes: fijos + cuotas + fijos que todavía vencen + ritmo del gasto variable.
  let projection: number | null = null;
  if (isCurrent) {
    const fixed = rows.filter(isFixed).reduce((a, r) => a + r.amountBaseCents, 0);
    const variableToDate = rows.filter(r => !isFixed(r) && r.date <= todayStr).reduce((a, r) => a + r.amountBaseCents, 0);
    const variableFuture = rows.filter(r => !isFixed(r) && r.date > todayStr).reduce((a, r) => a + r.amountBaseCents, 0);
    const upcoming = upcomingOccurrences(db, addDays(todayStr, 1), addDays(monthRange(month).end, -1)).reduce((a, o) => a + (o.amountBaseCents ?? 0), 0);
    const pace = (variableToDate / Math.max(elapsedDays, 1)) * days;
    const history = variableHistoryAverage(db, month, 3);
    const weight = elapsedDays / days;
    const variableProjection = history === null ? pace : weight * pace + (1 - weight) * history;
    projection = Math.round(fixed + variableFuture + upcoming + Math.max(variableProjection, variableToDate));
  }

  const catById = new Map(db.categories.map(c => [c.id, c]));
  const byCat = sumBy(rows, r => r.categoryId, r => r.amountBaseCents);
  const countByCat = sumBy(rows, r => r.categoryId, () => 1);
  const prevByCat = sumBy(prevRows, r => r.categoryId, r => r.amountBaseCents);
  const catIds = new Set<number | null>([...byCat.keys(), ...prevByCat.keys()] as (number | null)[]);
  for (const k of budgets.keys()) if (k !== null) catIds.add(k);
  const byCategory: CategoryTotal[] = [...catIds].map(id => {
    const c = id === null ? null : catById.get(id);
    const t = byCat.get(id) ?? 0;
    return { categoryId: id, name: c?.name ?? UNCATEGORIZED.name, icon: c?.icon ?? UNCATEGORIZED.icon, color: c?.color ?? UNCATEGORIZED.color, totalCents: t, pct: total > 0 ? Math.round((t / total) * 1000) / 10 : 0, budgetCents: id === null ? null : budgets.get(id)?.amountCents ?? null, previousCents: prevByCat.get(id) ?? 0, count: countByCat.get(id) ?? 0 };
  }).sort((a, b) => b.totalCents - a.totalCents || b.previousCents - a.previousCents);

  // Por integrante: lo que pagó contra lo que le correspondía (su parte).
  const paidBy = sumBy(rows, r => r.paidById, r => r.amountBaseCents);
  const share = new Map<number, number>();
  for (const r of rows) {
    if (r.isShared) for (const s of r.splits) share.set(s.userId, (share.get(s.userId) ?? 0) + s.amountBaseCents);
    else share.set(r.paidById, (share.get(r.paidById) ?? 0) + r.amountBaseCents);
  }
  const byMember = db.users.map(u => ({ userId: u.id, name: u.name, color: u.color, paidCents: paidBy.get(u.id) ?? 0, shareCents: share.get(u.id) ?? 0, active: u.active }))
    .filter(m => m.paidCents || m.shareCents || m.active).map(({ active: _a, ...m }) => m);

  const byPm = sumBy(rows, r => r.paymentMethodId, r => r.amountBaseCents);
  const byPaymentMethod = [...byPm.entries()].map(([id, t]) => { const pm = db.methods.find(p => p.id === id); return { paymentMethodId: id as number | null, name: pm?.name ?? 'Sin especificar', type: pm?.type ?? null, totalCents: t }; }).sort((a, b) => b.totalCents - a.totalCents);

  const byWd = sumBy(rows, r => weekday(r.date), r => r.amountBaseCents);
  const byDay = sumBy(rows, r => r.date, r => r.amountBaseCents);
  let cumulative = 0;
  const daily = Array.from({ length: days }, (_, i) => { const date = `${month}-${String(i + 1).padStart(2, '0')}`; const t = byDay.get(date) ?? 0; cumulative += t; return { date, totalCents: t, cumulativeCents: cumulative }; });

  const merchants = new Map<string, { merchant: string; totalCents: number; count: number }>();
  for (const r of rows) {
    if (!r.merchant) continue;
    const key = r.merchant.trim().toLowerCase();
    const m = merchants.get(key) ?? { merchant: r.merchant.trim(), totalCents: 0, count: 0 };
    m.totalCents += r.amountBaseCents; m.count += 1; merchants.set(key, m);
  }

  return {
    month, currency: db.settings.baseCurrency, isCurrentMonth: isCurrent, totalCents: total, expenseCount: rows.length, previousMonthTotalCents: prevTotal, previousMonthToDateCents: prevToDate,
    changePct: isCurrent ? pctChange(totalToDate, prevToDate ?? 0) : pctChange(total, prevTotal), sameMonthLastYearCents: sameMonthLastYear, budgetCents,
    budgetUsedPct: budgetCents ? Math.round((total / budgetCents) * 1000) / 10 : null, projectionCents: projection, dailyAverageCents: elapsedDays > 0 ? Math.round(totalToDate / elapsedDays) : 0,
    sharedTotalCents: rows.filter(r => r.isShared).reduce((a, r) => a + r.amountBaseCents, 0), byCategory, byMember, byPaymentMethod,
    byWeekday: [0, 1, 2, 3, 4, 5, 6].map(d => ({ weekday: d, totalCents: byWd.get(d) ?? 0 })), daily,
    topMerchants: [...merchants.values()].sort((a, b) => b.totalCents - a.totalCents).slice(0, 8),
    largestExpenses: [...rows].sort((a, b) => b.amountBaseCents - a.amountBaseCents).slice(0, 5),
  };
}

/** Evolución mensual por categoría (clave "none" para gastos sin categoría). */
export function trends(db: MockDB, from: string, to: string): Trends {
  const start = `${from}-01`, end = monthRange(to).end;
  const rows = db.expenses.filter(e => e.date >= start && e.date < end);
  const months = monthsBetween(from, to).map(m => {
    const mRows = rows.filter(r => r.date.startsWith(m));
    const byCategory: Record<string, number> = {};
    for (const r of mRows) { const k = r.categoryId === null ? 'none' : String(r.categoryId); byCategory[k] = (byCategory[k] ?? 0) + r.amountBaseCents; }
    const byMember: Record<string, number> = {};
    for (const r of mRows) {
      if (r.isShared) for (const s of r.splits) byMember[s.userId] = (byMember[s.userId] ?? 0) + s.amountBaseCents;
      else byMember[r.paidById] = (byMember[r.paidById] ?? 0) + r.amountBaseCents;
    }
    return { month: m, totalCents: mRows.reduce((a, r) => a + r.amountBaseCents, 0), count: mRows.length, byCategory, byMember };
  });
  const catTotals = sumBy(rows, r => r.categoryId, r => r.amountBaseCents);
  const categories = [...catTotals.entries()].map(([id, t]) => { const c = db.categories.find(c => c.id === id); return { categoryId: id as number | null, name: c?.name ?? UNCATEGORIZED.name, color: c?.color ?? UNCATEGORIZED.color, icon: c?.icon ?? UNCATEGORIZED.icon, totalCents: t }; }).sort((a, b) => b.totalCents - a.totalCents);
  const withData = months.filter(m => m.count > 0);
  return { currency: db.settings.baseCurrency, months, categories, averageMonthlyCents: withData.length ? Math.round(withData.reduce((a, m) => a + m.totalCents, 0) / withData.length) : 0 };
}

export const formatMoney = (db: MockDB, cents: number) => new Intl.NumberFormat('es-UY', { style: 'currency', currency: db.settings.baseCurrency, maximumFractionDigits: 0 }).format(cents / 100);

/** Alertas automáticas del mes (reglas, sin IA). */
export function insights(db: MockDB, month: string): Insight[] {
  const fmt = (cents: number) => formatMoney(db, cents);
  const summary = monthSummary(db, month);
  const out: Insight[] = [];
  if (summary.budgetCents) {
    if (summary.totalCents > summary.budgetCents) out.push({ type: 'over_budget', severity: 'danger', title: 'Presupuesto mensual superado', message: `Llevas ${fmt(summary.totalCents)} de un presupuesto de ${fmt(summary.budgetCents)} (${summary.budgetUsedPct}%).`, link: '/budgets' });
    else if (summary.projectionCents && summary.projectionCents > summary.budgetCents) out.push({ type: 'projection_over_budget', severity: 'warning', title: 'A este ritmo vas a superar el presupuesto', message: `La proyección a fin de mes es ${fmt(summary.projectionCents)} y el presupuesto es ${fmt(summary.budgetCents)}.`, link: '/budgets' });
  }
  for (const c of summary.byCategory) {
    if (!c.budgetCents) continue;
    const pct = (c.totalCents / c.budgetCents) * 100;
    if (pct > 100) out.push({ type: 'over_budget', severity: 'danger', title: `Superaste el presupuesto de ${c.name}`, message: `Gastaste ${fmt(c.totalCents)} de ${fmt(c.budgetCents)} (${Math.round(pct)}%).`, link: `/expenses?categoryId=${c.categoryId}`, data: { categoryId: c.categoryId } });
    else if (pct >= 80) out.push({ type: 'near_budget', severity: 'warning', title: `${c.name}: ${Math.round(pct)}% del presupuesto`, message: `Te quedan ${fmt(c.budgetCents - c.totalCents)} para el resto del mes.`, link: `/expenses?categoryId=${c.categoryId}`, data: { categoryId: c.categoryId } });
  }
  // Subas por categoría contra el mes anterior (hasta el mismo día si es el mes en curso).
  const cutoffDay = summary.isCurrentMonth ? dayOfMonth(demoToday()) : 31;
  const prevByCat = sumBy(monthRows(db, addMonthsToMonth(month, -1)).filter(r => dayOfMonth(r.date) <= cutoffDay), r => r.categoryId, r => r.amountBaseCents);
  const threshold = Math.max(summary.totalCents * 0.05, 1);
  for (const c of summary.byCategory) {
    const prev = prevByCat.get(c.categoryId) ?? 0;
    if (prev <= 0 || c.totalCents <= prev) continue;
    const change = ((c.totalCents - prev) / prev) * 100;
    if (change >= 30 && c.totalCents - prev >= threshold) out.push({ type: 'category_spike', severity: 'warning', title: `${c.name} subió ${Math.round(change)}%`, message: `${fmt(c.totalCents)} contra ${fmt(prev)} en el mismo período del mes anterior.`, link: `/expenses?categoryId=${c.categoryId ?? 'none'}`, data: { categoryId: c.categoryId, changePct: Math.round(change) } });
  }
  // Gastos inusuales: más de 2,5 veces el promedio de su categoría en los últimos 6 meses.
  const sixMonthsAgo = `${addMonthsToMonth(month, -6)}-01`;
  const history = db.expenses.filter(e => e.date >= sixMonthsAgo && e.date < `${month}-01` && !e.installment);
  const avgByCat = new Map<number | null, number>();
  for (const [id, n] of sumBy(history, e => e.categoryId, () => 1)) if (n >= 3) avgByCat.set(id as number | null, (sumBy(history, e => e.categoryId, e => e.amountBaseCents).get(id) ?? 0) / n);
  const catNames = new Map(summary.byCategory.map(c => [c.categoryId, c.name]));
  monthRows(db, month).filter(r => { const avg = avgByCat.get(r.categoryId); return avg && !r.installment && r.amountBaseCents > avg * 2.5 && r.amountBaseCents >= threshold; })
    .sort((a, b) => b.amountBaseCents - a.amountBaseCents).slice(0, 3)
    .forEach(r => out.push({ type: 'unusual_expense', severity: 'info', title: `Gasto inusual: ${fmt(r.amountBaseCents)} en ${catNames.get(r.categoryId) ?? 'Sin categoría'}`, message: `"${r.description}" es bastante más alto que lo habitual para esa categoría.`, link: `/expenses/${r.id}`, data: { expenseId: r.id } }));
  // Recordatorios de gastos fijos y comprobantes pendientes (siempre referidos a hoy).
  const due = dueRecurring(db, 3);
  if (due.length) out.push({ type: 'recurring_due', severity: due.some(d => d.nextDate < demoToday()) ? 'warning' : 'info', title: due.length === 1 ? `Vence: ${due[0].description}` : `${due.length} gastos fijos por confirmar`, message: due.map(d => `${d.description} (${d.nextDate.slice(8, 10)}/${d.nextDate.slice(5, 7)})`).join(', '), link: '/recurring' });
  const pending = db.receipts.filter(r => r.status === 'needs_review').length;
  if (pending) out.push({ type: 'pending_receipts', severity: 'info', title: pending === 1 ? '1 comprobante esperando revisión' : `${pending} comprobantes esperando revisión`, message: 'Revisa y confirma los gastos detectados por la IA.', link: '/receipts' });
  const order = { danger: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
