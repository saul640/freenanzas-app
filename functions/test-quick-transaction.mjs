import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuickTransaction, persistQuickTransaction } from './quickTransaction.js';

const validInput = (overrides = {}) => ({
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  type: 'expense',
  amountMinor: 1234,
  currency: 'DOP',
  category: 'Sin clasificar',
  date: '2026-10-11',
  timeZone: 'America/Santo_Domingo',
  note: '',
  merchant: '',
  ...overrides,
});

test('server normalizes the authenticated owner and classifies no-category movements', () => {
  const movement = normalizeQuickTransaction('user-a', validInput());
  assert.equal(movement.userId, 'user-a');
  assert.equal(movement.amount, 12.34);
  assert.equal(movement.amountMinor, 1234);
  assert.equal(movement.classificationStatus, 'unclassified');
});

test('server rejects invalid amounts, currencies, dates, time zones and receipt ownership', () => {
  for (const input of [
    validInput({ amountMinor: 12.34 }),
    validInput({ amountMinor: 0 }),
    validInput({ currency: 'USD' }),
    validInput({ date: '2026-02-30' }),
    validInput({ timeZone: 'Mars/Olympus' }),
    validInput({ receiptPath: 'transaction-receipts/user-b/123e4567-e89b-42d3-a456-426614174000/file.pdf' }),
  ]) assert.throws(() => normalizeQuickTransaction('user-a', input));
});

test('equal legitimate movements can use distinct idempotency keys', () => {
  const first = normalizeQuickTransaction('user-a', validInput());
  const second = normalizeQuickTransaction('user-a', validInput({ requestId: '123e4567-e89b-42d3-b456-426614174001' }));
  assert.notEqual(first.requestId, second.requestId);
  assert.equal(first.requestHash, second.requestHash);
});

const createFakeDatabase = () => {
  const documents = new Map();
  let queue = Promise.resolve();
  return {
    documents,
    collection: (name) => ({ doc: (id) => ({ key: `${name}/${id}` }) }),
    runTransaction: (callback) => {
      const operation = queue.then(() => callback({
        get: async (reference) => ({ exists: documents.has(reference.key), data: () => documents.get(reference.key) }),
        create: (reference, data) => {
          if (documents.has(reference.key)) throw new Error('Already exists');
          documents.set(reference.key, data);
        },
      }));
      queue = operation.catch(() => {});
      return operation;
    },
  };
};

test('concurrent retries persist one document, while a new intent with equal values persists separately', async () => {
  const database = createFakeDatabase();
  const first = normalizeQuickTransaction('user-a', validInput());
  const [saved, retried] = await Promise.all([
    persistQuickTransaction({ database, movement: first, uid: 'user-a', serverTimestamp: () => 'server-time' }),
    persistQuickTransaction({ database, movement: first, uid: 'user-a', serverTimestamp: () => 'server-time' }),
  ]);
  assert.deepEqual([saved.duplicate, retried.duplicate].sort(), [false, true]);
  assert.equal(database.documents.size, 1);

  const secondIntent = normalizeQuickTransaction('user-a', validInput({ requestId: '123e4567-e89b-42d3-b456-426614174001' }));
  await persistQuickTransaction({ database, movement: secondIntent, uid: 'user-a', serverTimestamp: () => 'server-time' });
  assert.equal(database.documents.size, 2);
});

test('reusing an idempotency key for changed financial data is rejected', async () => {
  const database = createFakeDatabase();
  await persistQuickTransaction({
    database,
    movement: normalizeQuickTransaction('user-a', validInput()),
    uid: 'user-a',
    serverTimestamp: () => 'server-time',
  });
  const changed = normalizeQuickTransaction('user-a', validInput({ amountMinor: 9999 }));
  await assert.rejects(persistQuickTransaction({ database, movement: changed, uid: 'user-a', serverTimestamp: () => 'server-time' }), { code: 'already-exists' });
});
