import type { ExpenseDraft, ExpenseInput, PaymentMethodType, ReceiptItem } from '../../api/types';
import { addDays, demoToday } from '../clock';
import type { DbReceipt, MockDB } from '../db';
import { monthSummary, insights, formatMoney } from './analytics';
import { computeBalances } from './balances';
import { categoryForMerchant, findPossibleDuplicates } from './expenses';

/**
 * IA simulada. En la app real, Claude lee la imagen o el PDF y propone los gastos.
 * Acá no hay IA: cada archivo se asocia a una "plantilla de lectura" según su nombre
 * y se arma una propuesta verosímil que la persona revisa antes de confirmar, igual que en la app real.
 */
export const SIMULATED_MODEL = 'Claude (simulado)';

interface DraftSpec { description: string; merchant: string | null; pesos: number; currency?: string; daysAgo: number; category: string; method?: PaymentMethodType | null; confidence: ExpenseDraft['confidence']; notes?: string | null; items?: [string, number | null, number | null][]; installments?: number }
interface Reading { documentType: DbReceipt['documentType']; summary: string; drafts: DraftSpec[] }

const READINGS: Record<string, Reading> = {
  'ticket-tienda-inglesa': { documentType: 'receipt', summary: 'Ticket de supermercado de Tienda Inglesa con 12 artículos, pagado con tarjeta de débito.', drafts: [{ description: 'Compra semanal', merchant: 'Tienda Inglesa', pesos: 3284, daysAgo: 1, category: 'Supermercado', method: 'debit', confidence: 'high', items: [['Milanesas de pollo (kg)', 1, 689], ['Arroz 1 kg', 2, 136], ['Fideos', 3, 177], ['Aceite de girasol 1 L', 1, 149], ['Yogur bebible', 4, 196], ['Manzanas (kg)', 1, 189], ['Café molido 500 g', 1, 398], ['Galletitas', 3, 186], ['Jabón líquido para ropa', 1, 549], ['Dulce de leche', 1, 168], ['Agua mineral 6 L', 2, 152], ['Queso rallado', 1, 295]] }] },
  'ticket-disco': { documentType: 'receipt', summary: 'Ticket de supermercado de Disco con 9 artículos, pagado con tarjeta de débito.', drafts: [{ description: 'Compra del súper', merchant: 'Disco', pesos: 2947.5, daysAgo: 1, category: 'Supermercado', method: 'debit', confidence: 'high', items: [['Leche entera 1 L', 4, 236], ['Yerba 1 kg', 1, 389], ['Pan flauta', 2, 98], ['Queso colonia', 1, 412.5], ['Bananas (kg)', 1, 129], ['Detergente', 1, 185], ['Pollo entero', 1, 498], ['Vino tinto Tannat', 1, 590], ['Papel higiénico x12', 1, 410]] }] },
  'factura-ute': { documentType: 'invoice', summary: 'Factura de UTE por el consumo de setiembre a octubre. Vence el 30/10.', drafts: [{ description: 'Factura de luz', merchant: 'UTE', pesos: 3412, daysAgo: 2, category: 'Servicios', method: null, confidence: 'high', notes: 'Período 14/09 al 13/10 · Vence el 30/10 · Factura A-1234567', items: [['Cargo fijo', null, 412.4], ['Energía 312 kWh', null, 2385.3], ['IVA', null, 614.3]] }] },
  'captura-tarjeta': { documentType: 'bank_screenshot', summary: 'Captura de los movimientos de la tarjeta de crédito: 4 compras, una de ellas en dólares.', drafts: [
    { description: 'Carga de nafta', merchant: 'ANCAP', pesos: 2480, daysAgo: 1, category: 'Transporte', method: 'credit', confidence: 'high' },
    { description: 'Cine', merchant: 'Movie Montevideo Shopping', pesos: 1360, daysAgo: 1, category: 'Ocio', method: 'credit', confidence: 'high' },
    { description: 'Ferretería', merchant: 'Ferretería Americana', pesos: 640, daysAgo: 2, category: 'Hogar', method: 'credit', confidence: 'medium' },
    { description: 'Spotify Premium', merchant: 'Spotify', pesos: 8.99, currency: 'USD', daysAgo: 3, category: 'Suscripciones', method: 'credit', confidence: 'medium', notes: 'Compra en dólares: se convierte con la cotización de referencia' },
  ] },
  'captura-banco': { documentType: 'bank_screenshot', summary: 'Captura de home banking con 3 movimientos con tarjeta de débito.', drafts: [
    { description: 'Farmacia', merchant: 'Farmashop', pesos: 1245, daysAgo: 2, category: 'Salud', method: 'debit', confidence: 'high' },
    { description: 'Viaje en Uber', merchant: 'Uber', pesos: 389, daysAgo: 2, category: 'Transporte', method: 'debit', confidence: 'medium' },
    { description: 'Pedido de comida', merchant: 'PedidosYa', pesos: 1120, daysAgo: 3, category: 'Delivery', method: 'debit', confidence: 'low', notes: '¿Fue para compartir? La captura no lo dice' },
  ] },
  'blurry-retry': { documentType: 'receipt', summary: 'La foto tiene poca nitidez: se leyó el total, pero no el detalle de los artículos.', drafts: [{ description: 'Pizza y empanadas', merchant: 'Pizzería Trouville', pesos: 1640, daysAgo: 4, category: 'Delivery', method: 'wallet', confidence: 'low', notes: 'Revisa el monto: la foto estaba movida' }] },
  // Archivos propios del visitante: la demo no puede leer su contenido, así que propone un ejemplo según el nombre.
  supermercado: { documentType: 'receipt', summary: 'Lectura simulada: esta demo no tiene IA real, así que propone un gasto de ejemplo según el nombre del archivo. En la app real, Claude lee el comprobante.', drafts: [{ description: 'Compra del súper', merchant: 'Tienda Inglesa', pesos: 1890, daysAgo: 0, category: 'Supermercado', method: 'debit', confidence: 'medium', items: [['Frutas y verduras', 1, 540], ['Lácteos', 3, 610], ['Almacén', 4, 740]] }] },
  restaurante: { documentType: 'receipt', summary: 'Lectura simulada: esta demo no tiene IA real, así que propone un gasto de ejemplo. En la app real, Claude lee el comprobante.', drafts: [{ description: 'Cena', merchant: 'Parrilla El Fogón', pesos: 2350, daysAgo: 0, category: 'Delivery', method: 'credit', confidence: 'medium' }] },
  servicio: { documentType: 'invoice', summary: 'Lectura simulada: parece una factura de servicios. En la app real, Claude lee el período, el vencimiento y el monto.', drafts: [{ description: 'Factura de agua', merchant: 'OSE', pesos: 1240, daysAgo: 0, category: 'Servicios', method: null, confidence: 'medium', notes: 'Vence a fin de mes' }] },
  farmacia: { documentType: 'receipt', summary: 'Lectura simulada: esta demo no tiene IA real, así que propone un gasto de ejemplo. En la app real, Claude lee el comprobante.', drafts: [{ description: 'Farmacia', merchant: 'Farmacia San Roque', pesos: 860, daysAgo: 0, category: 'Salud', method: 'debit', confidence: 'medium' }] },
  generico: { documentType: 'other', summary: 'Lectura simulada: esta demo no tiene IA real y no puede leer tu archivo, así que propone un gasto de ejemplo para que pruebes la revisión. Corrige los datos antes de confirmar.', drafts: [{ description: 'Gasto del comprobante', merchant: null, pesos: 1500, daysAgo: 0, category: 'Otros', method: null, confidence: 'low' }] },
};

