import type { Transaction } from '@/types';

export type TransactionAnomaly = 'high_amount' | 'rapid_repeat' | 'outside_hours';

export function detectTransactionAnomalies(
    transaction: Transaction,
    transactions: Transaction[]
): TransactionAnomaly[] {
    if (transaction.type !== 'payment' || transaction.refunded_at) return [];

    const anomalies: TransactionAnomaly[] = [];
    if (transaction.amount >= 200_000) anomalies.push('high_amount');

    const timestamp = new Date(transaction.created_at).getTime();
    const repeated = transactions.some(candidate => {
        if (candidate.id === transaction.id || candidate.type !== 'payment') return false;
        return candidate.rfid_uid === transaction.rfid_uid
            && candidate.merchant_id === transaction.merchant_id
            && Math.abs(new Date(candidate.created_at).getTime() - timestamp) <= 60_000;
    });
    if (repeated) anomalies.push('rapid_repeat');

    const hour = new Date(transaction.created_at).getHours();
    if (hour < 6 || hour >= 23) anomalies.push('outside_hours');
    return anomalies;
}

export const anomalyLabel: Record<TransactionAnomaly, string> = {
    high_amount: 'Nominal besar',
    rapid_repeat: 'Transaksi berulang',
    outside_hours: 'Di luar jam operasi',
};
