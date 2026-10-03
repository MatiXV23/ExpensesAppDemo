// En la demo no hay HTTP: cada módulo de `src/api` reexporta su versión simulada de `src/mocks/services`,
// con la misma interfaz que el servicio real. Este archivo conserva los tipos y helpers compartidos.
export const USE_MOCKS = true;
export class ApiError extends Error { constructor(message: string, public status: number, public details?: unknown) { super(message); } }
export type Params = Record<string, string | number | boolean | undefined | null>;
export function query(params: Params = {}) { const q = new URLSearchParams(); Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '' && v !== false) q.set(k, String(v)); }); return q.size ? '?' + q.toString() : ''; }
