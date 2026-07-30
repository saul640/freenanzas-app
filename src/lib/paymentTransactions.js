import { serverTimestamp } from 'firebase/firestore';

export const getMonthKey = (date = new Date()) => (
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
);

export const getAutomaticPaymentId = (userId, sourceType, sourceId, monthKey = getMonthKey()) => (
    ['payment', userId, sourceType, sourceId, monthKey]
        .map((value) => String(value).replaceAll('/', '_'))
        .join('_')
);

export const buildPaymentTransaction = ({
    userId,
    amount,
    category,
    note,
    sourceType,
    sourceId,
    date = new Date(),
    currency = 'DOP',
    extra = {},
}) => ({
    userId,
    type: 'expense',
    amount: Number(amount) || 0,
    category: category || 'Otros',
    date: date.toISOString().split('T')[0],
    monthKey: getMonthKey(date),
    note,
    currency,
    automaticPayment: true,
    paymentSourceType: sourceType,
    paymentSourceId: sourceId,
    paymentSourceMonth: getMonthKey(date),
    timestamp: serverTimestamp(),
    ...extra,
});
