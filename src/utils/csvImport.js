const MAX_ROWS = 100;
const DELIMITERS = [',', ';', '\t', '|'];

export const normalizeCsvHeader = (value) => String(value ?? '')
  .replace(/^\uFEFF/, '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

export const detectCsvDelimiter = (text) => {
  const sample = String(text ?? '').slice(0, 20_000);
  let best = ',';
  let bestScore = -1;
  for (const delimiter of DELIMITERS) {
    let columns = 1;
    let quoted = false;
    let lineCounts = [];
    for (let index = 0; index < sample.length; index += 1) {
      const char = sample[index];
      if (char === '"') {
        if (quoted && sample[index + 1] === '"') index += 1;
        else quoted = !quoted;
      } else if (!quoted && char === delimiter) columns += 1;
      else if (!quoted && (char === '\n' || char === '\r')) {
        if (columns > 1) lineCounts.push(columns);
        columns = 1;
        if (char === '\r' && sample[index + 1] === '\n') index += 1;
      }
    }
    if (columns > 1) lineCounts.push(columns);
    const score = lineCounts.length ? lineCounts.reduce((sum, count) => sum + count, 0) / lineCounts.length : 0;
    if (score > bestScore) { best = delimiter; bestScore = score; }
  }
  return best;
};

export const parseDelimitedText = (text, delimiter = detectCsvDelimiter(text)) => {
  if (!DELIMITERS.includes(delimiter)) throw new TypeError('El separador del archivo no es compatible.');
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else field += char;
      continue;
    }
    if (char === '"' && field.length === 0 && !closedQuote) { quoted = true; continue; }
    if (char === delimiter) { row.push(field); field = ''; closedQuote = false; continue; }
    if (char === '\n' || char === '\r') {
      row.push(field); field = ''; closedQuote = false;
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      continue;
    }
    if (closedQuote && !/\s/.test(char)) throw new TypeError('El CSV contiene texto inesperado después de una comilla.');
    if (!closedQuote) field += char;
  }
  if (quoted) throw new TypeError('El CSV termina con una comilla sin cerrar.');
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  if (rows.length > MAX_ROWS + 1) throw new RangeError(`El archivo supera el límite de ${MAX_ROWS} movimientos.`);
  return rows;
};

export const parseCsvAmount = (rawValue, numberFormat) => {
  let value = String(rawValue ?? '').trim().replace(/\s/g, '');
  if (!value) return { error: 'Falta el importe.' };
  let negativeByParentheses = false;
  if (/^\(.*\)$/.test(value)) { negativeByParentheses = true; value = value.slice(1, -1); }
  value = value.replace(/^(?:RD\$|DOP|USD|US\$|\$)/i, '');
  let sign = 1;
  if (value.startsWith('-')) { sign = -1; value = value.slice(1); }
  else if (value.startsWith('+')) value = value.slice(1);
  if (negativeByParentheses) sign = -1;

  const decimal = numberFormat === 'comma' ? ',' : '.';
  const grouping = decimal === ',' ? '.' : ',';
  const parts = value.split(decimal);
  if (parts.length > 2) return { error: 'El importe tiene más de un separador decimal.' };
  const whole = parts[0];
  const fraction = parts[1] ?? '';
  const groupedPattern = new RegExp(`^\\d{1,3}(?:\\${grouping}\\d{3})+$`);
  const plainPattern = /^\d+$/;
  if (!(plainPattern.test(whole) || groupedPattern.test(whole)) || (fraction && !/^\d{1,2}$/.test(fraction))) {
    return { error: 'Formato ambiguo o inválido. Revisa el separador de miles y decimal seleccionado.' };
  }
  const wholeDigits = whole.split(grouping).join('');
  const minor = Number(wholeDigits) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor <= 0) return { error: 'El importe debe ser mayor que cero y válido.' };
  return { amountMinor: minor, sign };
};

