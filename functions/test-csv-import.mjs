import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCsvImport, assertCsvAccountOwnership, changeCsvImportStatus, normalizeCsvImport, persistCsvImport } from './csvImports.js';

const validInput = (overrides = {}) => ({
  batchId: 'a'.repeat(64), fileName: 'extracto.csv', accountId: '', accountLabel: 'Cuenta de prueba',
  timeZone: 'America/Santo_Domingo',
  rows: [{ rowKey: 'row-2', sourceRow: 2, date: '2026-02-01', amountMinor: 1200, currency: 'DOP', type: 'expense', merchant: 'Café', note: '', category: 'Comida', externalId: '', rawSource: { date: '2026-02-01', amount: '12.00', debit: '', credit: '', type: 'expense', currency: 'DOP', description: 'Café', category: 'Comida' } }],
  ...overrides,
});

const fakeDatabase = () => {
  const documents = new Map();
  let queue = Promise.resolve();
  const makeRef = (path) => ({ path, get: async () => ({ exists: documents.has(path), data: () => documents.get(path) }) });
  const makeQuery = (name, value, max = Infinity) => ({
    query: true, name, value, max,
    limit: (nextMax) => makeQuery(name, value, nextMax),
    get: async () => {
      const docs = [...documents.entries()].filter(([path, data]) => path.startsWith(`${name}/`) && data.userId === value)
        .slice(0, max).map(([path, data]) => ({ id: path.split('/').at(-1), data: () => data }));
      return { size: docs.length, docs };
    },
  });
  return {
    documents,
    doc: makeRef,
    collection: (name) => ({ where: (_field, _operator, value) => makeQuery(name, value) }),
    runTransaction: (callback) => {
      const operation = queue.then(() => callback({
        get: async (ref) => ref.query ? ref.get() : ({ exists: documents.has(ref.path), data: () => documents.get(ref.path) }),
        create: (ref, data) => {
          if (documents.has(ref.path)) { const error = new Error('Already exists'); error.code = 'already-exists'; throw error; }
          documents.set(ref.path, data);
        },
        update: (ref, data) => documents.set(ref.path, { ...documents.get(ref.path), ...data }),
        delete: (ref) => documents.delete(ref.path),
      }));
      queue = operation.catch(() => {});
      return operation;
    },
  };
};

test('normaliza dueño, moneda, importes, fechas y rechaza transferencias o filas repetidas', () => {
  const batch = normalizeCsvImport('user-a', validInput());
  assert.equal(batch.uid, 'user-a');
  assert.equal(batch.rows[0].amount, 12);
  assert.equal(batch.rows[0].rowFingerprint.length, 64);
  for (const input of [
    validInput({ rows: [{ ...validInput().rows[0], currency: 'USD' }] }),
    validInput({ rows: [{ ...validInput().rows[0], date: '2026-02-30' }] }),
    validInput({ rows: [{ ...validInput().rows[0], type: 'transfer' }] }),
    validInput({ rows: [{ ...validInput().rows[0], rowKey: 'bad' }] }),
  ]) assert.throws(() => normalizeCsvImport('user-a', input));
});

test('valida que una tarjeta escogida esté bajo el usuario autenticado', async () => {
  const database = fakeDatabase();
  database.documents.set('users/user-a/creditCards/card-a', { name: 'Tarjeta propia' });
  assert.equal(await assertCsvAccountOwnership({ database, uid: 'user-a', accountId: 'card-a' }), true);
  await assert.rejects(assertCsvAccountOwnership({ database, uid: 'user-a', accountId: 'card-b' }), { code: 'permission-denied' });
  await assert.rejects(assertCsvAccountOwnership({ database, uid: 'user-a', accountId: '../user-b/creditCards/card-b' }), { code: 'invalid-argument' });
});

test('importa de forma atómica, conserva compras idénticas y deduplica reintentos del mismo lote', async () => {
  const database = fakeDatabase();
  const input = validInput({ rows: [
    ...validInput().rows,
    { ...validInput().rows[0], rowKey: 'row-3', sourceRow: 3 },
  ] });
  const batch = normalizeCsvImport('user-a', input);
  const [first, retry] = await Promise.all([
    persistCsvImport({ database, batch, now: '2026-10-11T00:00:00Z' }),
    persistCsvImport({ database, batch, now: '2026-10-11T00:00:00Z' }),
  ]);
  assert.equal(first.duplicate, false);
  assert.equal(retry.duplicate, true);
  assert.equal(first.transactionIds.length, 2);
  assert.notEqual(first.transactionIds[0], first.transactionIds[1]);
  assert.equal([...database.documents.keys()].filter((path) => path.startsWith('transactions/')).length, 2);
  assert.equal(database.documents.get(`transactions/${first.transactionIds[0]}`).source.original.description, 'Café');
});

test('identifica posibles duplicados como sugerencias y detecta si el análisis está limitado', async () => {
  const database = fakeDatabase();
  database.documents.set('transactions/manual-1', { userId: 'user-a', type: 'expense', amountMinor: 1200, currency: 'DOP', date: '2026-02-01', merchant: 'Café' });
  const batch = normalizeCsvImport('user-a', validInput());
  const analysis = await analyzeCsvImport({ database, uid: 'user-a', rows: batch.rows, limit: 1 });
  assert.equal(analysis.matches[0].candidates[0].id, 'manual-1');
  assert.equal(analysis.complete, true);
});

test('deshacer elimina del saldo y restaurar repone las mismas transacciones con trazabilidad', async () => {
  const database = fakeDatabase();
  const batch = normalizeCsvImport('user-a', validInput());
  const saved = await persistCsvImport({ database, batch, now: '2026-10-11T00:00:00Z' });
  const undone = await changeCsvImportStatus({ database, uid: 'user-a', batchId: batch.batchId, action: 'undo', now: 'undo-time' });
  assert.equal(undone.status, 'undone');
  assert.equal(saved.transactionIds.every((id) => !database.documents.has(`transactions/${id}`)), true);
  assert.equal(database.documents.get(`users/user-a/importBatches/${batch.batchId}`).rows.length, 1);
  const restored = await changeCsvImportStatus({ database, uid: 'user-a', batchId: batch.batchId, action: 'restore', now: 'restore-time' });
  assert.equal(restored.status, 'posted');
  assert.equal(database.documents.has(`transactions/${saved.transactionIds[0]}`), true);
});
