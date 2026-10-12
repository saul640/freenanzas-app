import { describe, expect, it } from 'vitest';
import { calculateTransactionTotals } from './transactionTotals';

describe('calculateTransactionTotals', () => {
  const income = { id: 'income-1', type: 'income', amountMinor: 100001, amount: 1000.01, category: 'Salario' };
  const expense = { id: 'expense-1', type: 'expense', amountMinor: 1234, amount: 12.34, category: 'Sin clasificar' };

  it('includes unclassified expenses in totals while marking category data incomplete', () => {
    expect(calculateTransactionTotals([income, expense])).toEqual({
      income: 1000.01, expense: 12.34, savings: 0, spendingExpense: 12.34,
      available: 987.67, total: 987.67, unclassifiedCount: 1, unclassifiedExpenseCount: 1,
    });
  });

  it('reclassifies the same movement without changing balances, and edit/delete recompute from current records', () => {
    const before = calculateTransactionTotals([income, expense]);
    const classified = calculateTransactionTotals([income, { ...expense, category: 'Comida' }]);
    expect(classified).toEqual({ ...before, unclassifiedCount: 0, unclassifiedExpenseCount: 0 });

    const edited = { ...expense, amountMinor: 2500, amount: 25 };
    expect(calculateTransactionTotals([income, edited]).expense).toBe(25);
    expect(calculateTransactionTotals([income]).expense).toBe(0);
  });

  it('keeps legacy decimal movements compatible', () => {
    expect(calculateTransactionTotals([{ type: 'expense', amount: 0.1 }]).expense).toBe(0.1);
  });

  it('keeps unclassified income in balances and ignores transfers in income and expense totals', () => {
    const totals = calculateTransactionTotals([
      { type: 'income', amountMinor: 300, amount: 3, category: 'Sin clasificar' },
      { type: 'transfer', amountMinor: 50000, amount: 500, category: 'Transferencia' },
    ]);
    expect(totals.income).toBe(3);
    expect(totals.expense).toBe(0);
    expect(totals.unclassifiedCount).toBe(1);
  });
});
