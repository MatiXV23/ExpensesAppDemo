import type { Balances, BudgetsResponse, Expense, Recurring, Settlement } from '../../api/types';
import { track } from '../events';
import { computeBalances, createSettlement, deleteSettlement, listSettlements } from '../domain/balances';
import { deleteBudget, getBudgets, setBudget } from '../domain/budgets';
import { confirmRecurring, createRecurring, deleteRecurring, dueRecurring, listRecurring, skipRecurring, updateRecurring } from '../domain/recurring';
import { currentUser, run } from '../runtime';

/** Misma interfaz que src/api/budgets.ts del cliente real. */
export const budgetsApi = {
  list: (month: string) => run((db): BudgetsResponse => getBudgets(db, month)),
  save: (month: string, categoryId: number | null, amountCents: number) => run((db): void => { setBudget(db, month, categoryId, amountCents); track('budget'); }),
  remove: (month: string, categoryId: number | null) => run((db): void => { deleteBudget(db, month, categoryId); }),
};

/** Misma interfaz que src/api/balances.ts del cliente real. */
export const balancesApi = {
  get: () => run((db): Balances => computeBalances(db)),
  settlements: () => run((db): Settlement[] => listSettlements(db)),
  settle: (body: Pick<Settlement, 'fromUserId' | 'toUserId' | 'amountCents' | 'date' | 'note'>) => run(db => { const s = createSettlement(db, body, currentUser(db)); track('settlement'); return s; }),
  remove: (id: number) => run((db): void => deleteSettlement(db, id, currentUser(db))),
};

/** Misma interfaz que src/api/recurring.ts del cliente real. */
export const recurringApi = {
  list: () => run((db): Recurring[] => listRecurring(db)),
  due: () => run((db): Recurring[] => dueRecurring(db)),
  create: (body: Omit<Recurring, 'id'>) => run(db => createRecurring(db, body, currentUser(db))),
  update: (id: number, body: Partial<Recurring>) => run(db => updateRecurring(db, id, body, currentUser(db))),
  remove: (id: number) => run((db): void => deleteRecurring(db, id, currentUser(db))),
  confirm: (id: number, amountCents: number, date?: string) => run((db): Expense[] => { const created = confirmRecurring(db, id, { amountCents, date }, currentUser(db)); track('recurring'); return created; }),
  skip: (id: number) => run((db): void => { skipRecurring(db, id); }),
};
