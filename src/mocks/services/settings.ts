import type { Category, PaymentMethod, PaymentMethodType, Settings, User } from '../../api/types';
import { demoNowIso, demoToday } from '../clock';
import { markDirty, nextId, type MockDB } from '../db';
import { badRequest, conflict, notFound } from '../errors';
import { notify } from '../events';
import { currentUser, requireAdmin, run } from '../runtime';
import { isColor, pickMemberColor, validEmail } from './validation';

// Misma interfaz que src/api/settings.ts del cliente real.

/** Cotización "automática" simulada: en la app real se consulta una fuente pública una vez por día. */
function simulatedQuote(db: MockDB) {
  const previous = db.settings.usdRate ?? 40.25;
  const rate = Math.round((40.25 + (Math.random() - 0.5) * 0.6) * 100) / 100;
  Object.assign(db.settings, { usdRate: rate, usdRateSource: 'auto', usdRateUpdatedAt: demoNowIso() });
  markDirty();
  return { previous, rate };
}
const fmtRate = (rate: number) => `$ ${rate.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function quoteNotice(previous: number, rate: number) {
  notify({ kind: 'exchange', level: 'modal', title: `Cotización actualizada: 1 USD = ${fmtRate(rate)}`, description: `La demo inventó una cotización de mercado cercana a la anterior (${fmtRate(previous)}). Los gastos en dólares que se carguen sin cotización usarán este valor.`, real: 'Cuentas Claras consulta una fuente pública de tipos de cambio una vez por día (o cuando tocas este botón) y guarda la cotización del dólar para convertir los gastos a la moneda del hogar.', details: [{ label: 'Fuente', value: 'open.er-api.com (simulada)' }, { label: 'Moneda', value: 'USD → UYU' }] });
}

const withQuoted = (settings: Settings): Settings => ({ ...settings, quotedCurrency: settings.baseCurrency === 'USD' ? 'UYU' : settings.baseCurrency });

export const settingsApi = {
  get: () => run(db => withQuoted(db.settings), { errors: false }),

  update: (body: Partial<Settings>) => run(db => {
    requireAdmin(currentUser(db));
    if (body.householdName !== undefined && !body.householdName.trim()) throw badRequest('Elige un nombre para el hogar.');
    if (body.baseCurrency && body.baseCurrency !== db.settings.baseCurrency) {
      if (!['UYU', 'USD'].includes(body.baseCurrency)) throw badRequest('Elige UYU o USD.');
      if (db.expenses.length) throw conflict('No se puede cambiar la moneda base cuando ya hay gastos cargados');
      db.settings.baseCurrency = body.baseCurrency;
    }
    if (body.householdName !== undefined) db.settings.householdName = body.householdName.trim();
    let quote: { previous: number; rate: number } | null = null;
    if (body.usdRate === null) quote = simulatedQuote(db);
    else if (body.usdRate !== undefined) {
      if (!(body.usdRate > 0) || body.usdRate > 1_000_000) throw badRequest('Ingresa una cotización mayor a cero.');
      Object.assign(db.settings, { usdRate: body.usdRate, usdRateSource: 'manual', usdRateUpdatedAt: demoNowIso() });
    }
    markDirty();
    if (quote) queueMicrotask(() => quoteNotice(quote.previous, quote.rate));
    return withQuoted(db.settings);
  }),

  /** POST /settings/usd-rate/refresh: vuelve a consultar ahora la cotización automática. */
  refreshUsdRate: () => run(db => {
    requireAdmin(currentUser(db));
    const quote = simulatedQuote(db);
    queueMicrotask(() => quoteNotice(quote.previous, quote.rate));
    return withQuoted(db.settings);
  }),

  /** GET /settings/backup: en la demo, un JSON con los datos del navegador. */
  backup: () => run(db => {
    requireAdmin(currentUser(db));
    const { passwords: _p, sessionId: _s, ...data } = db;
    const blob = new Blob([JSON.stringify({ app: 'Cuentas Claras (demo)', exportedAt: demoNowIso(), ...data }, null, 2)], { type: 'application/json' });
    const kb = Math.max(1, Math.round(blob.size / 1024));
    queueMicrotask(() => notify({ kind: 'backup', level: 'modal', title: 'Backup generado', description: `Se descargó una copia de los datos de esta demo en JSON (${kb} KB): ${db.expenses.length} gastos, ${db.receipts.length} comprobantes y ${db.recurring.length} gastos fijos.`, real: 'El servidor del hogar hace solo un backup por día de la base SQLite y conserva los últimos 14. Además, un admin puede descargar una copia completa en cualquier momento desde acá.', details: [{ label: 'Archivo', value: `cuentas-claras-${demoToday()}.json` }, { label: 'Backups automáticos', value: 'Diarios, últimos 14 (simulado)' }] }));
    return blob;
  }, { errors: false }),
};

function resourceApi<T extends { id: number }>(collection: 'users' | 'categories' | 'methods', rules: { create: (db: MockDB, body: Record<string, unknown>) => T; update: (db: MockDB, item: T, body: Partial<T>) => void; remove: (db: MockDB, item: T) => void; label: string }) {
  const find = (db: MockDB, id: number) => { const item = (db[collection] as unknown as T[]).find(x => x.id === id); if (!item) throw notFound(rules.label); return item; };
  return {
    list: () => run(db => db[collection] as unknown as T[], { errors: false }),
    create: (body: Omit<T, 'id'> | Record<string, unknown>) => run(db => { const item = rules.create(db, body as Record<string, unknown>); (db[collection] as unknown as T[]).push(item); markDirty(); return item; }),
    update: (id: number, body: Partial<T>) => run(db => { const item = find(db, id); rules.update(db, item, body); markDirty(); return item; }),
    remove: (id: number) => run(db => { rules.remove(db, find(db, id)); markDirty(); }),
  };
}

const otherActiveAdmins = (db: MockDB, excludeId: number) => db.users.filter(u => u.role === 'admin' && u.active && u.id !== excludeId).length;
const checkName = (name: unknown, max = 60) => { if (typeof name !== 'string' || !name.trim() || name.trim().length > max) throw badRequest('Escribe un nombre (hasta 60 caracteres).'); return name.trim(); };

const users = resourceApi<User>('users', {
  label: 'Integrante',
  create: (db, body) => {
    requireAdmin(currentUser(db));
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!validEmail(email)) throw badRequest('Ingresa un email válido.');
    if (db.users.some(u => u.email === email)) throw conflict('Ese email ya está en uso');
    if (String(body.password ?? '').length < 8) throw badRequest('La contraseña debe tener al menos 8 caracteres');
    const user: User = { id: nextId(db, 'users'), name: checkName(body.name), email, role: body.role === 'admin' ? 'admin' : 'member', color: typeof body.color === 'string' && isColor(body.color) ? body.color : pickMemberColor(db.users.map(u => u.color)), active: true, createdAt: demoNowIso() };
    db.passwords[user.id] = String(body.password);
    queueMicrotask(() => notify({ kind: 'account', level: 'toast', title: `${user.name} ya es parte del hogar`, description: `Simulado: en la app real ${user.name} entra con ${email} y la contraseña inicial que le pases. Acá ya aparece en "Entrar como…".` }));
    return user;
  },
  update: (db, user, body) => {
    requireAdmin(currentUser(db));
    if (body.email !== undefined) {
      const email = body.email.trim().toLowerCase();
      if (!validEmail(email)) throw badRequest('Ingresa un email válido.');
      if (db.users.some(u => u.email === email && u.id !== user.id)) throw conflict('Ese email ya está en uso');
      body.email = email;
    }
    const losesAdmin = user.role === 'admin' && (body.role === 'member' || body.active === false);
    if (losesAdmin && otherActiveAdmins(db, user.id) === 0) throw badRequest('Tiene que quedar al menos un administrador activo');
    if (body.color !== undefined && !isColor(body.color)) throw badRequest('Elige un color válido.');
    Object.assign(user, { ...(body.name !== undefined && { name: checkName(body.name) }), ...(body.email !== undefined && { email: body.email }), ...(body.role !== undefined && { role: body.role }), ...(body.color !== undefined && { color: body.color }), ...(body.active !== undefined && { active: body.active }) });
  },
  remove: (db, user) => {
    const me = currentUser(db);
    requireAdmin(me);
    if (user.id === me.id) throw badRequest('No puedes desactivarte a ti mismo');
    if (user.role === 'admin' && otherActiveAdmins(db, user.id) === 0) throw badRequest('Tiene que quedar al menos un administrador activo');
    user.active = false; // no se borra: tiene gastos asociados
  },
});

export const usersApi = {
  ...users,
  resetPassword: (id: number, password: string) => run(db => {
    requireAdmin(currentUser(db));
    const user = db.users.find(u => u.id === id);
    if (!user) throw notFound('Integrante');
    if (password.length < 8) throw badRequest('La contraseña debe tener al menos 8 caracteres');
    db.passwords[id] = password;
    markDirty();
    queueMicrotask(() => notify({ kind: 'account', level: 'toast', title: `Contraseña de ${user.name} restablecida`, description: `Simulado: en la app real se cierran las sesiones abiertas de ${user.name} y entra con la contraseña nueva.` }));
  }),
};

const ICON = /^[A-Za-z-]{1,40}$/;
export const categoriesApi = resourceApi<Category>('categories', {
  label: 'Categoría',
  create: (db, body) => ({ id: nextId(db, 'categories'), name: checkName(body.name), icon: typeof body.icon === 'string' && ICON.test(body.icon) ? body.icon : 'Shapes', color: typeof body.color === 'string' && isColor(body.color) ? body.color : '#64748b', archived: !!body.archived, sortOrder: db.categories.length }),
  update: (_db, category, body) => {
    if (body.color !== undefined && !isColor(body.color)) throw badRequest('Elige un color válido.');
    Object.assign(category, { ...(body.name !== undefined && { name: checkName(body.name) }), ...(body.icon !== undefined && { icon: body.icon }), ...(body.color !== undefined && { color: body.color }), ...(body.archived !== undefined && { archived: body.archived }) });
  },
  // Como el cliente real (PATCH archived: true): se archiva y conserva el historial.
  remove: (_db, category) => { category.archived = true; },
});

const METHOD_TYPES: PaymentMethodType[] = ['cash', 'debit', 'credit', 'transfer', 'wallet', 'other'];
export const paymentMethodsApi = resourceApi<PaymentMethod>('methods', {
  label: 'Medio de pago',
  create: (db, body) => {
    const ownerId = body.ownerId == null || body.ownerId === '' ? null : Number(body.ownerId);
    if (ownerId !== null && !db.users.some(u => u.id === ownerId)) throw badRequest('El titular no existe');
    return { id: nextId(db, 'methods'), name: checkName(body.name), type: METHOD_TYPES.includes(body.type as PaymentMethodType) ? body.type as PaymentMethodType : 'other', ownerId, archived: !!body.archived };
  },
  update: (db, method, body) => {
    if (body.ownerId != null && !db.users.some(u => u.id === body.ownerId)) throw badRequest('El titular no existe');
    if (body.type !== undefined && !METHOD_TYPES.includes(body.type)) throw badRequest('Elige un tipo válido.');
    Object.assign(method, { ...(body.name !== undefined && { name: checkName(body.name) }), ...(body.type !== undefined && { type: body.type }), ...(body.ownerId !== undefined && { ownerId: body.ownerId ?? null }), ...(body.archived !== undefined && { archived: body.archived }) });
  },
  remove: (_db, method) => { method.archived = true; },
});
