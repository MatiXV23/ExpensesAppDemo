import type { User } from '../../api/types';
import { getDb, markDirty, resetToEmptyHousehold, resetToSeed } from '../db';
import { notFound } from '../errors';
import { track } from '../events';
import { run } from '../runtime';
import { ROLE_PITCH, USER_PITCH } from '../seed/users';

export interface DemoUser extends User { pitch: string }

/** Operaciones del panel de demo (no existen en la app real). Nunca fallan con errores simulados. */
export const demoApi = {
  /** Integrantes activos para las tarjetas de "Entrar como…". */
  users: () => run((db): DemoUser[] => db.users.filter(u => u.active).map(u => ({ ...u, pitch: USER_PITCH[u.id] && db.users.length <= 3 && u.email.endsWith('@demo.test') ? USER_PITCH[u.id] : ROLE_PITCH[u.role] })), { auth: false, errors: false }),

  /** Inicia sesión en un clic, sin contraseña. */
  loginAs: (userId: number) => run(db => {
    const user = db.users.find(u => u.id === userId && u.active);
    if (!user) throw notFound('Integrante');
    db.sessionId = user.id;
    markDirty();
    track('login');
    if (user.role === 'member') track('member');
    return user;
  }, { auth: false, errors: false }),

  /** Vuelve a los datos de ejemplo (conserva la sesión si el integrante existe en la semilla). */
  reset: () => run(() => { resetToSeed(getDb().sessionId); }, { auth: false, errors: false }),

  /** Borra todo y lleva al asistente de primer arranque. */
  emptyHousehold: () => run(() => { resetToEmptyHousehold(); }, { auth: false, errors: false }),
};
