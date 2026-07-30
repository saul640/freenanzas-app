const toAmount = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
};

export const getTransactionMonthKey = (transaction) => {
    if (/^\d{4}-\d{2}$/.test(transaction?.monthKey || '')) {
        return transaction.monthKey;
    }

    const value = transaction?.timestamp?.toDate
        ? transaction.timestamp.toDate()
        : transaction?.date
            ? new Date(`${transaction.date}T12:00:00`)
            : null;

    if (!value || Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
};

export const getMonthlyExpenseTransactions = (transactions, monthKey) => (
    transactions.filter((transaction) => (
        transaction.type === 'expense'
        && transaction.estado !== 'pendiente'
        && transaction.status !== 'pendiente'
        && (!transaction.currency || transaction.currency === 'DOP')
        && getTransactionMonthKey(transaction) === monthKey
    ))
);

export const getRecurringBudgetOverview = (recurring, monthKey) => {
    const items = recurring
        .filter((item) => item.active && !item.isDeleted)
        .filter((item) => !item.startDate || item.startDate.slice(0, 7) <= monthKey)
        .map((item) => ({
            ...item,
            amount: toAmount(item.amount),
            isPaid: (item.paidMonths || []).includes(monthKey),
        }))
        .map((item) => {
            const paidAmount = item.isPaid
                ? item.amount
                : Math.min(toAmount(item.pagos_abonados), item.amount);
            return {
                ...item,
                paidAmount,
                pendingAmount: Math.max(item.amount - paidAmount, 0),
                status: item.isPaid ? 'paid' : paidAmount > 0 ? 'partial' : 'pending',
            };
        });

    return {
        items,
        totalCommitted: items.reduce((sum, item) => sum + item.amount, 0),
        totalPaid: items.reduce((sum, item) => sum + item.paidAmount, 0),
        totalPending: items.reduce((sum, item) => sum + item.pendingAmount, 0),
    };
};