/** Elige la plantilla de lectura según el nombre del archivo. */
export function readingFor(fileName: string): string {
  const name = fileName.toLowerCase();
  const exact = Object.keys(READINGS).find(k => name.startsWith(`ejemplo-${k}`));
  if (exact) return exact;
  if (/banco|brou|itau|ita[uú]|santander|scotia|captura|screenshot|movimiento|prex|tarjeta/.test(name)) return 'captura-banco';
  if (/ute|luz|ose|agua|antel|factura|invoice|gas/.test(name)) return 'servicio';
  if (/farma|remedio|receta/.test(name)) return 'farmacia';
  if (/pizza|resto|bar|cena|almuerzo|pedido|delivery|comida/.test(name)) return 'restaurante';
  if (/super|tienda|disco|devoto|ta-?ta|ticket|compra|feria/.test(name)) return 'supermercado';
  return 'generico';
}

const cents = (pesos: number) => Math.round(pesos * 100);

function methodFor(db: MockDB, userId: number, type: PaymentMethodType | null | undefined): number | null {
  if (!type) return null;
  const active = db.methods.filter(m => !m.archived && m.type === type);
  return (active.find(m => m.ownerId === userId) ?? active.find(m => m.ownerId === null) ?? active[0])?.id ?? null;
}
const categoryByName = (db: MockDB, prefix: string) => db.categories.find(c => !c.archived && c.name.toLowerCase().startsWith(prefix.toLowerCase()))?.id ?? null;

