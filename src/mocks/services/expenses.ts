import type { Params } from '../../api/client';
import type { ExpenseInput, Paginated, Expense } from '../../api/types';
import { track } from '../events';
import { createExpenses, deleteExpense, expensesCsv, filterExpenses, getExpense, updateExpense } from '../domain/expenses';
import { currentUser, run } from '../runtime';

/** Misma interfaz que src/api/expenses.ts del cliente real. */
export const expensesApi = {
  list: (params: Params) => run((db): Paginated<Expense> => {
    const rows = filterExpenses(db, params);
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(params.pageSize) || 50));
    return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize, sumBaseCents: rows.reduce((a, e) => a + e.amountBaseCents, 0) };
  }),

  get: (id: number) => run(db => getExpense(db, id)),

  create: (input: ExpenseInput) => run(db => {
    const created = createExpenses(db, input, currentUser(db), { source: input.source === 'text' ? 'text' : 'manual' });
    track(input.source === 'text' ? 'text' : 'expense');
    if ((input.installments ?? 1) > 1) track('installments');
    return created;
  }),

  // El formulario manda el gasto completo; installments no se edita (como PATCH /expenses/:id).
  update: (id: number, input: ExpenseInput) => run(db => { const { installments: _i, source: _s, ...patch } = input; return updateExpense(db, id, patch, currentUser(db)); }),

  remove: (id: number, group = false) => run(db => { deleteExpense(db, id, group ? 'group' : 'single', currentUser(db)); }),

  export: (params: Params) => run(db => { track('csv'); return expensesCsv(db, filterExpenses(db, { ...params, page: undefined, pageSize: undefined })); }),
};
