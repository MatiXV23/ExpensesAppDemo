import type { User } from '../../api/types';
import { demoNowIso } from '../clock';
import { markDirty, nextId } from '../db';
import { badRequest, conflict, unauthorized } from '../errors';
import { track } from '../events';
import { currentUser, run } from '../runtime';
import { createCategories, DEFAULT_PAYMENT_METHODS } from '../seed/catalog';
import { isColor, pickMemberColor, validEmail } from './validation';

/** Misma interfaz que src/api/auth.ts del cliente real. */
export const auth = {
  status: () => run(db => ({ needsSetup: !db.initialized, householdName: db.initialized ? db.settings.householdName : null }), { auth: false, errors: false }),

  me: () => run(db => currentUser(db), { errors: false }),

  login: (body: { email: string; password: string }) => run(db => {
    const user = db.users.find(u => u.email.toLowerCase() === body.email.trim().toLowerCase());
    if (!user || db.passwords[user.id] !== body.password) throw unauthorized('Email o contraseña incorrectos');
    if (!user.active) throw unauthorized('Tu cuenta está desactivada. Habla con quien administra el hogar.');
    db.sessionId = user.id;
    markDirty();
    track('login');
    if (user.role === 'member') track('member');
    return user;
  }, { auth: false, errors: false }),

  setup: (body: { householdName: string; baseCurrency: string; name: string; email: string; password: string }) => run(db => {
    if (db.initialized) throw conflict('El hogar ya está configurado');
    if (body.householdName.trim().length < 1) throw badRequest('Elige un nombre para tu hogar.');
    if (body.name.trim().length < 1) throw badRequest('Ingresa tu nombre.');
    if (!validEmail(body.email)) throw badRequest('Ingresa un email válido.');
    if (body.password.length < 8) throw badRequest('La contraseña debe tener al menos 8 caracteres');
    const base = body.baseCurrency === 'USD' ? 'USD' : 'UYU';
    const admin: User = { id: nextId(db, 'users'), name: body.name.trim(), email: body.email.trim().toLowerCase(), role: 'admin', color: pickMemberColor([]), active: true, createdAt: demoNowIso() };
    db.users.push(admin);
    db.passwords[admin.id] = body.password;
    db.categories = createCategories();
    db.methods = DEFAULT_PAYMENT_METHODS.map((m, i) => ({ ...m, id: i + 1 }));
    db.settings = { ...db.settings, householdName: body.householdName.trim(), baseCurrency: base, quotedCurrency: 'UYU', usdRate: 40.25, usdRateSource: 'auto', usdRateUpdatedAt: demoNowIso() };
    db.initialized = true;
    db.sessionId = admin.id;
    markDirty();
    track('login');
    return admin;
  }, { auth: false, errors: false }),

  logout: () => run(db => { db.sessionId = null; markDirty(); }, { auth: false, errors: false }),

  update: (body: { name?: string; color?: string; email?: string }) => run(db => {
    const me = currentUser(db);
    if (body.name !== undefined && !body.name.trim()) throw badRequest('Ingresa tu nombre.');
    if (body.email !== undefined) {
      if (!validEmail(body.email)) throw badRequest('Ingresa un email válido.');
      if (db.users.some(u => u.id !== me.id && u.email === body.email!.trim().toLowerCase())) throw conflict('Ese email ya está en uso');
    }
    if (body.color !== undefined && !isColor(body.color)) throw badRequest('Elige un color válido.');
    Object.assign(me, { ...(body.name !== undefined && { name: body.name.trim() }), ...(body.email !== undefined && { email: body.email.trim().toLowerCase() }), ...(body.color !== undefined && { color: body.color }) });
    markDirty();
    return me;
  }),

  password: (body: { currentPassword: string; newPassword: string }) => run(db => {
    const me = currentUser(db);
    if (db.passwords[me.id] !== body.currentPassword) throw badRequest('La contraseña actual no es correcta');
    if (body.newPassword.length < 8) throw badRequest('La nueva contraseña debe tener al menos 8 caracteres');
    db.passwords[me.id] = body.newPassword;
    markDirty();
  }),
};
