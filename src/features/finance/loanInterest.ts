import type { Loan } from './types';

export type LoanScheduleRow = { key:string; principalStart:number; principalInstallment:number; principalDue:number; interest:number; overdue:number; due:number; paid:number|null; status:'Chưa trả'|'Trả một phần'|'Đã trả'; principalEnd:number; interestOutstanding:number; balanceEnd:number };

const monthKey = (date:string) => date.slice(0,7);
const addMonth = (key:string, offset:number) => { const [year,month]=key.split('-').map(Number);const date=new Date(year,month-1+offset,1);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; };
export const loanMethod = (loan:Loan) => loan.interestMethod === 'compound' ? 'compound' : 'simple';

export function projectedLoanTotal(loan:Loan) {
  const principal=Math.max(0,Number(loan.principal)||0),rate=Math.max(0,Number(loan.rate)||0)/100,months=Math.max(1,Number(loan.months)||1);
  return loanMethod(loan)==='compound'?principal*Math.pow(1+rate,months):principal*(1+rate*months);
}

export function loanSchedule(loan:Loan):LoanScheduleRow[] {
  const rows:LoanScheduleRow[]=[];const originalPrincipal=Math.max(0,Number(loan.principal)||0),rate=Math.max(0,Number(loan.rate)||0)/100,method=loanMethod(loan),months=Math.max(1,Number(loan.months)||1),monthlyPrincipal=originalPrincipal/months;
  let principal=originalPrincipal,interestOutstanding=0,principalOutstanding=0;
  for(let index=0;index<months;index+=1){
    const key=addMonth(monthKey(loan.startDate),index),interest=(method==='simple'?originalPrincipal:principal)*rate,raw=loan.payments?.[key],hasPaid=raw!==undefined&&raw!==null,paid=hasPaid?Math.max(0,Number(raw)||0):0;
    if(method==='simple'){
      const overdue=interestOutstanding+principalOutstanding,principalInstallment=Math.min(principal,monthlyPrincipal),interestDue=interestOutstanding+interest,principalDue=Math.min(principal,principalOutstanding+principalInstallment),due=interestDue+principalDue,interestPaid=Math.min(paid,interestDue),principalPaid=Math.min(principal,Math.max(0,paid-interestPaid));interestOutstanding=Math.max(0,interestDue-interestPaid);principalOutstanding=Math.max(0,principalDue-principalPaid);const principalEnd=Math.max(0,principal-principalPaid),balanceEnd=principalEnd+interestOutstanding;const status:LoanScheduleRow['status']=!hasPaid||paid<=0?'Chưa trả':paid<due-.5?'Trả một phần':'Đã trả';rows.push({key,principalStart:principal,principalInstallment,principalDue,interest,overdue,due,paid:hasPaid?paid:null,status,principalEnd,interestOutstanding,balanceEnd});principal=principalEnd;
    }else{
      const overdue=principalOutstanding,principalInstallment=Math.min(principal,monthlyPrincipal),principalDue=Math.min(principal,principalOutstanding+principalInstallment),due=interest+principalDue,interestPaid=Math.min(paid,interest),principalPaid=Math.min(principal,Math.max(0,paid-interestPaid)),unpaidInterest=Math.max(0,interest-interestPaid);principalOutstanding=Math.max(0,principalDue-principalPaid);const principalEnd=Math.max(0,principal+unpaidInterest-principalPaid),balanceEnd=principalEnd;const status:LoanScheduleRow['status']=!hasPaid||paid<=0?'Chưa trả':paid<due-.5?'Trả một phần':'Đã trả';rows.push({key,principalStart:principal,principalInstallment,principalDue,interest,overdue,due,paid:hasPaid?paid:null,status,principalEnd,interestOutstanding:0,balanceEnd});principal=principalEnd;
    }
    if(principal<=.5&&interestOutstanding<=.5)break;
  }
  return rows;
}

export function remainingLoanBalance(loan:Loan) {
  const hasMonthlyPayments=Boolean(loan.payments&&Object.keys(loan.payments).length);if(!hasMonthlyPayments)return Math.max(0,projectedLoanTotal(loan)-(Number(loan.paid)||0));const schedule=loanSchedule(loan);return schedule.length?schedule[schedule.length-1].balanceEnd:0;
}
