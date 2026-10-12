import { createHash } from 'node:crypto';

const MAX_ROWS = 100;
const MAX_AMOUNT_MINOR = 100_000_000_000_000;
const hash = (value) => createHash('sha256').update(value).digest('hex');

const isDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const normalizeCsvImport = (uid, input) => {
  if (!uid || typeof uid !== 'string') throw new TypeError('Autenticación requerida.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Lote inválido.');
  const { batchId, fileName, accountId = '', accountLabel, timeZone, rows, reviewedDuplicateIds = {} } = input;
  if (typeof batchId !== 'string' || !/^[a-f0-9]{64}$/.test(batchId)) throw new TypeError('Identificador de lote inválido.');
  if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > 120) throw new TypeError('Nombre de archivo inválido.');
  if (typeof accountId !== 'string' || accountId.length > 120 || (accountId && (!/^[A-Za-z0-9_.-]+$/.test(accountId) || accountId === '.' || accountId === '..'))) throw new TypeError('Cuenta inválida.');
  if (typeof accountLabel !== 'string' || !accountLabel.trim() || accountLabel.length > 120) throw new TypeError('Selecciona una cuenta o fuente.');
  if (typeof timeZone !== 'string' || timeZone.length > 100) throw new TypeError('Zona horaria inválida.');
  try { new Intl.DateTimeFormat('en', { timeZone }).format(new Date()); }
  catch { throw new TypeError('La zona horaria no está reconocida.'); }
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_ROWS) throw new TypeError(`El lote debe contener de 1 a ${MAX_ROWS} movimientos válidos.`);

  const seenKeys = new Set();
  const seenExternalIds = new Set();
  const normalizedRows = rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new TypeError('Fila de importación inválida.');
    const { rowKey, sourceRow, date, amountMinor, currency, type, rawSource } = row;
    if (typeof rowKey !== 'string' || !/^row-\d{1,6}$/.test(rowKey) || seenKeys.has(rowKey)) throw new TypeError('Clave de fila inválida o repetida.');
    seenKeys.add(rowKey);
    if (!Number.isInteger(sourceRow) || sourceRow < 2 || sourceRow > 100_000) throw new TypeError('Número de fila inválido.');
    if (!isDate(date)) throw new TypeError(`La fecha de ${rowKey} no es válida.`);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_AMOUNT_MINOR) throw new TypeError(`El importe de ${rowKey} debe expresarse como centavos válidos.`);
    if (currency !== 'DOP') throw new TypeError(`La moneda de ${rowKey} no está admitida.`);
    if (!['income', 'expense'].includes(type)) throw new TypeError(`El tipo de ${rowKey} debe ser ingreso o gasto; transferencias no se importan como gasto.`);
    const sourceFields = ['date', 'amount', 'debit', 'credit', 'type', 'currency', 'description', 'category'];
    if (!rawSource || typeof rawSource !== 'object' || Array.isArray(rawSource) || Object.keys(rawSource).some((key) => !sourceFields.includes(key))) {
      throw new TypeError(`La procedencia de ${rowKey} no es válida.`);
    }
    for (const field of sourceFields) {
      if (typeof (rawSource[field] ?? '') !== 'string' || (rawSource[field] ?? '').length > 500) throw new TypeError(`El valor original de ${field} en ${rowKey} supera el límite.`);
    }
    for (const [field, max] of [['merchant', 120], ['note', 500], ['category', 80], ['externalId', 120]]) {
      if (typeof (row[field] ?? '') !== 'string' || (row[field] ?? '').length > max) throw new TypeError(`El campo ${field} de ${rowKey} no es válido.`);
    }
    const externalId = (row.externalId || '').trim();
    if (externalId) {
      const scopedId = `${accountId || accountLabel}:${externalId}`;
      if (seenExternalIds.has(scopedId)) throw new TypeError('El archivo repite un identificador externo. Revisa las filas antes de confirmar.');
      seenExternalIds.add(scopedId);
    }
    const normalized = {
      rowKey, sourceRow, date, amountMinor, amount: amountMinor / 100, currency, type,
      merchant: (row.merchant || '').trim(), note: (row.note || '').trim(),
      category: (row.category || '').trim() || 'Sin clasificar', externalId,
      rawSource: Object.fromEntries(sourceFields.map((field) => [field, rawSource[field] || ''])),
    };
    normalized.rowFingerprint = hash(JSON.stringify({
      accountId, accountLabel, date, amountMinor, currency, type,
      merchant: normalized.merchant.toLowerCase(), note: normalized.note.toLowerCase(),
    }));
    return normalized;
  });
  if (!reviewedDuplicateIds || typeof reviewedDuplicateIds !== 'object' || Array.isArray(reviewedDuplicateIds)) throw new TypeError('La revisión de duplicados no es válida.');
  const duplicateReviews = {};
  for (const [rowKey, ids] of Object.entries(reviewedDuplicateIds)) {
    if (!seenKeys.has(rowKey) || !Array.isArray(ids) || ids.length > 10 || ids.some((id) => typeof id !== 'string' || id.length > 160)) {
      throw new TypeError('La lista de posibles duplicados revisados no es válida.');
    }
    duplicateReviews[rowKey] = [...new Set(ids)].sort();
  }
  const requestHash = hash(JSON.stringify({ uid, batchId, fileName, accountId, accountLabel, timeZone, rows: normalizedRows }));
  return { uid, batchId, fileName: fileName.trim(), accountId, accountLabel: accountLabel.trim(), timeZone, rows: normalizedRows, reviewedDuplicateIds: duplicateReviews, requestHash };
};

