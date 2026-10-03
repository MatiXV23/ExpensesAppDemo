/**
 * Reloj de la demo. El "hoy" está fijo para que los datos de ejemplo siempre se vean completos
 * y las capturas coincidan con lo que ve cada visitante. Cambiarlo acá alcanza: los datos semilla
 * se generan relativos a esta fecha.
 */
export const DEMO_TODAY = '2026-10-18';

const pad = (n: number) => String(n).padStart(2, '0');

export const demoToday = () => DEMO_TODAY;
export const demoMonth = () => DEMO_TODAY.slice(0, 7);

/** Timestamp ISO con la fecha de la demo y la hora real del navegador. */
export function demoNowIso(): string {
  const now = new Date();
  const [y, m, d] = DEMO_TODAY.split('-').map(Number);
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).toISOString();
}

// Helpers de fechas (mismas reglas que el backend: server/src/lib/dates.ts)
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function parts(date: string): [number, number, number] {
  return [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))];
}
export function formatDate(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}
export function isValidDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}
/** Suma meses respetando el día ancla (31/01 + 1 mes = 28/02 o 29/02). */
export function addMonths(date: string, months: number, anchorDay?: number): string {
  const [y, m, d] = parts(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return formatDate(ny, nm, Math.min(anchorDay ?? d, daysInMonth(ny, nm)));
}
export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return formatDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
export const addMonthsToMonth = (month: string, n: number) => addMonths(`${month}-01`, n).slice(0, 7);
export const monthRange = (month: string) => ({ start: `${month}-01`, end: addMonths(`${month}-01`, 1) });
export const monthDays = (month: string) => daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
export const dayOfMonth = (date: string) => Number(date.slice(8, 10));
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let cur = from; cur <= to && out.length < 240; cur = addMonthsToMonth(cur, 1)) out.push(cur);
  return out;
}
export function weekday(date: string): number {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