const validDate = (year, month, day) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const parseCsvDate = (rawValue, format) => {
  const value = String(rawValue ?? '').trim();
  let parts;
  if (format === 'iso' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    parts = value.split('-').map(Number);
  } else if ((format === 'dmy' || format === 'mdy') && /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(value)) {
    const [first, second, year] = value.split(/[-/.]/).map(Number);
    parts = format === 'dmy' ? [year, second, first] : [year, first, second];
  }
  if (!parts || !validDate(...parts)) return null;
  return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
};

const mapType = (rawValue, amountSign) => {
  const value = normalizeCsvHeader(rawValue);
  if (!value) return amountSign < 0 ? 'expense' : 'income';
  if (['ingreso', 'income', 'credit', 'abono', 'deposit', 'deposito'].includes(value)) return 'income';
  if (['gasto', 'expense', 'debit', 'cargo', 'compra', 'purchase'].includes(value)) return 'expense';
  if (['transferencia', 'transfer', 'payment', 'pago_tarjeta'].includes(value)) return 'transfer';
  return null;
};

const parseOptionalAmount = (raw, numberFormat) => {
  if (!String(raw ?? '').trim()) return null;
  if (/^[+-]?0+(?:[.,]0{1,2})?$/.test(String(raw).trim())) return { amountMinor: 0, sign: 1 };
  return parseCsvAmount(raw, numberFormat);
};

export const suggestCsvColumnMapping = (headers) => {
  const normalized = headers.map(normalizeCsvHeader);
  const find = (names) => normalized.findIndex((name) => names.includes(name));
  return {
    date: find(['date', 'fecha', 'transaction_date', 'posting_date']),
    amount: find(['amount', 'importe', 'monto', 'valor', 'total']),
    debit: find(['debit', 'debito', 'withdrawal', 'withdrawals', 'cargo']),
    credit: find(['credit', 'credito', 'deposit', 'deposito', 'abono']),
    type: find(['type', 'tipo', 'transaction_type', 'debit_credit']),
    description: find(['description', 'descripcion', 'concept', 'concepto', 'memo', 'detail', 'detalle']),
    currency: find(['currency', 'moneda', 'currency_code']),
    category: find(['category', 'categoria']),
    externalId: find(['transaction_id', 'id', 'reference', 'referencia', 'folio']),
  };
};

