import { readFileSync } from 'node:fs';
import { join } from 'node:path';

declare const test: (name: string, run: () => void) => void;
declare const expect: (value: unknown) => { toBe(expected: unknown): void; toBeGreaterThanOrEqual(expected: number): void; toContain(expected: string): void };

const css = readFileSync(join(process.cwd(), 'src/features/finance/components/theme.css'), 'utf8');
const luminance = (hex:string) => { const channels=hex.match(/[\da-f]{2}/gi)!.map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return .2126*channels[0]+.7152*channels[1]+.0722*channels[2]; };
const contrast = (foreground:string,background:string) => { const left=luminance(foreground),right=luminance(background);return (Math.max(left,right)+.05)/(Math.min(left,right)+.05); };

test('dark surfaces explicitly apply readable foreground colors', () => {
  expect(css).toContain('background: var(--paper);\n  color: var(--ink);');
  expect(css).toContain('.theme-dark .sidebar { background: linear-gradient(180deg, var(--sidebar-start), var(--sidebar-end)); color: var(--sidebar-text); }');
});

test('dark theme text pairs meet WCAG AA contrast minimums', () => {
  expect(contrast('f5f7f2','1c2920')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('d0d8cc','1c2920')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('dce7d8','12301f')).toBeGreaterThanOrEqual(4.5);
  expect(contrast('fff8e7','12301f')).toBeGreaterThanOrEqual(4.5);
});