export const assertCsvAccountOwnership = async ({ database, uid, accountId }) => {
  if (!accountId) return true;
  if (typeof accountId !== 'string' || accountId.length > 120 || !/^[A-Za-z0-9_.-]+$/.test(accountId) || accountId === '.' || accountId === '..') {
    const error = new Error('La cuenta seleccionada no es válida.');
    error.code = 'invalid-argument';
    throw error;
  }
  const account = await database.doc(`users/${uid}/creditCards/${accountId}`).get();
  if (!account.exists) {
    const error = new Error('La cuenta seleccionada no pertenece a este usuario.');
    error.code = 'permission-denied';
    throw error;
  }
  return true;
};

const getDuplicateCandidates = (existing, row, accountId, accountLabel = '') => existing.filter((transaction) => {
  const txAccountId = transaction.tarjetaCreditoId || transaction.accountId || '';
  const sameAccount = accountId
    ? !txAccountId || txAccountId === accountId
    : !transaction.accountLabel || transaction.accountLabel === accountLabel;
  if (!sameAccount) return false;
  if (row.externalId && transaction.source?.externalId === row.externalId) return true;
  if (row.rowFingerprint && transaction.source?.rowFingerprint === row.rowFingerprint) return true;
  const date = transaction.date || '';
  const amountMinor = Number.isSafeInteger(transaction.amountMinor)
    ? transaction.amountMinor
    : Math.round(Number(transaction.amount || 0) * 100);
  if (date !== row.date || amountMinor !== row.amountMinor || transaction.type !== row.type) return false;
  if ((transaction.currency || 'DOP') !== row.currency) return false;
  const merchant = (transaction.merchant || transaction.note || '').trim().toLowerCase();
  const incoming = (row.merchant || row.note || '').trim().toLowerCase();
  return !merchant || !incoming || merchant === incoming;
}).slice(0, 10);

export const analyzeCsvImport = async ({ database, uid, rows, accountId = '', accountLabel = '', limit = 5000 }) => {
  const snapshot = await database.collection('transactions')
    .where('userId', '==', uid)
    .limit(limit + 1)
    .get();
  const complete = snapshot.size <= limit;
  const existing = snapshot.docs.slice(0, limit).map((item) => ({ id: item.id, ...item.data() }));
  return {
    complete,
    scanned: existing.length,
    matches: rows.map((row) => {
      const candidates = getDuplicateCandidates(existing, row, accountId, accountLabel).map((transaction) => ({
        id: transaction.id,
        date: transaction.date || '',
        amountMinor: Number.isSafeInteger(transaction.amountMinor) ? transaction.amountMinor : Math.round(Number(transaction.amount || 0) * 100),
        type: transaction.type,
        label: transaction.merchant || transaction.note || transaction.category || 'Movimiento existente',
        exactExternalId: Boolean(row.externalId && transaction.source?.externalId === row.externalId),
      }));
      return { rowKey: row.rowKey, candidates };
    }),
  };
};

const makeTransactionId = (uid, batchId, rowKey) => `csv_${hash(`${uid}|${batchId}|${rowKey}`).slice(0, 56)}`;

