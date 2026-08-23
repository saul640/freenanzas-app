import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCreditPaymentUpdate, summarizeDebts } from './creditDebt.js';

test('un pago de Credimás reduce solo esa deuda y repone su disponible', () => {
    const result = buildCreditPaymentUpdate({
        card: { balanceDOP: 10604.8, credimasTotalAdeudado: 5000, credimasDisponible: 12000, credimasLimiteAprobado: 15000 },
        paymentType: 'credimas',
        amount: 1200,
    });

    assert.equal(result.appliedAmount, 1200);
    assert.deepEqual(result.updates, {
        credimasTotalAdeudado: 3800,
        credimasDisponible: 13200,
    });
    assert.equal('balanceDOP' in result.updates, false);
});

test('un pago de tarjeta reduce solo el balance de la moneda elegida', () => {
    const result = buildCreditPaymentUpdate({
        card: { balanceDOP: 10604.8, balanceUSD: 300, credimasTotalAdeudado: 5000 },
        paymentType: 'card',
        currency: 'USD',
        amount: 75,
    });

    assert.equal(result.balanceAfter, 225);
    assert.deepEqual(result.updates, { balanceUSD: 225, balanceDolaresALaFecha: 225 });
    assert.equal('credimasTotalAdeudado' in result.updates, false);
});

test('limita el disponible de Credimás y detecta pagos mayores que el saldo', () => {
    const result = buildCreditPaymentUpdate({
        card: { credimasTotalAdeudado: 300, credimasDisponible: 900, credimasLimiteAprobado: 1000 },
        paymentType: 'credimas',
        amount: 500,
    });

    assert.equal(result.appliedAmount, 300);
    assert.equal(result.balanceAfter, 0);
    assert.equal(result.updates.credimasDisponible, 1000);
});

test('el resumen de deudas incluye tarjetas, Credimás y préstamos', () => {
    const summary = summarizeDebts({
        cards: [
            { balanceDOP: 10000, balanceUSD: 50, credimasTotalAdeudado: 2500 },
            { balanceALaFecha: 3000, balanceDolaresALaFecha: 0 },
        ],
        loans: [{ balancePendiente: 7000 }],
    });

    assert.deepEqual(summary, {
        cardDOP: 13000,
        cardUSD: 50,
        credimas: 2500,
        loanDebt: 7000,
        totalDOP: 22500,
        hasDebt: true,
    });
});
