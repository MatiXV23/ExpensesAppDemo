import type { Category, Expense, MonthlyReport, PaymentMethod, Receipt, Recurring, Settings, Settlement, User } from '../api/types';
import { createSeed, createEmptyHousehold } from './seed';
import { storage } from './storage';

export const DB_KEY = 'cuentas-claras-demo:v2';
const VERSION = 2;

/** Comprobante con datos internos de la simulación (no se exponen en la API). */
export interface DbReceipt extends Receipt {
  /** Momento (reloj real, ms) en que termina el "procesamiento" de la IA simulada. */
  readyAt?: number | null;
  /** Plantilla de lectura detectada para este archivo. */
  template?: string | null;
  attempts?: number;
}
export interface DbRecurring extends Recurring { exchangeRate: number; notes: string | null; anchorDay: number; createdById: number; createdAt: string }
export interface DbBudget { id: number; categoryId: number | null; amountCents: number; effectiveFrom: string }

export interface MockDB {
  version: number;
  initialized: boolean;
  sessionId: number | null;
  settings: Settings;
  users: User[];
  /** Contraseñas de prueba en texto plano: es una demo sin datos reales. */
  passwords: Record<number, string>;
  categories: Category[];
  methods: PaymentMethod[];
  expenses: Expense[];
  receipts: DbReceipt[];
  recurring: DbRecurring[];
  settlements: Settlement[];
  budgets: DbBudget[];
  reports: Record<string, MonthlyReport>;
  /** Último id usado por colección (los ids no se reutilizan aunque se borren registros). */
  seq: Record<string, number>;
}

export type Collection = 'users' | 'categories' | 'methods' | 'expenses' | 'receipts' | 'recurring' | 'settlements' | 'budgets';

export function nextId(db: MockDB, collection: Collection): number {
  const current = db.seq[collection] ?? Math.max(0, ...(db[collection] as { id: number }[]).map(x => x.id));
  db.seq[collection] = current + 1;
  return current + 1;
}

function load(): MockDB {
  const raw = storage.get(DB_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as MockDB;
      if (parsed?.version === VERSION) return parsed;
    } catch { /* datos corruptos: se vuelve a la semilla */ }
  }
  return createSeed();
}

// Se carga recién en el primer uso: db → seed → domain → db forman un ciclo de imports.
let db: MockDB | null = null;
let dirty = false;
const listeners = new Set<() => void>();

export const getDb = (): MockDB => (db ??= load());
/** Marca que la operación en curso modificó datos y hay que persistirlos. */
export const markDirty = () => { dirty = true; };

export class StorageFullError extends Error {}

/** Persiste en localStorage. Lanza StorageFullError si el navegador no tiene espacio. */
export function commit() {
  if (!dirty) return;
  if (!storage.set(DB_KEY, JSON.stringify(getDb()))) {
    rollback();
    throw new StorageFullError('El navegador no tiene más espacio para la demo. Reiníciala desde el panel de demo para liberar espacio.');
  }
  dirty = false;
  listeners.forEach(l => l());
}

/** Descarta los cambios no persistidos (una operación falló a mitad de camino). */
export function rollback() { db = load(); dirty = false; }

function replace(next: MockDB) { db = next; dirty = true; commit(); }
/** Vuelve a los datos semilla. Si había una sesión abierta, la conserva. */
export function resetToSeed(keepSessionId?: number | null) {
  const seed = createSeed();
  if (keepSessionId && seed.users.some(u => u.id === keepSessionId && u.active)) seed.sessionId = keepSessionId;
  replace(seed);
}
/** Un hogar sin configurar: lleva al asistente de primer arranque. */
export function resetToEmptyHousehold() { replace(createEmptyHousehold()); }

export function subscribeDb(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