/** Sugiere dividir entre todos si en el historial esa categoría casi siempre se comparte. */
function splitFromHistory(db: MockDB, categoryId: number | null): ExpenseInput['split'] {
  if (categoryId === null) return null;
  const rows = db.expenses.filter(e => e.categoryId === categoryId).slice(-20);
  if (rows.length < 3 || rows.filter(e => e.isShared).length / rows.length < 0.6) return null;
  return { mode: 'equal', participants: db.users.filter(u => u.active).map(u => ({ userId: u.id })) };
}

function buildDraft(db: MockDB, spec: DraftSpec, uploaderId: number): ExpenseDraft {
  const amountCents = cents(spec.pesos);
  const currency = spec.currency ?? db.settings.baseCurrency;
  const date = addDays(demoToday(), -spec.daysAgo);
  // Como el backend: si el comercio ya se usó, gana la categoría del historial.
  const categoryId = categoryForMerchant(db, spec.merchant) ?? categoryByName(db, spec.category);
  const items: ReceiptItem[] = (spec.items ?? []).map(([description, quantity, pesos]) => ({ description, quantity, amountCents: pesos === null ? null : cents(pesos) }));
  return { description: spec.description, merchant: spec.merchant, amountCents, currency, date, categoryId, paymentMethodId: methodFor(db, uploaderId, spec.method), paidById: null, installments: spec.installments ?? 1, confidence: spec.confidence, notes: spec.notes ?? null, split: splitFromHistory(db, categoryId), items, possibleDuplicates: findPossibleDuplicates(db, amountCents, currency, date) };
}

export function readReceipt(db: MockDB, template: string, uploaderId: number) {
  const reading = READINGS[template] ?? READINGS.generico;
  return { documentType: reading.documentType, summary: reading.summary, drafts: reading.drafts.map(d => buildDraft(db, d, uploaderId)) };
}

// ---------------------------------------------------------------------------
// Carga rápida por texto
// ---------------------------------------------------------------------------
const CATEGORY_KEYWORDS: [RegExp, string, string][] = [
  [/s[uú]per|tienda inglesa|disco|devoto|ta-?ta|macro|almac[eé]n|feria|verduler|carnicer/, 'Supermercado', 'Compra del súper'],
  [/\bute\b|\bluz\b/, 'Servicios', 'Factura de luz'],
  [/\bose\b|\bagua\b/, 'Servicios', 'Factura de agua'],
  [/\bgas\b|supergas/, 'Servicios', 'Gas'],
  [/antel|internet|fibra|celular|claro|movistar/, 'Internet', 'Internet y telefonía'],
  [/alquiler/, 'Alquiler', 'Alquiler'],
  [/gastos comunes|expensas/, 'Alquiler', 'Gastos comunes'],
  [/nafta|ancap|petrobras|axion|combustible/, 'Transporte', 'Carga de nafta'],
  [/uber|taxi|cabify|stm|[oó]mnibus|bondi|peaje/, 'Transporte', 'Transporte'],
  [/farmacia|farmashop|remedio|m[eé]dic|mutualista|dentista|consulta/, 'Salud', 'Salud'],
  [/curso|facultad|libro|colegio|clase/, 'Educación', 'Educación'],
  [/pizza|chivito|sushi|empanada|pedidosya|pedidos ya|delivery|restaurante|resto|cena|almuerzo|bar\b|caf[eé]|helado/, 'Delivery', 'Comida'],
  [/ferreter|limpieza|bazar|arreglo|plomero|sodimac|mueble|tele\b|televisor|heladera|lavarropas|aire acondicionado|colch[oó]n/, 'Hogar', 'Cosas para la casa'],
  [/perro|gato|veterinari|toby|mascota|raci[oó]n/, 'Mascotas', 'Mascotas'],
  [/netflix|spotify|disney|hbo|max\b|youtube|suscrip/, 'Suscripciones', 'Suscripción'],
  [/cine|teatro|salida|partido|recital|entradas|show/, 'Ocio', 'Salida'],
];
const METHOD_KEYWORDS: [RegExp, PaymentMethodType | string][] = [
  [/efectivo|cash/, 'cash'], [/d[eé]bito/, 'debit'], [/cr[eé]dito|tarjeta/, 'credit'], [/transfer/, 'transfer'], [/billetera|mercado ?pago|prex|midinero/, 'wallet'],
];

