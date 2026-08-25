import { openingCarryover } from './carryover';
import type { Txn } from './types';

declare const test: (name: string, run: () => void) => void;
declare const expect: (value: unknown) => { toBe(expected: unknown): void };

const txn = (id: string, type: Txn['type'], amount: number, date: string): Txn => ({ id, type, amount, date, category: '', note: '' });

test('carries positive monthly balances into the following month', () => {
  const txns = [
    txn('1', 'income', 10_000_000, '2026-01-05'),
    txn('2', 'expense', 6_000_000, '2026-01-10'),
    txn('3', 'saving', 1_000_000, '2026-01-20'),
    txn('4', 'income', 2_000_000, '2026-02-01'),
  ];
  expect(openingCarryover(txns, '2026-02')).toBe(3_000_000);
  expect(openingCarryover(txns, '2026-03')).toBe(5_000_000);
});

test('does not carry a negative monthly balance forward', () => {
  const txns = [
    txn('1', 'income', 1_000_000, '2026-01-05'),
    txn('2', 'expense', 2_000_000, '2026-01-10'),
    txn('3', 'income', 500_000, '2026-02-01'),
  ];
  expect(openingCarryover(txns, '2026-02')).toBe(0);
  expect(openingCarryover(txns, '2026-03')).toBe(500_000);
});
