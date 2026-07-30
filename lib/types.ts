export type TransactionType = "expense" | "income";
export type Frequency = "weekly" | "monthly" | "yearly";
export interface Category { id: string; household_id: string; name: string; icon: string; type: TransactionType; is_default: boolean; }
export interface Transaction { id: string; household_id: string; user_id: string; concept: string; amount: number; date: string; category_id: string | null; type: TransactionType; note: string; merchant: string; receipt_text?: string; recurring_id?: string | null; created_at: string; category?: Category | null; }
export interface RecurringTransaction { id: string; household_id: string; concept: string; amount: number; category_id: string | null; type: TransactionType; note: string; frequency: Frequency; next_date: string; is_active: boolean; category?: Category | null; }
export interface Budget { id: string; household_id: string; category_id: string | null; amount: number; month: string; category?: Category | null; }