function parseAmount(text: string): { cents: number; raw: string } | null {
  const match = text.match(/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(mil|k)?\b/i);
  if (!match) return null;
  const raw = match[1];
  let value: number;
  if (/^\d{1,3}(\.\d{3})+/.test(raw)) value = Number(raw.replace(/\./g, '').replace(',', '.'));
  else value = Number(raw.replace(',', '.'));
  if (match[2]) value *= 1000;
  return Number.isFinite(value) && value > 0 ? { cents: Math.round(value * 100), raw: match[0] } : null;
}

/** Minúsculas y sin tildes, para comparar "Matías" con "matias" o "débito" con "debito". */
const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const hasWord = (text: string, word: string) => new RegExp(`(^|[^a-z0-9])${fold(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(text);
const GENERIC_METHOD_WORDS = /^(debito|credito|tarjeta|transferencia|billetera|virtual|mercado|pago|de|del)$/;

function parseOne(db: MockDB, text: string, me: number): ExpenseDraft | null {
  const t = fold(text);
  const amount = parseAmount(text);
  if (!amount) return null;
  const users = db.users.filter(u => u.active);
  const currency = /usd|u\$s|us\$|dolar/.test(t) ? 'USD' : db.settings.baseCurrency;
  // Comercio conocido del historial.
  const merchants = [...new Set(db.expenses.map(e => e.merchant).filter(Boolean) as string[])].sort((a, b) => b.length - a.length);
  const merchant = merchants.find(m => t.includes(fold(m))) ?? null;
  const keyword = CATEGORY_KEYWORDS.find(([re]) => re.test(t));
  const categoryId = categoryForMerchant(db, merchant) ?? (keyword ? categoryByName(db, keyword[1]) : null);
  const payer = users.find(u => new RegExp(`pago ${fold(u.name)}|${fold(u.name)} pago`).test(t));
  const paidById = payer?.id ?? me;
  // Medio de pago: primero por nombre propio ("Visa", "OCA", "BROU"), después por tipo.
  const methods = db.methods.filter(m => !m.archived);
  const byName = methods.find(m => hasWord(t, m.name)) ?? methods.find(m => m.name.split(/\s+/).some(w => w.length >= 3 && !GENERIC_METHOD_WORDS.test(fold(w)) && hasWord(t, w)));
  const kind = METHOD_KEYWORDS.find(([re]) => re.test(t))?.[1] as PaymentMethodType | undefined;
  const paymentMethodId = byName?.id ?? methodFor(db, paidById, kind);
  const installments = Number(t.match(/(\d{1,2})\s*cuotas/)?.[1] ?? 1);
  const date = /anteayer/.test(t) ? addDays(demoToday(), -2) : /ayer/.test(t) ? addDays(demoToday(), -1) : demoToday();
  // División: "entre todos", "a medias con Sofía", "con Lucas".
  const named = users.filter(u => u.id !== paidById && hasWord(t, u.name));
  let split: ExpenseInput['split'] = null;
  if (/entre todos|dividido|compartid|para la casa/.test(t)) split = { mode: 'equal', participants: users.map(u => ({ userId: u.id })) };
  else if (named.length && /a medias|mitad|entre (los )?dos|con /.test(t)) split = { mode: 'equal', participants: [paidById, ...named.map(u => u.id)].map(userId => ({ userId })) };
  // Descripción: el texto sin el monto, el comercio, el medio de pago, los nombres ni muletillas; o una genérica de la categoría.
  const methodWords = byName ? [byName.name, ...byName.name.split(/\s+/).filter(w => w.length >= 3 && !GENERIC_METHOD_WORDS.test(fold(w)))] : [];
  const noise = [amount.raw, merchant, ...methodWords, ...users.map(u => u.name)].filter(Boolean) as string[];
  let cleaned = text;
  for (const phrase of noise) cleaned = cleaned.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  cleaned = cleaned.replace(/\d{1,2}\s*cuotas/gi, ' ').replace(/(^|\s)(pagu[eé]|pag[oó]|gast[eé]|compr[eé]|de|del|con la|con el|con|en|por|a medias|pesos|usd|u\$s|d[oó]lares?|dividido entre todos|dividido|entre todos|ayer|anteayer|hoy|d[eé]bito|cr[eé]dito|efectivo|tarjeta|transferencia)(?=\s|$|[,;.])/gi, ' ').replace(/[$,;.]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Si no queda nada: para servicios y fijos, una descripción genérica ("Factura de luz"); si no, el comercio ("Netflix").
  const generic = keyword && /factura|alquiler|gastos comunes|nafta|^gas$/i.test(keyword[2]) ? keyword[2] : merchant ?? keyword?.[2] ?? 'Gasto';
  const description = cleaned.length >= 3 && cleaned.length <= 60 ? cleaned.charAt(0).toLocaleUpperCase('es') + cleaned.slice(1) : generic;
  const confidence: ExpenseDraft['confidence'] = categoryId && (paymentMethodId || merchant) ? 'high' : categoryId ? 'medium' : 'low';
  return { description, merchant, amountCents: amount.cents, currency, date, categoryId, paymentMethodId, paidById, installments: installments >= 1 && installments <= 60 ? installments : 1, confidence, notes: null, split, items: [], possibleDuplicates: findPossibleDuplicates(db, amount.cents, currency, date) };
}

/** Interpreta uno o varios gastos escritos en lenguaje natural (uno por línea o separados por ";"). */
export function parseText(db: MockDB, text: string, me: number) {
  const parts = text.split(/\n|;| y también | y además /i).map(p => p.trim()).filter(Boolean);
  const drafts = parts.map(p => parseOne(db, p, me)).filter((d): d is ExpenseDraft => d !== null);
  const summary = drafts.length ? `Encontré ${drafts.length === 1 ? 'un gasto' : `${drafts.length} gastos`}. Revisa los datos antes de confirmar.` : '';
  return { summary, drafts };
}

// ---------------------------------------------------------------------------
// Informe mensual
// ---------------------------------------------------------------------------
export function monthlyReport(db: MockDB, month: string): string {
  const s = monthSummary(db, month);
  const fmt = (c: number) => formatMoney(db, c);
  const pct = (n: number) => n.toLocaleString('es-UY', { maximumFractionDigits: 1 });
  const monthName = new Intl.DateTimeFormat('es-UY', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-15T12:00:00Z`));
  if (!s.expenseCount) return `## ${monthName}\n\nTodavía no hay gastos registrados en este mes, así que no hay mucho para analizar. Cuando carguen los primeros, el informe va a mostrar en qué se fue la plata y algunas ideas para el mes siguiente.\n\n_Informe simulado: en la app real lo escribe Claude a partir de los datos del hogar._`;
  const lines: string[] = [`## Tu mes en perspectiva: ${monthName}`, ''];
  const vs = s.changePct === null ? '' : s.changePct > 0 ? ` Es un **${pct(Math.abs(s.changePct))}% más** que el mismo período del mes anterior.` : ` Es un **${pct(Math.abs(s.changePct))}% menos** que el mismo período del mes anterior.`;
  lines.push(`El hogar registró **${s.expenseCount} gastos** por **${fmt(s.totalCents)}**${s.isCurrentMonth ? ' en lo que va del mes' : ''}.${vs}`);
  if (s.budgetCents) lines.push('', s.budgetUsedPct! > 100 ? `Ya usaron el **${pct(s.budgetUsedPct!)}% del presupuesto** de ${fmt(s.budgetCents)}.` : `Usaron el **${pct(s.budgetUsedPct!)}% del presupuesto** de ${fmt(s.budgetCents)}${s.projectionCents ? ` y, a este ritmo, el mes cerraría cerca de **${fmt(s.projectionCents)}**` : ''}.`);
  lines.push('', '### Lo que más pesó', '');
  for (const c of s.byCategory.filter(c => c.totalCents > 0).slice(0, 3)) {
    const delta = c.previousCents ? Math.round((c.totalCents / c.previousCents - 1) * 100) : null;
    lines.push(`- **${c.name}**: ${fmt(c.totalCents)} (${pct(c.pct)}% del total)${delta === null ? '' : delta === 0 ? ', igual que el mes anterior' : delta > 0 ? `, ${delta}% más que el mes anterior` : `, ${Math.abs(delta)}% menos que el mes anterior`}.`);
  }
  // Comercio donde más gastaron, sin contar fijos ni cuotas (el alquiler siempre ganaría).
  const variable = new Map<string, { total: number; count: number }>();
  for (const e of db.expenses.filter(e => e.date.startsWith(month) && e.merchant && e.source !== 'recurring' && !e.installment)) { const m = variable.get(e.merchant!) ?? { total: 0, count: 0 }; m.total += e.amountBaseCents; m.count += 1; variable.set(e.merchant!, m); }
  const top = [...variable.entries()].sort((a, b) => b[1].total - a[1].total)[0];
  if (top) lines.push('', `Sin contar fijos ni cuotas, donde más gastaron fue en **${top[0]}**: ${top[1].count} ${top[1].count === 1 ? 'compra' : 'compras'} por ${fmt(top[1].total)}.`);
  const balances = computeBalances(db);
  lines.push('', '### Entre ustedes', '');
  for (const m of s.byMember) lines.push(`- **${m.name}** pagó ${fmt(m.paidCents)} y le correspondían ${fmt(m.shareCents)}.`);
  lines.push('', balances.debts.length ? `Para quedar a mano: ${balances.debts.map(d => `${db.users.find(u => u.id === d.fromUserId)?.name} le transfiere ${fmt(d.amountCents)} a ${db.users.find(u => u.id === d.toUserId)?.name}`).join('; ')}.` : 'Las cuentas compartidas están al día. 👏');
  const alerts = insights(db, month).filter(i => i.type !== 'pending_receipts').slice(0, 3);
  if (alerts.length) { lines.push('', '### Para tener en cuenta', ''); for (const a of alerts) lines.push(`- ${a.title}.`); }
  lines.push('', '### Ideas para el mes que viene', '');
  const ideas: string[] = [];
  const delivery = s.byCategory.find(c => c.name.startsWith('Delivery'));
  if (delivery && delivery.budgetCents && delivery.totalCents > delivery.budgetCents * 0.8) ideas.push(`**Delivery**: van ${fmt(delivery.totalCents)}. Cocinar en tanda los domingos y dejar el pedido para el viernes puede ahorrar bastante.`);
  const market = s.byCategory.find(c => c.name.startsWith('Supermercado'));
  if (market && market.count && market.count > 6) ideas.push(`**Supermercado**: hicieron ${market.count} compras. Concentrar las grandes en una sola visita (y la feria para frutas y verduras) suele bajar el ticket total.`);
  const usd = db.expenses.filter(e => e.date.startsWith(month) && e.currency === 'USD');
  if (usd.length) ideas.push(`**Gastos en dólares**: hubo ${usd.length} este mes. Fijar la cotización en Configuración ayuda a que los totales no varíen con el tipo de cambio.`);
  ideas.push(`**Colchón para imprevistos**: separar un 5% del presupuesto (${fmt(Math.round((s.budgetCents ?? s.totalCents) * 0.05))}) evita que un arreglo de la casa desacomode el mes.`);
  ideas.slice(0, 3).forEach(i => lines.push(`- ${i}`));
  lines.push('', '_Informe simulado a partir de los datos de la demo. En la app real lo escribe Claude analizando los números de tu hogar._');
  return lines.join('\n');
}
