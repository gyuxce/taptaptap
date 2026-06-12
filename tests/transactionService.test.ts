import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: vi.fn(),
  },
}));

import { logTransaction } from '@/lib/services/transactionService';

const input = {
  rfid_uid: 'AABBCC',
  merchant_id: 'merchant-1',
  type: 'payment' as const,
  amount: 25_000,
  idempotency_key: '11111111-1111-4111-8111-111111111111',
};

describe('atomic transaction service', () => {
  beforeEach(() => mocks.rpc.mockReset());

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
