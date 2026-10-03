import type { ProgressKey } from '../mocks/events';

/** Recorrido sugerido del panel de demo. Cada ítem se marca solo cuando se prueba. */
export interface ChecklistItem { key: ProgressKey; title: string; hint: string; to?: string; open?: 'expense' | 'quick' }

export const CHECKLIST: ChecklistItem[] = [
  { key: 'receipt', title: 'Escanear un comprobante con IA', hint: 'Sube un ticket de ejemplo, revisa lo que leyó y confírmalo.', to: '/receipts' },
  { key: 'text', title: 'Cargar un gasto escribiéndolo', hint: '"Súper 2.350 con débito, entre todos" y listo.', open: 'quick' },
  { key: 'expense', title: 'Cargar un gasto y dividirlo', hint: 'Prueba porcentajes, proporciones o montos exactos.', open: 'expense' },
  { key: 'installments', title: 'Comprar algo en cuotas', hint: 'Elige 6 cuotas y mira cómo aparecen mes a mes.', open: 'expense' },
  { key: 'recurring', title: 'Confirmar la factura de UTE', hint: 'Está pendiente en Gastos fijos: ingresa el monto real.', to: '/recurring' },
  { key: 'settlement', title: 'Saldar la deuda de Lucas', hint: 'Registra el pago y mira cómo vuelven a cero los saldos.', to: '/balances' },
  { key: 'budget', title: 'Ajustar un presupuesto', hint: 'El delivery se pasó: edítalo desde Presupuestos.', to: '/budgets' },
  { key: 'report', title: 'Generar el informe mensual', hint: 'En Análisis, "Generar informe con IA".', to: '/analytics' },
  { key: 'csv', title: 'Exportar los gastos a CSV', hint: 'Desde Gastos: se abre bien en Excel.', to: '/expenses' },
  { key: 'member', title: 'Entrar como miembro', hint: 'Cambia a Sofía o Lucas y fíjate qué cambia.' },
  { key: 'errors', title: 'Ver cómo responde ante errores', hint: 'Activa los errores simulados y prueba guardar algo.' },
];
