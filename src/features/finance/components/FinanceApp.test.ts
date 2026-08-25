import { borrowerDefaultRate, currentDayInMonth } from './FinanceApp';

declare const test: (name: string, run: () => void) => void;
declare const expect: (value: unknown) => { toBe(expected: unknown): void };

test('keeps the current day while changing to the viewed transaction month', () => {
  expect(currentDayInMonth('2026-07', new Date(2026, 7, 15))).toBe('2026-07-15');
});

test('uses the last valid day when the viewed month is shorter', () => {
  expect(currentDayInMonth('2026-02', new Date(2026, 0, 31))).toBe('2026-02-28');
  expect(currentDayInMonth('2024-02', new Date(2024, 0, 31))).toBe('2024-02-29');
});

test('loads the saved borrower rate when a borrower is selected', () => {
  const borrowers = [{ id:'a',name:'A',phone:'',rate:1.2 },{ id:'b',name:'B',phone:'',rate:2.5 }];
  expect(borrowerDefaultRate(borrowers,'b')).toBe(2.5);
  expect(borrowerDefaultRate(borrowers,'missing')).toBe('');
});
