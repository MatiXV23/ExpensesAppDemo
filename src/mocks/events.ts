import { storage } from './storage';

/**
 * Avisos de integraciones simuladas: lo que en la app real haría un servicio externo
 * (IA, cotización del dólar, backups, tareas programadas del servidor).
 */
export type IntegrationKind = 'ai' | 'exchange' | 'backup' | 'scheduler' | 'account';
export interface SimulationNotice {
  kind: IntegrationKind;
  /** modal: explica la integración con detalle. toast: aviso breve. */
  level: 'modal' | 'toast';
  title: string;
  /** Qué pasó en la demo. */
  description: string;
  /** Qué pasaría en la app real. */
  real?: string;
  details?: { label: string; value: string }[];
  action?: { label: string; run: () => void };
}
const noticeListeners = new Set<(notice: SimulationNotice) => void>();
export function notify(notice: SimulationNotice) { noticeListeners.forEach(l => l(notice)); }
export function onNotice(listener: (notice: SimulationNotice) => void) { noticeListeners.add(listener); return () => { noticeListeners.delete(listener); }; }

/** Progreso de la lista "Para probar" del panel de demo. */
export type ProgressKey = 'login' | 'expense' | 'installments' | 'receipt' | 'text' | 'report' | 'budget' | 'settlement' | 'recurring' | 'member' | 'errors' | 'csv';
const PROGRESS_KEY = 'cuentas-claras-demo:progress';
let progress: ProgressKey[] = (() => { try { return JSON.parse(storage.get(PROGRESS_KEY) || '[]'); } catch { return []; } })();
const progressListeners = new Set<() => void>();
export const getProgress = () => progress;
export function track(key: ProgressKey) {
  if (progress.includes(key)) return;
  progress = [...progress, key];
  storage.set(PROGRESS_KEY, JSON.stringify(progress));
  progressListeners.forEach(l => l());
}
export function resetProgress() { progress = []; storage.remove(PROGRESS_KEY); progressListeners.forEach(l => l()); }
export function subscribeProgress(listener: () => void) { progressListeners.add(listener); return () => { progressListeners.delete(listener); }; }
