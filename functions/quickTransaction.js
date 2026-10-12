import { createHash } from 'node:crypto';

export const QUICK_UNCLASSIFIED_CATEGORY = 'Sin clasificar';
export const MAX_QUICK_AMOUNT_MINOR = 100_000_000_000_000;

const isValidCalendarDate = (date) => {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day;
};

export const normalizeQuickTransaction = (uid, input) => {
  if (!uid || typeof uid !== 'string') throw new TypeError('Autenticación requerida.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Datos del movimiento inválidos.');
  const { requestId, type, amountMinor, currency, category, date, timeZone, note, merchant, receiptPath } = input;

  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(requestId)) {
    throw new TypeError('Identificador de solicitud inválido.');
  }
  if (!['income', 'expense'].includes(type)) throw new TypeError('El tipo debe ser ingreso o gasto.');
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_QUICK_AMOUNT_MINOR) {
    throw new TypeError('El importe debe ser válido y expresarse en centavos.');
  }
  if (currency !== 'DOP') throw new TypeError('Esta versión solo permite registrar pesos dominicanos (DOP).');
  if (typeof category !== 'string' || category.trim().length > 100) throw new TypeError('Selecciona una categoría válida.');
  if (!isValidCalendarDate(date)) throw new TypeError('La fecha no es válida.');
  if (typeof timeZone !== 'string' || timeZone.length > 100) throw new TypeError('La zona horaria no es válida.');
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(new Date());
  } catch {
    throw new TypeError('La zona horaria no está reconocida.');
  }
  if (typeof note !== 'string' || note.length > 500) throw new TypeError('La nota no puede exceder 500 caracteres.');
  if (typeof merchant !== 'string' || merchant.length > 120) throw new TypeError('El comercio o fuente no puede exceder 120 caracteres.');

  const normalized = {
    requestId,
    userId: uid,
    type,
    amountMinor,
    amount: amountMinor / 100,
    currency,
    category: category.trim() || QUICK_UNCLASSIFIED_CATEGORY,
    classificationStatus: category.trim() === QUICK_UNCLASSIFIED_CATEGORY ? 'unclassified' : 'classified',
    date,
    timeZone,
    note: note.trim(),
    merchant: merchant.trim(),
    receiptPath: receiptPath || '',
  };

  if (normalized.receiptPath) {
    const prefix = `transaction-receipts/${uid}/${requestId}/`;
    if (typeof receiptPath !== 'string' || !receiptPath.startsWith(prefix) || receiptPath.includes('..') || receiptPath.length > 500) {
      throw new TypeError('El comprobante no pertenece a esta solicitud.');
    }
  }

  const hashPayload = JSON.stringify({
    userId: normalized.userId,
    type: normalized.type,
    amountMinor: normalized.amountMinor,
    currency: normalized.currency,
    category: normalized.category,
    date: normalized.date,
    timeZone: normalized.timeZone,
    note: normalized.note,
    merchant: normalized.merchant,
    receiptPath: normalized.receiptPath,
  });
  normalized.requestHash = createHash('sha256').update(hashPayload).digest('hex');
  return normalized;
};

export const persistQuickTransaction = async ({ database, movement, uid, serverTimestamp }) => {
  const movementRef = database.collection('transactions').doc(movement.requestId);
  return database.runTransaction(async (transaction) => {
    const existing = await transaction.get(movementRef);
    if (existing.exists) {
      const existingData = existing.data();
      if (existingData.userId !== uid || existingData.quickRequestHash !== movement.requestHash) {
        const error = new Error('Este identificador ya se usó con otros datos.');
        error.code = 'already-exists';
        throw error;
      }
      return { transactionId: movement.requestId, duplicate: true };
    }

    transaction.create(movementRef, {
      userId: uid,
      type: movement.type,
      amount: movement.amount,
      amountMinor: movement.amountMinor,
      currency: movement.currency,
      category: movement.category,
      classificationStatus: movement.classificationStatus,
      date: movement.date,
      timeZone: movement.timeZone,
      note: movement.note,
      merchant: movement.merchant,
      ...(movement.receiptPath ? { receiptPath: movement.receiptPath } : {}),
      quickRequestHash: movement.requestHash,
      timestamp: serverTimestamp(),
    });
    return { transactionId: movement.requestId, duplicate: false };
  });
};
