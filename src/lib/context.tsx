import { createContext, useContext } from 'react';
import type { Category, PaymentMethod, Settings, User, Expense, ExpenseInput } from '../api/types';
export interface AppContextValue { me: User; users: User[]; categories: Category[]; methods: PaymentMethod[]; settings: Settings; month: string; setMonth: (month: string) => void; openExpense: (expense?: Expense, initial?: Partial<ExpenseInput>) => void; openActions: () => void; openQuickText: () => void; theme: string; setTheme: (theme: string) => void; }
export const AppContext = createContext<AppContextValue>(null!);
export const useApp = () => useContext(AppContext);
