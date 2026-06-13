import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
  },
}));

import { fetchTransactions, logTransaction } from '@/lib/services/transactionService';

const input = {
  rfid_uid: 'AABBCC',
  merchant_id: 'merchant-1',
  type: 'payment' as const,
  amount: 25_000,
  idempotency_key: '11111111-1111-4111-8111-111111111111',
};

describe('atomic transaction service', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.from.mockReset();
  });

  it('sends payment, balance mutation, and idempotency through one RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        transaction: {
          id: 'tx-1',
          ...input,
          created_at: '2026-06-12T00:00:00Z',
          whatsapp_status: 'not_applicable',
        },
        duplicate: false,
      },
      error: null,
    });

    const result = await logTransaction(input);

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith('process_tap', {
      p_rfid_uid: input.rfid_uid,
      p_merchant_id: input.merchant_id,
      p_type: input.type,
      p_amount: input.amount,
      p_idempotency_key: input.idempotency_key,
      p_allow_rapid_repeat: false,
    });
    expect(result).toHaveProperty('transaction.id', 'tx-1');
  });

  it('surfaces database double-tap protection', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'DOUBLE_TAP' } });
    await expect(logTransaction(input)).resolves.toEqual({ error: 'DOUBLE_TAP' });
  });

  it('surfaces an atomic insufficient-credit rejection', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'INSUFFICIENT_CREDIT' } });
    await expect(logTransaction(input)).resolves.toEqual({ error: 'Saldo tidak mencukupi' });
  });
});

function transactionQuery(result: {
  data: unknown[] | null;
  count: number | null;
  error: unknown;
}) {
  const query = {
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn().mockResolvedValue(result),
  };
  return {
    select: vi.fn(() => query),
    query,
  };
}

function tagQuery(result: { data: unknown[] | null; error: unknown }) {
  return {
    select: vi.fn(() => ({
      in: vi.fn().mockResolvedValue(result),
    })),
  };
}

describe('merchant transaction history', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.from.mockReset();
  });

  it('returns transactions even when visitor enrichment fails', async () => {
    const transactions = transactionQuery({
      data: [{
        id: 'tx-1',
        rfid_uid: 'AABBCC',
        merchant_id: 'merchant-1',
        type: 'payment',
        amount: 25_000,
        created_at: '2026-06-13T01:00:00Z',
        whatsapp_status: 'not_applicable',
        merchant: { name: 'WAVR Shop', category: 'Souvenir' },
      }],
      count: 1,
      error: null,
    });
    const tags = tagQuery({ data: null, error: { message: 'relation unavailable' } });

    mocks.from.mockImplementation((table: string) => {
      if (table === 'transactions') return transactions;
      if (table === 'rfid_tags') return tags;
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await fetchTransactions('merchant-1', { limit: 5 });

    expect(result.total).toBe(1);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      id: 'tx-1',
      amount: 25_000,
      visitor_name: 'Unknown',
      merchant_name: 'WAVR Shop',
    });
  });

  it('enriches transaction rows with visitor data by RFID UID', async () => {
    const transactions = transactionQuery({
      data: [{
        id: 'tx-2',
        rfid_uid: 'DDEEFF',
        merchant_id: 'merchant-1',
        type: 'entry',
        amount: 0,
        created_at: '2026-06-13T02:00:00Z',
        whatsapp_status: 'not_applicable',
        merchant: { name: 'WAVR Gate', category: 'Loket' },
      }],
      count: 1,
      error: null,
    });
    const tags = tagQuery({
      data: [{
        uid: 'DDEEFF',
        visitor: { name: 'Budi', phone: '081234567890', ticket_type: 'Regular' },
      }],
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === 'transactions') return transactions;
      if (table === 'rfid_tags') return tags;
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await fetchTransactions('merchant-1', { limit: 5 });

    expect(result.transactions[0]).toMatchObject({
      visitor_name: 'Budi',
      visitor_phone: '081234567890',
      ticket_type: 'Regular',
    });
  });
});
