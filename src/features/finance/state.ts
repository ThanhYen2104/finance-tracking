import type { CategoryGroups, FinanceData, Txn } from './types';

type StoredState = {
  user?: { email?: string } | null;
  txns?: Txn[];
  borrowers?: FinanceData['borrowers'];
  rates?: FinanceData['rates'];
  loans?: FinanceData['loans'];
  categories?: CategoryGroups;
  dataByUser?: Record<string, FinanceData>;
};

export function selectFinanceData(
  state: StoredState,
  email: string,
  initialTxns: Txn[],
  defaultCategories: CategoryGroups,
  isNew = false,
): FinanceData {
  const saved = state.dataByUser?.[email];
  if (saved) return saved;

  if (state.user?.email === email) {
    return {
      txns: state.txns || initialTxns,
      borrowers: state.borrowers || [],
      rates: state.rates || [],
      loans: state.loans || [],
      categories: state.categories || defaultCategories,
    };
  }

  return {
    txns: isNew ? [] : initialTxns,
    borrowers: [],
    rates: [],
    loans: [],
    categories: defaultCategories,
  };
}
