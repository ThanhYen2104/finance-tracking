export type TxnType = 'income' | 'expense' | 'saving';

export type Txn = {
  id: string;
  type: TxnType;
  category: string;
  amount: number;
  date: string;
  note: string;
};

export type Borrower = { id: string; name: string; phone: string; rate: number };
export type LendingRate = { id: string; name: string; percent: number; note: string };
export type Loan = {
  id: string;
  borrowerId: string;
  principal: number;
  rate: number;
  interestMethod?: 'simple' | 'compound';
  startDate: string;
  months: number;
  paid: number;
  payments?: Record<string, number>;
  note: string;
};
export type User = {
  name: string;
  email: string;
  password?: string;
  passwordHash?: string;
  passwordSalt?: string;
};
export type CategoryGroups = Record<TxnType, string[]>;
export type LanguageCode = 'vi' | 'en';
export type Theme = 'light' | 'dark';

export type FinanceData = {
  txns: Txn[];
  borrowers: Borrower[];
  rates: LendingRate[];
  loans: Loan[];
  categories: CategoryGroups;
};
