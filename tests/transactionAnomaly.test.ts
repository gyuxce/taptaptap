import { describe, expect, it } from 'vitest';
import type { Transaction } from '@/types';
import { detectTransactionAnomalies } from '@/lib/transactionAnomaly';

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    rfid_uid: 'ABC123',
    merchant_id: 'merchant-1',
    type: 'payment',
    amount: 25_000,
    created_at: '2026-06-13T12:00:00.000Z',
    whatsapp_status: 'sent',
    ...overrides,
  };
}

describe('transaction anomaly detection', () => {
  it('marks high-value transactions', () => {
    const tx = transaction({ amount: 200_000 });
    expect(detectTransactionAnomalies(tx, [tx])).toContain('high_amount');
  });

  it('marks repeated payments within one minute', () => {
    const first = transaction();
    const second = transaction({ id: 'tx-2', created_at: '2026-06-13T12:00:30.000Z' });
    expect(detectTransactionAnomalies(first, [first, second])).toContain('rapid_repeat');
  });

  it('ignores refunded transactions', () => {
    const tx = transaction({ amount: 300_000, refunded_at: '2026-06-13T12:05:00.000Z' });
    expect(detectTransactionAnomalies(tx, [tx])).toEqual([]);
  });
});
