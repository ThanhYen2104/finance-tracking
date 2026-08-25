import type { Txn } from './types';

export function renameCategoryInTransactions(
  txns: Txn[],
  previousType: Txn['type'],
  previousName: string,
  nextType: Txn['type'],
  nextName: string,
) {
  return txns.map(txn => txn.type === previousType && txn.category === previousName
    ? { ...txn, type: nextType, category: nextName }
    : txn);
}