export const persistCsvImport = async ({ database, batch, now }) => {
  const userBatchRef = database.doc(`users/${batch.uid}/importBatches/${batch.batchId}`);
  const transactionRows = batch.rows.map((row) => ({
    row,
    transactionId: makeTransactionId(batch.uid, batch.batchId, row.rowKey),
  }));
  const transactionRefs = transactionRows.map(({ transactionId }) => database.doc(`transactions/${transactionId}`));
  return database.runTransaction(async (transaction) => {
    const batchSnapshot = await transaction.get(userBatchRef);
    if (batchSnapshot.exists) {
      const saved = batchSnapshot.data();
      if (saved.requestHash !== batch.requestHash) {
        const error = new Error('Este lote ya existe con otros datos.');
        error.code = 'already-exists';
        throw error;
      }
      return { batchId: batch.batchId, transactionIds: saved.transactionIds || [], duplicate: true, status: saved.status };
    }
    const existingSnapshot = await transaction.get(
      database.collection('transactions').where('userId', '==', batch.uid).limit(5001),
    );
    if (existingSnapshot.size > 5000) {
      const error = new Error('Hay demasiados movimientos para validar los duplicados en una sola operación. Reduce el archivo o revisa primero el historial.');
      error.code = 'failed-precondition';
      throw error;
    }
    const existing = existingSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    for (const row of batch.rows) {
      const candidates = getDuplicateCandidates(existing, row, batch.accountId, batch.accountLabel);
      const reviewed = batch.reviewedDuplicateIds[row.rowKey] || [];
      if (candidates.some((candidate) => !reviewed.includes(candidate.id))) {
        const error = new Error('Aparecieron coincidencias posibles desde la vista previa. Revisa los duplicados y vuelve a confirmar el lote.');
        error.code = 'failed-precondition';
        throw error;
      }
    }
    const existingRows = await Promise.all(transactionRefs.map((ref) => transaction.get(ref)));
    if (existingRows.some((snapshot) => snapshot.exists)) {
      const error = new Error('Parte de este lote ya está registrada. El lote no se guardó para evitar duplicados.');
      error.code = 'already-exists';
      throw error;
    }
    const originalRows = [];
    transactionRows.forEach(({ row, transactionId }, index) => {
      const data = {
        userId: batch.uid,
        type: row.type,
        amount: row.amount,
        amountMinor: row.amountMinor,
        currency: row.currency,
        category: row.category,
        classificationStatus: row.category.toLowerCase() === 'sin clasificar' ? 'unclassified' : 'classified',
        date: row.date,
        timeZone: batch.timeZone,
        note: row.note,
        merchant: row.merchant,
        accountId: batch.accountId || '',
        accountLabel: batch.accountLabel,
        importBatchId: batch.batchId,
        sourceType: 'csv_import',
        source: { kind: 'csv', fileName: batch.fileName, rowKey: row.rowKey, sourceRow: row.sourceRow, externalId: row.externalId, rowFingerprint: row.rowFingerprint, original: row.rawSource },
        status: 'contabilizado',
        estado: 'contabilizado',
        timestamp: now,
      };
      transaction.create(transactionRefs[index], data);
      originalRows.push({ ...row, transactionId, transactionData: data });
    });
    transaction.create(userBatchRef, {
      userId: batch.uid,
      batchId: batch.batchId,
      requestHash: batch.requestHash,
      sourceType: 'csv',
      fileName: batch.fileName,
      accountId: batch.accountId,
      accountLabel: batch.accountLabel,
      timeZone: batch.timeZone,
      status: 'posted',
      rowCount: originalRows.length,
      transactionIds: originalRows.map((row) => row.transactionId),
      rows: originalRows,
      createdAt: now,
      corrections: [],
    });
    return { batchId: batch.batchId, transactionIds: originalRows.map((row) => row.transactionId), duplicate: false, status: 'posted' };
  });
};

export const changeCsvImportStatus = async ({ database, uid, batchId, action, now }) => {
  if (!/^[a-f0-9]{64}$/.test(batchId || '')) throw new TypeError('Identificador de lote inválido.');
  if (!['undo', 'restore'].includes(action)) throw new TypeError('Acción inválida.');
  const batchRef = database.doc(`users/${uid}/importBatches/${batchId}`);
  return database.runTransaction(async (transaction) => {
    const batchSnapshot = await transaction.get(batchRef);
    if (!batchSnapshot.exists) {
      const error = new Error('No encontramos este lote.'); error.code = 'not-found'; throw error;
    }
    const batch = batchSnapshot.data();
    const expected = action === 'undo' ? 'posted' : 'undone';
    if (batch.status !== expected) {
      const error = new Error(action === 'undo' ? 'Este lote ya está deshecho.' : 'Este lote ya está activo.'); error.code = 'failed-precondition'; throw error;
    }
    const entries = batch.rows || [];
    if (!entries.length || entries.length > MAX_ROWS) throw new TypeError('El historial del lote no es válido.');
    const refs = entries.map((entry) => database.doc(`transactions/${entry.transactionId}`));
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    if (action === 'undo') {
      if (snapshots.some((snap) => snap.exists && snap.data().importBatchId !== batchId)) {
        const error = new Error('Un movimiento del lote cambió de procedencia; no se modificó ningún movimiento.'); error.code = 'failed-precondition'; throw error;
      }
      snapshots.forEach((snap, index) => { if (snap.exists) transaction.delete(refs[index]); });
      transaction.update(batchRef, { status: 'undone', undoneAt: now });
    } else {
      if (snapshots.some((snap) => snap.exists)) {
        const error = new Error('Algunos movimientos del lote ya existen; no se restauró ninguna fila.'); error.code = 'already-exists'; throw error;
      }
      entries.forEach((entry, index) => transaction.create(refs[index], entry.transactionData));
      transaction.update(batchRef, { status: 'posted', restoredAt: now });
    }
    return { batchId, status: action === 'undo' ? 'undone' : 'posted', count: entries.length };
  });
};
