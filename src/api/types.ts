export type Role = "admin" | "member";
export interface User { id: number; name: string; email: string; role: Role; color: string; active: boolean; createdAt: string }
export interface Settings { householdName: string; baseCurrency: string; aiEnabled: boolean; aiModel?: string | null; quotedCurrency?: string; usdRate?: number | null; usdRateSource?: "auto" | "manual" | null; usdRateUpdatedAt?: string | null }
export interface Category { id: number; name: string; icon: string; color: string; archived: boolean; sortOrder?: number }
export type PaymentMethodType = "cash" | "debit" | "credit" | "transfer" | "wallet" | "other";
export interface PaymentMethod { id: number; name: string; type: PaymentMethodType; ownerId: number | null; archived: boolean }
export type SplitMode = "equal" | "percentage" | "shares" | "exact";
export interface ExpenseSplit { userId: number; amountCents: number; amountBaseCents: number; value: number | null }
export type ExpenseSource = "manual" | "receipt" | "text" | "recurring";
export interface Expense {
  id: number; description: string; merchant: string | null; amountCents: number; currency: string; exchangeRate: number; amountBaseCents: number; date: string; categoryId: number | null; paidById: number; paymentMethodId: number | null; notes: string | null; source: ExpenseSource; isShared: boolean; splitMode: SplitMode | null; splits: ExpenseSplit[]; installment: { number: number; total: number; groupId: string } | null; receiptId: number | null; recurringId: number | null; createdById: number; createdAt: string; updatedAt: string;
}
export interface ExpenseInput {
  description: string; merchant?: string | null; amountCents: number; currency?: string; exchangeRate?: number; date: string; categoryId?: number | null; paidById?: number; paymentMethodId?: number | null; notes?: string | null; installments?: number; split?: { mode: SplitMode; participants: { userId: number; value?: number }[] } | null; source?: "manual" | "text";
}
export type ReceiptStatus = "processing" | "needs_review" | "confirmed" | "failed" | "discarded";
export interface ReceiptItem { description: string; quantity: number | null; amountCents: number | null }
export interface ExpenseDraft {
  description: string; merchant: string | null; amountCents: number; currency: string; date: string | null; categoryId: number | null; paymentMethodId: number | null; paidById: number | null; installments: number; confidence: "high" | "medium" | "low"; notes?: string | null; split?: ExpenseInput["split"]; items: ReceiptItem[]; possibleDuplicates: { id: number; description: string; amountCents: number; date: string }[];
}
export interface Receipt { id: number; status: ReceiptStatus; fileUrl: string; thumbnailUrl?: string | null; summary?: string | null; mimeType: string; originalName: string | null; sizeBytes?: number; uploadedById: number; documentType: "receipt" | "invoice" | "bank_screenshot" | "transfer" | "other" | null; drafts: ExpenseDraft[]; error: string | null; expenseIds: number[]; model?: string | null; createdAt: string; processedAt?: string | null }
export interface CategoryTotal { categoryId: number | null; name: string; icon: string; color: string; totalCents: number; pct: number; budgetCents: number | null; previousCents: number; count?: number }
export interface MonthSummary {
  month: string; currency: string; isCurrentMonth?: boolean; totalCents: number; expenseCount: number; previousMonthTotalCents: number; previousMonthToDateCents?: number | null; changePct: number | null; sameMonthLastYearCents?: number; budgetCents: number | null; budgetUsedPct: number | null; projectionCents: number | null; dailyAverageCents: number; sharedTotalCents?: number;
  byCategory: CategoryTotal[];
  byMember: { userId: number; name: string; color: string; paidCents: number; shareCents: number }[];
  byPaymentMethod: { paymentMethodId: number | null; name: string; type?: string | null; totalCents: number }[];
  byWeekday?: { weekday: number; totalCents: number }[];
  daily: { date: string; totalCents: number; cumulativeCents: number }[];
  topMerchants: { merchant: string; totalCents: number; count: number }[];
  largestExpenses: Expense[];
}
export interface Trends { currency?: string; months: { month: string; totalCents: number; count?: number; byCategory: Record<string, number>; byMember?: Record<string, number> }[]; categories: { categoryId: number | null; name: string; color: string; icon: string; totalCents?: number }[]; averageMonthlyCents?: number }
export interface Insight { type: "over_budget" | "near_budget" | "projection_over_budget" | "category_spike" | "unusual_expense" | "recurring_due" | "pending_receipts"; severity: "info" | "warning" | "danger"; title: string; message: string; link?: string; data?: Record<string, unknown> }
export interface BudgetLine { categoryId: number | null; amountCents: number; effectiveFrom: string; spentCents: number; pct: number; remainingCents?: number }
export interface BudgetsResponse { month: string; total: BudgetLine | null; categories: BudgetLine[]; categoriesSumCents?: number }
export interface MemberBalance { userId: number; name: string; color: string; active?: boolean; paidCents: number; owedCents: number; settlementsSentCents?: number; settlementsReceivedCents?: number; netCents: number }
export interface Debt { fromUserId: number; toUserId: number; amountCents: number }
export interface Balances { members: MemberBalance[]; debts: Debt[] }
export interface Settlement { id: number; fromUserId: number; toUserId: number; amountCents: number; date: string; note: string | null; createdById: number; createdAt: string }
export type Frequency = "weekly" | "monthly" | "yearly";
export interface Recurring { id: number; description: string; merchant: string | null; amountCents: number | null; currency: string; exchangeRate?: number; categoryId: number | null; paidById: number; paymentMethodId: number | null; notes?: string | null; frequency: Frequency; interval: number; startDate: string; nextDate: string; endDate: string | null; mode: "auto" | "remind"; split: ExpenseInput["split"]; active: boolean; createdById?: number; createdAt?: string }
export interface Paginated<T> { items: T[]; total: number; page: number; pageSize: number; sumBaseCents: number }
export interface MonthlyReport { month: string; markdown: string; model: string | null; createdAt: string }
export interface ParsedText { summary: string; drafts: ExpenseDraft[] }
