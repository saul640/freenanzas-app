import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getMonthlyExpenseTransactions,
    getRecurringBudgetOverview,
    getTransactionMonthKey,
} from './monthlyBudget.js';

test('identifica el mes de pagos automáticos y fechas locales', () => {
    assert.equal(getTransactionMonthKey({ monthKey: '2026-07' }), '2026-07');
    assert.equal(getTransactionMonthKey({ date: '2026-07-30' }), '2026-07');
    assert.equal(getTransactionMonthKey({ date: 'fecha-invalida' }), null);
});

test('incluye todo gasto realizado en el presupuesto mensual', () => {
    const transactions = [
        { id: 'manual', type: 'expense', amount: 100, date: '2026-07-02' },
        { id: 'automatico', type: 'expense', amount: 250, monthKey: '2026-07', automaticPayment: true },
        { id: 'otro-mes', type: 'expense', amount: 80, date: '2026-06-30' },
        { id: 'ingreso', type: 'income', amount: 1000, date: '2026-07-15' },
        { id: 'pago-usd', type: 'expense', amount: 25, currency: 'USD', date: '2026-07-15' },
    ];

    assert.deepEqual(
        getMonthlyExpenseTransactions(transactions, '2026-07').map((item) => item.id),
        ['manual', 'automatico'],
    );
});

test('resume recurrentes activos como pagados y pendientes', () => {
    const overview = getRecurringBudgetOverview([
        { id: 'luz', active: true, amount: 2000, startDate: '2026-01-10', paidMonths: ['2026-07'] },
        { id: 'internet', active: true, amount: 1800, pagos_abonados: 300, startDate: '2026-02-05', paidMonths: [] },
        { id: 'futuro', active: true, amount: 900, startDate: '2026-08-01', paidMonths: [] },
        { id: 'borrado', active: true, isDeleted: true, amount: 500, paidMonths: [] },
    ], '2026-07');

    assert.equal(overview.items.length, 2);
    assert.equal(overview.totalCommitted, 3800);
    assert.equal(overview.totalPaid, 2300);
    assert.equal(overview.totalPending, 1500);
    assert.equal(overview.items[1].status, 'partial');
});
