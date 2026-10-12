export const normalizeBankEvent = (event) => {
  if (!event || typeof event !== 'object') throw new TypeError('Evento bancario inválido.');
  const externalId = String(event.transactionId || event.pendingTransactionId || '').trim();
  const accountId = String(event.accountId || '').trim();
  const currency = String(event.currency || '').toUpperCase();
  const date = String(event.date || '');
  const status = event.removed || event.change === 'removed' ? 'removed' : event.pending ? 'pending' : 'posted';
  if (!externalId || externalId.length > 160 || !accountId || accountId.length > 160) throw new TypeError('Faltan identificadores de cuenta o movimiento.');
  if (status === 'removed') return {
    providerKey: String(event.pendingTransactionId || event.transactionId),
    currentExternalId: String(event.transactionId || event.pendingTransactionId),
    accountId,
    amountMinor: null,
    currency: currency || null,
    date: date || null,
    status: 'removed',
    change: 'removed',
    sourceType: 'bank_adapter_simulation',
  };
  if (!Number.isSafeInteger(event.amountMinor) || event.amountMinor <= 0) throw new TypeError('El importe debe expresarse en unidades menores.');
  if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError('La moneda no es válida.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TypeError('La fecha no es válida.');
  return {
    providerKey: String(event.pendingTransactionId || event.transactionId),
    currentExternalId: String(event.transactionId || event.pendingTransactionId),
    accountId,
    amountMinor: event.amountMinor,
    currency,
    date,
    status,
    change: event.change || 'added',
    sourceType: 'bank_adapter_simulation',
  };
};

export const reconcileBankPages = (pages = []) => {
  const proposals = new Map();
  let cursor = null;
  let complete = false;
  for (const page of pages) {
    if (!page || !Array.isArray(page.events)) throw new TypeError('Página de sincronización inválida.');
    for (const event of page.events) {
      const proposal = normalizeBankEvent(event);
      if (proposal.change === 'removed' || proposal.status === 'removed') {
        proposals.set(proposal.providerKey, { ...proposal, status: 'removed' });
      } else {
        proposals.set(proposal.providerKey, proposal);
      }
    }
    cursor = page.nextCursor || cursor;
    complete = page.hasMore === false;
    if (page.hasMore === true && !page.nextCursor) throw new TypeError('La paginación requiere un cursor para continuar.');
  }
  return { proposals: [...proposals.values()], cursor, complete };
};

export const createBankProviderAdapter = ({ enabled = false, transport = null } = {}) => ({
  enabled: Boolean(enabled && transport),
  async connect() {
    if (!enabled || !transport) throw new Error('La conexión bancaria real está desactivada.');
    return transport.connect();
  },
  async sync() {
    if (!enabled || !transport) throw new Error('La sincronización bancaria real está desactivada.');
    return transport.sync();
  },
  async disconnect() {
    if (!enabled || !transport) return { connected: false };
    return transport.disconnect();
  },
});
