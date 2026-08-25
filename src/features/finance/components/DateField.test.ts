import { currentLocalDate, formatDateInput, isoToDateDisplay, parseDateDisplay, preserveDateEdit } from './DateField';

declare const test: (name: string, run: () => void) => void;
declare const expect: (value: unknown) => { toBe(expected: unknown): void };

test('formats a stored ISO date for the single date field', () => {
  expect(isoToDateDisplay('2026-07-18')).toBe('18/07/2026');
  expect(isoToDateDisplay('not-a-date')).toBe('');
});

test('provides the current local date as a valid ISO value', () => {
  expect(/^\d{4}-\d{2}-\d{2}$/.test(currentLocalDate())).toBe(true);
});

test('keeps manual date entry synchronized with the stored date', () => {
  expect(formatDateInput('24072026')).toBe('24/07/2026');
  expect(parseDateDisplay('24/07/2026')).toBe('2026-07-24');
});

test('preserves partial edits so deleting the month does not move the caret to the year', () => {
  expect(preserveDateEdit('24//2026')).toBe('24//2026');
  expect(preserveDateEdit('24072026')).toBe('24/07/2026');
});
