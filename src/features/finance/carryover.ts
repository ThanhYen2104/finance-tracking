import type { Txn } from './types';

const validMonth = (value: string) => /^\d{4}-\d{2}$/.test(value);

export function transactionNet(txn: Txn): number {
  return txn.type === 'income' ? txn.amount : -txn.amount;
}

export function openingCarryover(txns: Txn[], periodStart: string): number {
  if (!validMonth(periodStart)) return 0;
  const monthlyNet = txns.reduce<Record<string, number>>((result, txn) => {
    const month = txn.date.slice(0, 7);
    if (!validMonth(month) || month >= periodStart) return result;
    result[month] = (result[month] || 0) + transactionNet(txn);
    return result;
  }, {});

  return Object.keys(monthlyNet)
    .sort()
    .reduce((carry, month) => Math.max(0, carry + monthlyNet[month]), 0);
}

