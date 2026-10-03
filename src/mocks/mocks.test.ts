import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setConfig } from './config';
import { getDb, resetToSeed } from './db';
import { createSeed } from './seed';
import { monthSummary, insights } from './domain/analytics';
import { computeBalances } from './domain/balances';
import { getBudgets } from './domain/budgets';
import { parseText } from './domain/ai';
import { auth } from './services/auth';
import { expensesApi } from './services/expenses';
import { analyticsApi } from './services/analytics';
import { balancesApi, recurringApi } from './services/money';
import { receiptsApi } from './services/receipts';
import { settingsApi, usersApi } from './services/settings';
import { demoApi } from './services/demo';

vi.mock('./config', async original => ({ ...(await original<typeof import('./config')>()), LATENCY_MS: { min: 0, max: 0 }, RECEIPT_PROCESSING_MS: { min: 0, max: 0 } }));

beforeEach(() => { setConfig({ errors: false }); resetToSeed(null); });

describe('Datos semilla', () => {
  it('cuatro meses de gastos coherentes, en UYU, con USD, cuotas y fuentes variadas', () => {
    const db = createSeed();
    expect(db.settings.baseCurrency).toBe('UYU');
    expect(db.expenses.length).toBeGreaterThan(120);
    expect(new Set(db.expenses.map(e => e.date.slice(0, 7)))).toEqual(new Set(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']));
    expect(db.expenses.some(e => e.currency === 'USD')).toBe(true);
    expect(db.expenses.some(e => e.installment)).toBe(true);
    expect(new Set(db.expenses.map(e => e.source))).toEqual(new Set(['manual', 'recurring', 'receipt']));
    expect(new Set(db.expenses.filter(e => e.isShared).map(e => e.splitMode))).toEqual(new Set(['equal', 'shares', 'percentage', 'exact']));
    // Ningún gasto supera el "hoy" de la demo, salvo las cuotas futuras.
    expect(db.expenses.filter(e => e.date > '2026-10-18' && !e.installment)).toEqual([]);
  });

  it('las divisiones no pierden centavos', () => {
    for (const e of createSeed().expenses.filter(e => e.isShared)) {
      expect(e.splits.reduce((a, s) => a + s.amountCents, 0)).toBe(e.amountCents);
      expect(e.splits.reduce((a, s) => a + s.amountBaseCents, 0)).toBe(e.amountBaseCents);
    }
  });

  it('es determinística', () => {
    const a = createSeed(), b = createSeed();
    expect(a.expenses.map(e => [e.date, e.amountCents, e.description])).toEqual(b.expenses.map(e => [e.date, e.amountCents, e.description]));
  });

  it('el resumen del mes cuadra con el registro y hay alertas para mostrar', () => {
    const db = createSeed();
    const s = monthSummary(db, '2026-10');
    expect(s.byCategory.reduce((a, c) => a + c.totalCents, 0)).toBe(s.totalCents);
    expect(s.daily.at(-1)?.cumulativeCents).toBe(s.totalCents);
    expect(s.byMember.reduce((a, m) => a + m.shareCents, 0)).toBe(s.totalCents);
    expect(s.projectionCents).toBeGreaterThan(s.totalCents);
    const types = insights(db, '2026-10').map(i => i.type);
    expect(types).toEqual(expect.arrayContaining(['recurring_due', 'pending_receipts', 'unusual_expense']));
  });

  it('respeta la vigencia de los presupuestos', () => {
    const db = createSeed();
    expect(getBudgets(db, '2026-08').total?.amountCents).toBe(12_000_000);
    expect(getBudgets(db, '2026-10').total?.amountCents).toBe(13_500_000);
    expect(getBudgets(db, '2026-06').total).toBe(null);
  });

  it('los saldos suman cero y Lucas le debe a la casa', () => {
    const b = computeBalances(createSeed());
    expect(b.members.reduce((a, m) => a + m.netCents, 0)).toBe(0);
    expect(b.debts.some(d => d.fromUserId === 3)).toBe(true);
  });
});

describe('Servicios simulados', () => {
  it('pide sesión y permite entrar con usuario y contraseña de prueba', async () => {
    await expect(expensesApi.list({})).rejects.toMatchObject({ status: 401 });
    await expect(auth.login({ email: 'sofia@demo.test', password: 'mala' })).rejects.toMatchObject({ status: 401 });
    expect((await auth.login({ email: 'sofia@demo.test', password: 'demo1234' })).name).toBe('Sofía');
    expect((await auth.me()).role).toBe('member');
  });

  it('crea cuotas con el total exacto y filtra por mes', async () => {
    await demoApi.loginAs(2);
    const created = await expensesApi.create({ description: 'Heladera', amountCents: 10_000_01, date: '2026-10-18', installments: 3, categoryId: 9 });
    expect(created.map(e => e.date)).toEqual(['2026-10-18', '2026-11-18', '2026-12-18']);
    expect(created.reduce((a, e) => a + e.amountCents, 0)).toBe(10_000_01);
    const november = await expensesApi.list({ month: '2026-11', q: 'heladera' });
    expect(november.total).toBe(1);
  });

  it('un miembro no puede editar gastos ajenos ni la configuración del hogar', async () => {
    await demoApi.loginAs(3);
    const rent = getDb().expenses.find(e => e.description === 'Alquiler')!;
    await expect(expensesApi.remove(rent.id)).rejects.toMatchObject({ status: 403 });
    await expect(settingsApi.update({ householdName: 'Otra casa' })).rejects.toMatchObject({ status: 403 });
    await expect(usersApi.create({ name: 'Ana', email: 'ana@demo.test', password: '12345678' })).rejects.toMatchObject({ status: 403 });
    // Pero sí lo que pagó él.
    const own = getDb().expenses.find(e => e.paidById === 3 && !e.installment)!;
    await expensesApi.remove(own.id);
    expect(getDb().expenses.some(e => e.id === own.id)).toBe(false);
  });

  it('registrar los pagos sugeridos deja todas las cuentas en cero', async () => {
    await demoApi.loginAs(1);
    for (const d of (await balancesApi.get()).debts) await balancesApi.settle({ ...d, date: '2026-10-18', note: null });
    const after = await balancesApi.get();
    expect(after.debts).toEqual([]);
    expect(after.members.every(m => m.netCents === 0)).toBe(true);
  });

  it('confirmar un recordatorio registra el gasto y avanza el vencimiento', async () => {
    await demoApi.loginAs(1);
    const [ute] = (await recurringApi.due()).filter(r => r.description === 'Factura de luz');
    await recurringApi.confirm(ute.id, 3_412_00);
    expect((await recurringApi.list()).find(r => r.id === ute.id)?.nextDate).toBe('2026-11-16');
  });

  it('un comprobante pasa por "procesando" y propone gastos con posibles duplicados', async () => {
    await demoApi.loginAs(1);
    const pending = await receiptsApi.get(1);
    expect(pending.drafts[0].possibleDuplicates).toHaveLength(1);
    const drafts = (await receiptsApi.get(2)).drafts;
    const created = await receiptsApi.confirm(2, drafts.map(d => ({ description: d.description, merchant: d.merchant, amountCents: d.amountCents, date: d.date!, categoryId: d.categoryId, paymentMethodId: d.paymentMethodId })));
    expect(created).toHaveLength(3);
    expect((await receiptsApi.get(2)).status).toBe('confirmed');
  });

  it('los errores simulados se pueden activar y no rompen los datos', async () => {
    await demoApi.loginAs(1);
    const before = getDb().expenses.length;
    setConfig({ errors: true, errorRate: 1 });
    await expect(expensesApi.create({ description: 'Café', amountCents: 200_00, date: '2026-10-18' })).rejects.toMatchObject({ status: 503 });
    setConfig({ errors: false });
    expect(getDb().expenses.length).toBe(before);
  });

  it('una operación inválida no deja cambios a medias', async () => {
    await demoApi.loginAs(1);
    const before = JSON.stringify(getDb().expenses);
    await expect(expensesApi.create({ description: 'Mal dividido', amountCents: 1000_00, date: '2026-10-18', split: { mode: 'percentage', participants: [{ userId: 1, value: 50 }, { userId: 2, value: 40 }] } })).rejects.toThrow('100');
    expect(JSON.stringify(getDb().expenses)).toBe(before);
  });

  it('el informe mensual resume el mes con los datos reales', async () => {
    await demoApi.loginAs(1);
    const report = await analyticsApi.report('2026-10');
    expect(report.markdown).toContain('Lo que más pesó');
    expect(report.markdown).toContain('simulado');
  });
});

describe('Carga rápida por texto', () => {
  const db = createSeed();
  it('entiende monto, comercio, medio de pago y división', () => {
    const [d] = parseText(db, 'Súper 2.350 en Tienda Inglesa con débito, entre todos', 1).drafts;
    expect(d.amountCents).toBe(2_350_00);
    expect(d.merchant).toBe('Tienda Inglesa');
    expect(db.categories.find(c => c.id === d.categoryId)?.name).toBe('Supermercado');
    expect(db.methods.find(m => m.id === d.paymentMethodId)?.name).toBe('Débito BROU');
    expect(d.split?.participants).toHaveLength(3);
    expect(d.description).toBe('Súper');
  });
  it('arma descripciones limpias', () => {
    const [a, b, c] = parseText(db, 'Chivitos 1.980 en La Pasiva con Mercado Pago, entre todos\nPagué 3.400 de UTE con la Visa\nNetflix 15,99 dólares con la OCA', 1).drafts;
    expect([a.description, b.description, c.description]).toEqual(['Chivitos', 'Factura de luz', 'Netflix']);
  });
  it('detecta dólares, cuotas, quién pagó y varios gastos a la vez', () => {
    const { drafts } = parseText(db, 'Netflix 15,99 dólares con la OCA, pagó Sofía\nTele 24.000 en 12 cuotas con la Visa', 1);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ currency: 'USD', amountCents: 1599, paidById: 2 });
    expect(db.methods.find(m => m.id === drafts[0].paymentMethodId)?.name).toBe('OCA');
    expect(drafts[1]).toMatchObject({ installments: 12, amountCents: 24_000_00 });
    expect(db.methods.find(m => m.id === drafts[1].paymentMethodId)?.name).toBe('Visa Itaú');
  });
});
