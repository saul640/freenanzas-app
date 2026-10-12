// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';

const navigate = vi.fn();

const transactionDocs = [
    {
        id: 'income-1',
        data: () => ({
            userId: 'user-1',
            type: 'income',
            amount: 1000,
            category: 'Salario',
            note: 'Nómina',
            timestamp: { toMillis: () => 3000, toDate: () => new Date('2026-07-13T12:00:00') },
        }),
    },
    {
        id: 'expense-1',
        data: () => ({
            userId: 'user-1',
            type: 'expense',
            amount: '250',
            category: 'Comida',
            note: 'Supermercado',
            timestamp: { toMillis: () => 2000, toDate: () => new Date('2026-07-12T12:00:00') },
        }),
    },
    {
        id: 'saving-1',
        data: () => ({
            userId: 'user-1',
            type: 'expense',
            amount: 100,
            category: 'Ahorro',
            note: 'Fondo de emergencia',
            timestamp: { toMillis: () => 1000, toDate: () => new Date('2026-07-11T12:00:00') },
        }),
    },
];

vi.mock('react-router-dom', () => ({
    useNavigate: () => navigate,
}));

vi.mock('../hooks/useAuth', () => {
    const authValue = {
        currentUser: { uid: 'user-1', displayName: 'Saúl Usuario', photoURL: null },
        isProUser: true,
        isTrialUser: false,
        userData: {},
        userStatus: 'PRO',
        trialDaysLeft: 0,
        trialDays: 30,
    };
    return { useAuth: () => authValue };
});

vi.mock('../hooks/useLoans', () => ({ useLoans: () => ({ loans: [] }) }));
vi.mock('../hooks/useDailyInsight', () => ({
    useDailyInsight: () => ({ insight: 'Mantén un presupuesto claro.', loading: false }),
}));

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
    collection: (_db, ...parts) => ({ path: parts.join('/') }),
    query: (reference) => reference,
    orderBy: () => ({}),
    where: () => ({}),
    onSnapshot: (reference, onData) => {
        if (reference.path === 'transactions') onData({ docs: transactionDocs });
        else onData({ docs: [] });
        return vi.fn();
    },
}));

vi.mock('./BottomNav', () => ({ default: () => <nav aria-label="Navegación principal" /> }));
vi.mock('./PaywallModal', () => ({ default: () => null }));
vi.mock('./TransactionDetailModal', () => ({ default: () => null }));

describe('Dashboard', () => {
    beforeEach(() => navigate.mockClear());
    afterEach(cleanup);

    it('muestra movimientos y ofrece el acceso al registro rápido', async () => {
        render(<Dashboard />);
        await waitFor(() => expect(screen.getByText('Registrar movimiento')).toBeTruthy());

        expect(screen.getByText('Supermercado')).toBeTruthy();
        expect(screen.getByText('Fondo de emergencia')).toBeTruthy();
        expect(screen.getByText('Movimientos Recientes')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Registrar movimiento/ }));
        expect(navigate).toHaveBeenCalledWith('/add');
    });

    it('ofrece la importación CSV desde el inicio', () => {
        render(<Dashboard />);
        fireEvent.click(screen.getByRole('button', { name: 'Importar movimientos desde CSV' }));
        expect(navigate).toHaveBeenCalledWith('/transactions/import');
    });

    it('abre el formulario avanzado desde el acceso Filtro IA', () => {
        render(<Dashboard />);
        fireEvent.click(screen.getByRole('button', { name: /Filtro IA/ }));
        expect(navigate).toHaveBeenCalledWith('/add-advanced');
    });
});
