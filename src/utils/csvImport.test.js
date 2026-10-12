import { describe, expect, it } from 'vitest';
import {
  detectCsvDelimiter,
  correctCsvRow,
  escapeCsvCell,
  mapCsvRows,
  parseCsvAmount,
  parseCsvDate,
  parseDelimitedText,
  suggestCsvColumnMapping,
} from './csvImport';

describe('importación de CSV', () => {
  it('detecta delimitadores y conserva delimitadores y saltos dentro de comillas', () => {
    const text = 'Fecha;Descripción;Importe\r\n01/02/2026;"Compra; tienda";1.234,50\r\n03/02/2026;"Nota\ncon línea";10,00';
    const delimiter = detectCsvDelimiter(text);
    expect(delimiter).toBe(';');
    expect(parseDelimitedText(text, delimiter)).toEqual([
      ['Fecha', 'Descripción', 'Importe'],
      ['01/02/2026', 'Compra; tienda', '1.234,50'],
      ['03/02/2026', 'Nota\ncon línea', '10,00'],
    ]);
  });

  it('interpreta importes solo según el formato decimal elegido', () => {
    expect(parseCsvAmount('1,234.50', 'dot')).toEqual({ amountMinor: 123450, sign: 1 });
    expect(parseCsvAmount('-1.234,50', 'comma')).toEqual({ amountMinor: 123450, sign: -1 });
    expect(parseCsvAmount('1,234', 'comma').error).toMatch(/ambiguo|inválido/i);
    expect(parseCsvAmount('12.345', 'dot').error).toMatch(/ambiguo|inválido/i);
  });

  it('valida fechas y no interpreta formatos ambiguos sin elección explícita', () => {
    expect(parseCsvDate('2026-02-28', 'iso')).toBe('2026-02-28');
    expect(parseCsvDate('31/02/2026', 'dmy')).toBeNull();
    expect(parseCsvDate('01/02/2026', 'dmy')).toBe('2026-02-01');
    expect(parseCsvDate('01/02/2026', 'mdy')).toBe('2026-01-02');
    expect(parseCsvDate('01/02/2026', 'iso')).toBeNull();
  });

  it('sugiere columnas, mantiene filas inválidas visibles y evita tratar transferencias como gasto', () => {
    const matrix = parseDelimitedText('Fecha,Tipo,Descripción,Importe,Moneda\n2026-02-01,Gasto,Café,-125.00,DOP\n2026-02-02,Transferencia,Entre cuentas,50.00,DOP\n2026-02-03,Gasto,Compra,25.00,USD');
    const mapping = suggestCsvColumnMapping(matrix[0]);
    const result = mapCsvRows(matrix, { mapping, dateFormat: 'iso', numberFormat: 'dot' });
    expect(result.rows[0]).toMatchObject({ type: 'expense', amountMinor: 12500, include: true });
    expect(result.rows[1].errors.join(' ')).toMatch(/transferencias/i);
    expect(result.rows[2].errors.join(' ')).toMatch(/USD/);
  });

  it('mapea columnas separadas de débito/crédito y marca filas con ambos lados usados', () => {
    const matrix = parseDelimitedText('Fecha,Débito,Crédito,Descripción\n2026-02-01,25.50,0.00,Café\n2026-02-02,0.00,100.00,Nómina\n2026-02-03,10.00,10.00,Ambigua');
    const result = mapCsvRows(matrix, {
      mapping: { date: 0, amount: -1, debit: 1, credit: 2, type: -1, description: 3, currency: -1, category: -1, externalId: -1 },
      dateFormat: 'iso', numberFormat: 'dot',
    });
    expect(result.rows[0]).toMatchObject({ type: 'expense', amountMinor: 2550, include: true });
    expect(result.rows[1]).toMatchObject({ type: 'income', amountMinor: 10000, include: true });
    expect(result.rows[2].errors.join(' ')).toMatch(/débito y de crédito/i);
  });

  it('conserva valores originales como procedencia al corregir una fila', () => {
    const matrix = parseDelimitedText('Fecha,Tipo,Descripción,Importe\n2026-02-01,Gasto,Café,-12.00');
    const { rows } = mapCsvRows(matrix, { mapping: suggestCsvColumnMapping(matrix[0]), dateFormat: 'iso', numberFormat: 'dot' });
    const corrected = correctCsvRow(rows[0], { merchant: 'Cafetería', category: 'Comida' }, { dateFormat: 'iso', numberFormat: 'dot' });
    expect(corrected.merchant).toBe('Cafetería');
    expect(corrected.rawSource.description).toBe('Café');
  });

  it('escapa fórmulas peligrosas al generar celdas CSV', () => {
    expect(escapeCsvCell('=IMPORTDATA("https://malicioso")')).toBe('"\'=IMPORTDATA(""https://malicioso"")"');
    expect(escapeCsvCell('texto,con coma')).toBe('"texto,con coma"');
  });
});
