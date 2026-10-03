import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { demoMonth, demoToday } from '../mocks/clock';
let baseCurrency = 'UYU';
/** Moneda base del hogar; la fija App al cargar la configuración del servidor. */
export const setBaseCurrency = (currency: string) => { baseCurrency = currency; };
export const getBaseCurrency = () => baseCurrency;
let usdRate: number | null = null;
/** Cotización de referencia del hogar: unidades de la otra moneda (UYU) por 1 USD. */
export const setReferenceRate = (rate: number | null | undefined) => { usdRate = rate ?? null; };
/** Cotización de referencia de `currency` a la moneda base, o null si no hay (misma regla que el servidor). */
export const referenceRate = (currency: string = baseCurrency) => currency === baseCurrency ? 1 : !usdRate ? null : currency === 'USD' ? usdRate : baseCurrency === 'USD' && currency === 'UYU' ? 1 / usdRate : null;
export const referenceQuoteText = () => usdRate ? `1 USD = ${money(Math.round(usdRate * 100), baseCurrency === 'USD' ? 'UYU' : baseCurrency, true)}` : null;
/** Monedas ofrecidas en los formularios: la base y el dólar (o el peso uruguayo si la base es el dólar). */
export const currencyOptions = (base = baseCurrency) => [base, base === 'USD' ? 'UYU' : 'USD'];
export const currencyNames: Record<string, string> = { UYU: 'Pesos uruguayos', USD: 'Dólares estadounidenses', ARS: 'Pesos argentinos' };
export const currencySymbol = (currency = baseCurrency) => currency === 'USD' ? 'US$' : currency === 'UYU' || currency === 'ARS' ? '$' : currency;
export const money = (cents: number, currency = baseCurrency, decimals = false) => `${currencySymbol(currency)} ${new Intl.NumberFormat('es-UY', { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: decimals ? 2 : 0 }).format(cents / 100)}`;
export const amountText = (cents: number) => new Intl.NumberFormat('es-UY', { maximumFractionDigits: 2 }).format(cents / 100);
export const toCents = (value: string) => Math.round(Number(value.replace(/\./g, '').replace(',', '.')) * 100);
export const dateLabel = (date: string, pattern = "d 'de' MMMM") => format(parseISO(date), pattern, { locale: es });
export const monthLabel = (month: string, short = false) => dateLabel(`${month}-01`, short ? 'MMM yyyy' : 'MMMM yyyy');
/** Demo: el "hoy" es la fecha fija de la demo (src/mocks/clock.ts). */
export const today = () => demoToday();
export const currentMonth = () => demoMonth();
export const initials = (name: string) => name.split(' ').map(x => x[0]).slice(0, 2).join('');
export const percent = (n: number) => new Intl.NumberFormat('es-UY', { maximumFractionDigits: 1 }).format(n) + '%';
export const compact = (cents: number) => cents >= 100000000 ? `${currencySymbol()} ${(cents / 100000000).toFixed(1).replace('.', ',')} M` : cents >= 100000 ? `${currencySymbol()} ${Math.round(cents / 100000).toLocaleString('es-UY')} mil` : money(cents);
