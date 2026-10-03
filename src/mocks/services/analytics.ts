import type { ExpenseDraft, Insight, MonthlyReport, MonthSummary, ParsedText, Trends } from '../../api/types';
import { addMonthsToMonth, demoMonth, demoNowIso } from '../clock';
import { markDirty } from '../db';
import { badRequest } from '../errors';
import { track } from '../events';
import { insights, monthSummary, trends } from '../domain/analytics';
import { monthlyReport, parseText, SIMULATED_MODEL } from '../domain/ai';
import { currentUser, run } from '../runtime';

const validMonth = (month?: string) => (month && /^\d{4}-\d{2}$/.test(month) ? month : demoMonth());

/** Misma interfaz que src/api/analytics.ts del cliente real. */
export const analyticsApi = {
  summary: (month: string) => run((db): MonthSummary => monthSummary(db, validMonth(month))),

  trends: (from: string, to: string) => run((db): Trends => {
    const end = validMonth(to);
    const start = from && /^\d{4}-\d{2}$/.test(from) ? from : addMonthsToMonth(end, -5);
    if (start > end) throw badRequest('El mes inicial es posterior al final');
    return trends(db, start, end);
  }),

  insights: (month: string) => run((db): Insight[] => insights(db, validMonth(month))),

  /** POST /ai/monthly-report: informe generado a partir de los datos del mes (IA simulada). */
  report: (month: string) => run((db): MonthlyReport => {
    const m = validMonth(month);
    const report = { month: m, markdown: monthlyReport(db, m), model: SIMULATED_MODEL, createdAt: demoNowIso() };
    db.reports[m] = report;
    markDirty();
    track('report');
    return report;
  }),

  /** POST /ai/parse-text: interpreta gastos escritos en lenguaje natural (no guarda nada). */
  parse: (text: string) => run((db): ParsedText & { drafts: ExpenseDraft[] } => {
    if (text.trim().length < 2) throw badRequest('Escribe el gasto. Por ejemplo: "Súper 2.350 con débito".');
    const result = parseText(db, text.slice(0, 2000), currentUser(db).id);
    if (!result.drafts.length) throw badRequest('No encontré ningún monto. Prueba con algo como "Súper 2.350 con débito, entre todos".');
    return result;
  }),
};
