import type { ExpenseInput, ExpenseSplit } from '../api/types';
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!weights.length || sum <= 0 || weights.some(w => !Number.isFinite(w) || w < 0)) throw new Error('Selecciona participantes e ingresa valores válidos.');
  const raw = weights.map(w => total * w / sum); const values = raw.map(Math.floor);
  const order = raw.map((n, i) => ({ i, remainder: n - values[i] })).sort((a, b) => b.remainder - a.remainder);
  const remainder = total - values.reduce((a, b) => a + b, 0);
  for (let k = 0; k < remainder; k++) values[order[k % order.length].i]++;
  return values;
}
export function calculateSplits(total: number, rate: number, split: ExpenseInput['split']): ExpenseSplit[] {
  if (!split) return [];
  const { mode, participants } = split;
  const weights = participants.map(p => mode === 'equal' ? 1 : p.value ?? 0);
  const sum = weights.reduce((a, b) => a + b, 0);
  if (mode === 'percentage' && Math.abs(sum - 100) > 0.001) throw new Error('Los porcentajes deben sumar 100%.');
  if (mode === 'exact' && sum !== total) throw new Error('Los montos deben sumar el total del gasto.');
  const amounts = allocate(total, weights); const base = allocate(Math.round(total * rate), weights);
  return participants.map((p, i) => ({ userId: p.userId, amountCents: amounts[i], amountBaseCents: base[i], value: mode === 'equal' ? null : p.value ?? 0 }));
}
