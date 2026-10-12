// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import QuickAddTransaction from './QuickAddTransaction';

const { saveTransactionMock, navigateMock } = vi.hoisted(() => ({
  saveTransactionMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock, useLocation: () => ({ state: null, key: 'test', pathname: '/add' }) }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ currentUser: { uid: 'fake-user' } }) }));
vi.mock('../firebase', () => ({ functions: {}, storage: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => saveTransactionMock }));
vi.mock('firebase/storage', () => ({ ref: vi.fn(), uploadBytes: vi.fn() }));
vi.mock('./BottomNav', () => ({ default: () => <nav aria-label="Navegación principal" /> }));

describe('QuickAddTransaction', () => {
  beforeEach(() => {
    window.localStorage.clear();
    saveTransactionMock.mockReset();
    saveTransactionMock.mockResolvedValue({ data: { transactionId: 'quick-1' } });
  });
  afterEach(cleanup);

  it('registers a regular expense and confirms only after the callable resolves', async () => {
    render(<QuickAddTransaction />);
    fireEvent.change(screen.getByLabelText('Importe'), { target: { value: '12,34' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar movimiento' }));

    await waitFor(() => expect(saveTransactionMock).toHaveBeenCalledTimes(1));
    expect(saveTransactionMock.mock.calls[0][0]).toMatchObject({ type: 'expense', amountMinor: 1234, currency: 'DOP', category: 'Comida' });
    expect(screen.getByText('Gasto de RD$ 12.34 guardado.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Registrar otro' })).toBeTruthy();
  });

  it('allows an unclassified income and reuses the same idempotency key on an uncertain retry', async () => {
    saveTransactionMock.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'functions/unavailable' }));
    render(<QuickAddTransaction />);
    fireEvent.click(screen.getByRole('button', { name: 'Ingreso' }));
    fireEvent.change(screen.getByLabelText('Importe'), { target: { value: '50.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sin clasificar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar movimiento' }));

    await screen.findByRole('button', { name: 'Reintentar y comprobar' });
    const originalRequestId = saveTransactionMock.mock.calls[0][0].requestId;
    expect(saveTransactionMock.mock.calls[0][0]).toMatchObject({ type: 'income', amountMinor: 5000, category: 'Sin clasificar' });
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar y comprobar' }));

    await waitFor(() => expect(saveTransactionMock).toHaveBeenCalledTimes(2));
    expect(saveTransactionMock.mock.calls[1][0].requestId).toBe(originalRequestId);
    expect(await screen.findByText('Ingreso de RD$ 50.00 guardado.')).toBeTruthy();
  });

  it('rejects ambiguous separators and keeps the entered amount after validation errors', async () => {
    render(<QuickAddTransaction />);
    fireEvent.change(screen.getByLabelText('Importe'), { target: { value: '1,234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar movimiento' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByLabelText('Importe').value).toBe('1,234');
    expect(saveTransactionMock).not.toHaveBeenCalled();
  });

  it('prevents a second submission while the first request is pending', async () => {
    let resolveRequest;
    saveTransactionMock.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    render(<QuickAddTransaction />);
    fireEvent.change(screen.getByLabelText('Importe'), { target: { value: '8' } });
    const button = screen.getByRole('button', { name: 'Guardar movimiento' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(saveTransactionMock).toHaveBeenCalledTimes(1));
    resolveRequest({ data: { transactionId: 'quick-2' } });
    expect(await screen.findByText('Gasto de RD$ 8.00 guardado.')).toBeTruthy();
  });
});
