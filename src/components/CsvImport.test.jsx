// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CsvImport from './CsvImport';

const { navigateMock, callableMock } = vi.hoisted(() => ({ navigateMock: vi.fn(), callableMock: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ currentUser: { uid: 'user-a' } }) }));
vi.mock('../firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({ collection: (...path) => path, getDocs: async () => ({ docs: [] }) }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_functions, name) => callableMock(name) }));
vi.mock('./BottomNav', () => ({ default: () => <nav aria-label="Navegación principal" /> }));

describe('CsvImport', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    callableMock.mockReset();
    callableMock.mockImplementation((_name) => async () => ({ data: { batches: [], matches: [], complete: true } }));
  });
  afterEach(cleanup);

  it('expone cuenta, archivo, formatos y alternativas simuladas sin abrir dispositivos automáticamente', async () => {
    render(<CsvImport />);
    expect(screen.getByRole('heading', { name: 'Movimientos desde CSV' })).toBeTruthy();
    expect(screen.getByLabelText('Cuenta o fuente')).toBeTruthy();
    expect(screen.getByLabelText('Archivo CSV')).toBeTruthy();
    expect(screen.getByLabelText('Codificación')).toBeTruthy();
    expect(screen.getByLabelText('Separador de columnas')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /captura voluntaria/i })).toBeTruthy();
    expect(callableMock).toHaveBeenCalledWith('listCsvImportBatches');
    await waitFor(() => expect(screen.getByText('Todavía no hay lotes importados.')).toBeTruthy());
  });

  it('presenta fecha y separadores después de cargar un CSV local', async () => {
    render(<CsvImport />);
    const file = new File(['Fecha,Tipo,Importe\n2026-10-10,Gasto,10.00'], 'movimientos.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode('Fecha,Tipo,Importe\n2026-10-10,Gasto,10.00').buffer });
    const input = screen.getByLabelText('Archivo CSV');
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByLabelText('Formato de fecha')).toBeTruthy();
    expect(screen.getByLabelText('Formato numérico')).toBeTruthy();
  });

  it('aclara que el reconocimiento no está activo y la alternativa manual está disponible', () => {
    render(<CsvImport />);
    expect(screen.getByText(/no hay OCR ni transcripción activos/i)).toBeTruthy();
    expect(screen.getByText(/permiso de micrófono solo se solicita al pulsar Iniciar/i)).toBeTruthy();
  });
});
