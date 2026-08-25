import { selectFinanceData } from './state';
import type { CategoryGroups, Txn } from './types';

declare const test: (name: string, run: () => void) => void;
declare const expect: (value: unknown) => { toBe(expected: unknown): void; toEqual(expected: unknown): void };

const categories: CategoryGroups = { income: ['Salary'], expense: [], saving: [] };
const samples: Txn[] = [{ id: 'sample', type: 'income', category: 'Salary', amount: 1, date: '2026-01-01', note: '' }];

test('keeps saved finance records isolated by account', () => {
  const alice = { txns: [], borrowers: [], rates: [], loans: [], categories };
  const bob = { txns: samples, borrowers: [], rates: [], loans: [], categories };
  const state = { dataByUser: { 'alice@example.com': alice, 'bob@example.com': bob } };

  expect(selectFinanceData(state, 'alice@example.com', samples, categories)).toBe(alice);
  expect(selectFinanceData(state, 'bob@example.com', samples, categories)).toBe(bob);
});

test('new accounts do not inherit sample or previous-account records', () => {
  const result = selectFinanceData({}, 'new@example.com', samples, categories, true);
  expect(result.txns).toEqual([]);
  expect(result.borrowers).toEqual([]);
  expect(result.categories).toEqual(categories);
});
