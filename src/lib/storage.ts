export type TxnType = 'expense' | 'income' | 'saving';

export type Transaction = {
  id: number;
  type: TxnType;
  cat: string;
  amount: number;
  date: string;
  note: string;
};

const STORAGE_KEY = 'budget_tracking_transactions_v1';

export function loadTransactions(): Transaction[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTransactions(transactions: Transaction[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}