export const mapCsvRows = (matrix, { mapping, dateFormat = 'iso', numberFormat = 'dot', currency = 'DOP' }) => {
  if (!Array.isArray(matrix) || matrix.length < 2) throw new TypeError('El archivo debe incluir encabezados y al menos una fila.');
  const headers = matrix[0].map((header) => String(header ?? '').trim());
  if (!headers.some(Boolean)) throw new TypeError('No se encontraron encabezados en la primera fila.');
  const hasSeparateAmounts = mapping?.amount < 0 && (mapping?.debit >= 0 || mapping?.credit >= 0);
  if (!Number.isInteger(mapping?.date) || (!Number.isInteger(mapping?.amount) && !hasSeparateAmounts)) {
    throw new TypeError('Selecciona una columna de fecha y una de importe, o columnas de débito/crédito.');
  }
  const rows = matrix.slice(1).map((cells, index) => {
    const cell = (key) => mapping[key] >= 0 ? String(cells[mapping[key]] ?? '').trim() : '';
    const debit = hasSeparateAmounts ? parseOptionalAmount(cell('debit'), numberFormat) : null;
    const credit = hasSeparateAmounts ? parseOptionalAmount(cell('credit'), numberFormat) : null;
    const bothSidesUsed = Boolean(debit?.amountMinor && credit?.amountMinor);
    const selectedSide = debit?.amountMinor ? debit : credit?.amountMinor ? credit : null;
    const parsedAmount = hasSeparateAmounts
      ? selectedSide || { error: [debit?.error, credit?.error].filter(Boolean).join(' ') || 'No hay importe en las columnas de débito o crédito.' }
      : parseCsvAmount(cell('amount'), numberFormat);
    const date = parseCsvDate(cell('date'), dateFormat);
    const rowCurrency = (cell('currency') || currency).toUpperCase().replace(/\s/g, '');
    const rawType = cell('type') || (hasSeparateAmounts && selectedSide ? (debit?.amountMinor ? 'gasto' : 'ingreso') : '');
    const type = parsedAmount.amountMinor ? mapType(rawType, parsedAmount.sign) : null;
    const errors = [];
    if (bothSidesUsed) errors.push('La fila tiene importe de débito y de crédito; revisa el archivo o el mapeo.');
    if (parsedAmount.error) errors.push(parsedAmount.error);
    if (!date) errors.push('Fecha inválida o incompatible con el formato elegido.');
    if (!['DOP'].includes(rowCurrency)) errors.push(`Moneda ${rowCurrency} no admitida para importar en el presupuesto actual.`);
    if (!type) errors.push('No se pudo interpretar el tipo de movimiento.');
    if (type === 'transfer') errors.push('Las transferencias se gestionan en el flujo de transferencias; no se importan como ingresos o gastos.');
    const rawAmount = hasSeparateAmounts
      ? (debit?.amountMinor ? cell('debit') : cell('credit'))
      : cell('amount');
    return {
      rowKey: `row-${index + 2}`,
      sourceRow: index + 2,
      rawDate: cell('date'),
      rawAmount,
      rawType,
      rawCurrency: cell('currency'),
      rawSource: {
        date: cell('date').slice(0, 500),
        amount: rawAmount.slice(0, 500),
        debit: cell('debit').slice(0, 500),
        credit: cell('credit').slice(0, 500),
        type: cell('type').slice(0, 500),
        currency: cell('currency').slice(0, 500),
        description: cell('description').slice(0, 500),
        category: cell('category').slice(0, 500),
      },
      rowStructuralError: bothSidesUsed ? 'La fila tiene importe de débito y de crédito; revisa el archivo o el mapeo.' : '',
      date,
      amountMinor: parsedAmount.amountMinor ?? null,
      currency: rowCurrency,
      type: type === 'transfer' ? null : type,
      merchant: cell('description').slice(0, 120),
      note: '',
      category: cell('category').slice(0, 80) || 'Sin clasificar',
      externalId: cell('externalId').slice(0, 120),
      errors,
      include: errors.length === 0,
    };
  });
  return { headers, rows };
};

export const correctCsvRow = (row, changes, { dateFormat = 'iso', numberFormat = 'dot', currency = 'DOP' } = {}) => {
  const next = { ...row, ...changes };
  const parsedAmount = parseCsvAmount(next.rawAmount, numberFormat);
  const date = parseCsvDate(next.rawDate, dateFormat);
  const rowCurrency = String(next.rawCurrency || currency).toUpperCase().replace(/\s/g, '');
  const type = parsedAmount.amountMinor ? mapType(next.rawType, parsedAmount.sign) : null;
  const errors = [];
  if (next.rowStructuralError) errors.push(next.rowStructuralError);
  if (parsedAmount.error) errors.push(parsedAmount.error);
  if (!date) errors.push('Fecha inválida o incompatible con el formato elegido.');
  if (rowCurrency !== 'DOP') errors.push(`Moneda ${rowCurrency} no admitida para importar en el presupuesto actual.`);
  if (!type) errors.push('No se pudo interpretar el tipo de movimiento.');
  if (type === 'transfer') errors.push('Las transferencias se gestionan en el flujo de transferencias; no se importan como ingresos o gastos.');
  if (!String(next.category || '').trim()) errors.push('Asigna una categoría o selecciona Sin clasificar.');
  return {
    ...next,
    date,
    amountMinor: parsedAmount.amountMinor ?? null,
    currency: rowCurrency,
    type: type === 'transfer' ? null : type,
    errors,
    include: errors.length === 0,
  };
};

export const escapeCsvCell = (value) => {
  const safe = String(value ?? '').replace(/^[=+@]/, "'$&");
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
