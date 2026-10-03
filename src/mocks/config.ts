import { storage } from './storage';

/** Latencia simulada de cada llamada, en milisegundos. */
export const LATENCY_MS = { min: 200, max: 600 } as const;
/** Cuánto tarda la "IA" en leer un comprobante (reloj real). */
export const RECEIPT_PROCESSING_MS = { min: 2500, max: 4200 } as const;

export interface DemoConfig {
  /** Errores aleatorios en las llamadas (para ver cómo responde la interfaz). */
  errors: boolean;
  /** Probabilidad de error por llamada, entre 0 y 1. */
  errorRate: number;
}
const KEY = 'cuentas-claras-demo:config';
const defaults: DemoConfig = { errors: false, errorRate: 0.25 };

let config: DemoConfig = (() => {
  try { return { ...defaults, ...JSON.parse(storage.get(KEY) || '{}') }; } catch { return defaults; }
})();
const listeners = new Set<() => void>();

export const getConfig = () => config;
export function setConfig(patch: Partial<DemoConfig>) {
  config = { ...config, ...patch };
  storage.set(KEY, JSON.stringify(config));
  listeners.forEach(l => l());
}
export function subscribeConfig(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
