import { parseAmountExpression } from './amountExpression';

declare const test: (name: string, run: () => void) => void;
declare const expect: (value: unknown) => { toBe(expected: unknown): void; toBeNull(): void };

test('calculates amount expressions using normal operator precedence', () => {
  expect(parseAmountExpression('100000 + 25000 * 2')).toBe(150000);
  expect(parseAmountExpression('=300000 / 3')).toBe(100000);
  expect(parseAmountExpression('(50000 + 25000) * 2')).toBe(150000);
});

test('rejects unsafe, incomplete, or non-finite amount expressions', () => {
  expect(parseAmountExpression('100000 / 0')).toBeNull();
  expect(parseAmountExpression('alert(1)')).toBeNull();
  expect(parseAmountExpression('100000 +')).toBeNull();
});
