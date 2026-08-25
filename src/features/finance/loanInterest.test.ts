import { loanSchedule, projectedLoanTotal, remainingLoanBalance } from './loanInterest';
import type { Loan } from './types';

declare const test: (name: string, run: () => void) => void;
declare const expect: (value: unknown) => { toBe(expected: unknown): void; toBeCloseTo(expected: number): void };
const loan=(interestMethod:'simple'|'compound',payments?:Record<string,number>):Loan=>({id:'1',borrowerId:'b',principal:1000,rate:10,interestMethod,startDate:'2026-01-01',months:2,paid:Object.values(payments||{}).reduce((sum,value)=>sum+value,0),payments,note:''});

test('projects simple and compound interest with their correct formulas',()=>{
  expect(projectedLoanTotal(loan('simple'))).toBe(1200);
  expect(projectedLoanTotal(loan('compound'))).toBeCloseTo(1210);
});

test('simple interest arrears stay separate while compound arrears enter principal',()=>{
  const simple=loanSchedule(loan('simple',{'2026-01':50}));const compound=loanSchedule(loan('compound',{'2026-01':50}));
  expect(simple[1].principalStart).toBe(1000);
  expect(simple[1].interestOutstanding).toBe(150);
  expect(compound[1].principalStart).toBe(1050);
  expect(remainingLoanBalance(loan('compound',{'2026-01':50}))).toBeCloseTo(1155);
});

test('monthly amount due includes equal principal installment and interest',()=>{
  const simple=loanSchedule(loan('simple'));const compound=loanSchedule(loan('compound'));
  expect(simple[0].principalDue).toBe(500);
  expect(simple[0].principalInstallment).toBe(500);
  expect(simple[0].overdue).toBe(0);
  expect(simple[0].due).toBe(600);
  expect(compound[0].principalDue).toBe(500);
  expect(compound[0].due).toBe(600);
});

test('missed payments are shown as overdue instead of changing the current installment',()=>{
  const rows=loanSchedule(loan('simple'));
  expect(rows[1].principalInstallment).toBe(500);
  expect(rows[1].overdue).toBe(600);
  expect(rows[1].due).toBe(1200);
});

test('an overpayment reduces principal before the following installment',()=>{
  const rows=loanSchedule(loan('simple',{'2026-01':700}));
  expect(rows[0].principalEnd).toBe(400);
  expect(rows[1].principalDue).toBe(400);
  expect(rows[1].due).toBe(500);
});
