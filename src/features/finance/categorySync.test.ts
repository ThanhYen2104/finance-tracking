import { renameCategoryInTransactions } from './categorySync';
import type { Txn } from './types';

declare const test: (name: string, run: () => void) => void;
declare const expect: (value: unknown) => { toBe(expected: unknown): void; toEqual(expected: unknown): void };

const records: Txn[] = [
  { id: '1', type: 'expense', category: 'Đi lại', amount: 10, date: '2026-01-01', note: '' },
  { id: '2', type: 'income', category: 'Đi lại', amount: 20, date: '2026-01-02', note: '' },
];

test('renames the category only on transactions with the matching type and name', () => {
  const result = renameCategoryInTransactions(records, 'expense', 'Đi lại', 'expense', 'Di chuyển');
  expect(result[0].category).toBe('Di chuyển');
  expect(result[1]).toBe(records[1]);
});

test('moves matching transactions when the category type also changes', () => {
  const result = renameCategoryInTransactions(records, 'expense', 'Đi lại', 'saving', 'Quỹ đi lại');
  expect({ type: result[0].type, category: result[0].category }).toEqual({ type: 'saving', category: 'Quỹ đi lại' });
});
