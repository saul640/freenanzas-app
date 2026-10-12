import { describe, expect, it, vi } from 'vitest';
import { createBankProviderAdapter, normalizeBankEvent, reconcileBankPages } from './bankProviderAdapter';

const posted = { transactionId: 'tx-posted', pendingTransactionId: 'tx-pending', accountId: 'account-1', amountMinor: 2540, currency: 'DOP', date: '2026-10-10', pending: false };

describe('adaptador bancario inactivo y conciliación de eventos simulados', () => {
  it('permanece cerrado por defecto y nunca pide credenciales bancarias', async () => {
    const transport = { connect: vi.fn(), sync: vi.fn(), disconnect: vi.fn() };
    const adapter = createBankProviderAdapter({ transport });
    expect(adapter.enabled).toBe(false);
    await expect(adapter.connect()).rejects.toThrow(/desactivada/i);
    await expect(adapter.sync()).rejects.toThrow(/desactivada/i);
    expect(transport.connect).not.toHaveBeenCalled();
  });

  it('conserva la clave de la operación al cambiar de pendiente a contabilizada', () => {
    const pending = normalizeBankEvent({ ...posted, transactionId: 'tx-pending', pending: true });
    const settled = normalizeBankEvent(posted);
    expect(pending.providerKey).toBe(settled.providerKey);
    expect(pending.status).toBe('pending');
    expect(settled.status).toBe('posted');
  });

  it('aplica repetición, cambios y retiros de eventos sin convertirlos en movimientos financieros', () => {
    const result = reconcileBankPages([
      { events: [{ ...posted, pending: true }], nextCursor: 'c1', hasMore: true },
      { events: [posted, { transactionId: 'tx-posted', pendingTransactionId: 'tx-pending', accountId: 'account-1', change: 'removed' }], nextCursor: 'c2', hasMore: false },
    ]);
    expect(result.cursor).toBe('c2');
    expect(result.complete).toBe(true);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].status).toBe('removed');
    expect(result.proposals[0].sourceType).toBe('bank_adapter_simulation');
  });

  it('rechaza una página desordenada sin cursor de continuación', () => {
    expect(() => reconcileBankPages([{ events: [{ ...posted, pending: true }], hasMore: true }])).toThrow(/cursor/i);
  });
});
