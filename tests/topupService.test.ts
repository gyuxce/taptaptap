import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: vi.fn(),
  },
}));

import { topUpCredit } from '@/lib/services/visitorService';

describe('atomic top up service', () => {
  it('updates balance, top-up ledger, and audit through one RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: { new_credit_limit: 200_000, topup: { id: 'topup-1' } },
      error: null,
    });

    const result = await topUpCredit('AA:BB:CC', 50_000, 'loket-1', 'Tunai');

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith('process_topup', {
      p_rfid_uid: 'AABBCC',
      p_amount: 50_000,
      p_merchant_id: 'loket-1',
      p_note: 'Tunai',
    });
    expect(result).toEqual({ success: true, newCreditLimit: 200_000 });
  });

  it('rejects invalid amounts before contacting the database', async () => {
    mocks.rpc.mockClear();
    await expect(topUpCredit('AABBCC', 0, 'loket-1')).resolves.toMatchObject({ success: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
