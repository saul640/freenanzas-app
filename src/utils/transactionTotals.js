export const getTransactionAmountMinor = (transaction) => {
  if (Number.isSafeInteger(transaction.amountMinor) && transaction.amountMinor >= 0) return transaction.amountMinor;
  const amount = Number(transaction.amount);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0;
};

export const getTransactionAmount = (transaction) => getTransactionAmountMinor(transaction) / 100;
export const sumTransactionAmounts = (transactions = []) => (
  transactions.reduce((sum, transaction) => sum + getTransactionAmountMinor(transaction), 0) / 100
);

export const calculateTransactionTotals = (transactions = []) => {
  let incomeMinor = 0;
  let expenseMinor = 0;
  let savingsMinor = 0;
  let unclassifiedCount = 0;
  let unclassifiedExpenseCount = 0;

  transactions.forEach((transaction) => {
    const amountMinor = getTransactionAmountMinor(transaction);
    if (transaction.type === 'income') {
      incomeMinor += amountMinor;
      const category = (transaction.category || '').trim().toLowerCase();
      if (!category || category === 'sin clasificar') unclassifiedCount += 1;
      return;
    }
    if (transaction.type !== 'expense') return;

    expenseMinor += amountMinor;
    const category = (transaction.category || '').trim().toLowerCase();
    if (category === 'ahorro' || category === 'ahorro e inversión') savingsMinor += amountMinor;
    if (!category || category === 'sin clasificar') {
      unclassifiedExpenseCount += 1;
      unclassifiedCount += 1;
    }
  });

  const spendingExpenseMinor = expenseMinor - savingsMinor;
  return {
    income: incomeMinor / 100,
    expense: expenseMinor / 100,
    savings: savingsMinor / 100,
    spendingExpense: spendingExpenseMinor / 100,
    available: (incomeMinor - expenseMinor) / 100,
    total: (incomeMinor - expenseMinor) / 100,
    unclassifiedCount,
    unclassifiedExpenseCount,
  };
};
