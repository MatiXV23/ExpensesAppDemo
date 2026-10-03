import { ApiError } from '../api/client';
import type { User } from '../api/types';
import { getConfig, LATENCY_MS } from './config';
import { commit, getDb, rollback, StorageFullError, type MockDB } from './db';
import { notify, track } from './events';
import { finishProcessedReceipts } from './domain/receipts';
import { forbidden, unauthorized } from './errors';
import { processDueRecurring } from './domain/recurring';


const SIMULATED_ERRORS = [
  'No pudimos conectar con el servidor. Inténtalo de nuevo. (Error simulado)',
  'El servidor tardó demasiado en responder. (Error simulado)',
  'Algo salió mal al guardar los cambios. Vuelve a intentarlo. (Error simulado)',
];

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const latency = () => LATENCY_MS.min + Math.random() * (LATENCY_MS.max - LATENCY_MS.min);

/** Usuario de la sesión actual (o 401). */
export function currentUser(db: MockDB = getDb()): User {
  const user = db.users.find(u => u.id === db.sessionId);
  if (!user || !user.active) throw unauthorized();
  return user;
}
export function requireAdmin(user: User) {
  if (user.role !== 'admin') throw forbidden('Solo un administrador puede hacer esto');
}

interface RunOptions {
  /** false: la llamada no requiere sesión (login, estado, asistente). */
  auth?: boolean;
  /** false: nunca falla con errores simulados (llamadas del arranque y del panel de demo). */
  errors?: boolean;
}

/**
 * Ejecuta una operación como si fuera una llamada al backend: espera la latencia,
 * puede fallar con un error simulado, deshace los cambios si algo sale mal y persiste el resultado.
 * La operación es síncrona: así dos llamadas concurrentes nunca se intercalan entre el cambio y el guardado.
 */
export async function run<T>(operation: (db: MockDB) => T, options: RunOptions = {}): Promise<T> {
  await sleep(latency());
  const config = getConfig();
  if (options.errors !== false && config.errors && Math.random() < config.errorRate) {
    track('errors');
    throw new ApiError(SIMULATED_ERRORS[Math.floor(Math.random() * SIMULATED_ERRORS.length)], 503);
  }
  const db = getDb();
  try {
    let generated: string[] = [];
    if (options.auth !== false) {
      currentUser(db);
      // Tareas que en la app real hace el servidor en segundo plano.
      generated = processDueRecurring(db);
      finishProcessedReceipts(db);
    }
    const result = operation(db);
    commit();
    if (generated.length) notify({ kind: 'scheduler', level: 'toast', title: generated.length === 1 ? `Gasto fijo registrado: ${generated[0]}` : `${generated.length} gastos fijos registrados`, description: 'Simulado: en la app real el servidor registra solos los gastos fijos automáticos cuando vencen.' });
    return result instanceof Blob ? result : structuredClone(result);
  } catch (error) {
    if (!(error instanceof StorageFullError)) rollback();
    const apiError = error instanceof ApiError ? error : new ApiError((error as Error).message, error instanceof StorageFullError ? 507 : 500);
    if (apiError.status === 401 && options.auth !== false && typeof location !== 'undefined' && !/^#\/(login|setup)/.test(location.hash)) location.hash = '#/login';
    throw apiError;
  }
}
