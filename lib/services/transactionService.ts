import { supabase } from '@/lib/supabase';
import { Transaction } from '@/types';
export interface LogTransactionInput {
    rfid_uid: string;
    merchant_id: string;
    type: 'entry' | 'payment';
    amount: number;
    created_at?: string;
    idempotency_key?: string;
    allow_rapid_repeat?: boolean;
    merchant_name?: string;
}
export interface TransactionFilters {
    dateFrom?: string;
    dateTo?: string;
    type?: 'entry' | 'payment';
    limit?: number;
    offset?: number;
}

interface TransactionQueryRow {
    id: string;
    rfid_uid: string;
    merchant_id: string;
    type: Transaction['type'];
    amount: number | string;
    created_at: string;
    whatsapp_status: Transaction['whatsapp_status'];
    refunded_at?: string | null;
    refund_reason?: string | null;
    refunded_by?: string | null;
    merchant?: {
        name?: string;
        category?: string;
    } | null;
}

interface TransactionTagRow {
    uid: string;
    visitor?: {
        name?: string;
        phone?: string | null;
        ticket_type?: string;
    } | null;
}

interface TransactionStatRow {
    amount: number | string;
    type: Transaction['type'];
    created_at: string;
}
export async function logTransaction(data: LogTransactionInput): Promise<{
    transaction: Transaction;
} | {
    error: string;
}> {
    try {
        const idempotencyKey = data.idempotency_key || crypto.randomUUID();
        const { data: result, error } = await supabase.rpc('process_tap', {
            p_rfid_uid: data.rfid_uid,
            p_merchant_id: data.merchant_id,
            p_type: data.type,
            p_amount: data.amount,
            p_idempotency_key: idempotencyKey,
            p_allow_rapid_repeat: data.allow_rapid_repeat || false
        });
        if (error || !result?.transaction) {
            console.error('[transactionService] logTransaction error:', error);
            const message = error?.message || '';
            if (message.includes('DOUBLE_TAP'))
                return { error: 'DOUBLE_TAP' };
            if (message.includes('INSUFFICIENT_CREDIT'))
                return { error: 'Saldo tidak mencukupi' };
            if (message.includes('TAG_INACTIVE'))
                return { error: 'Gelang RFID tidak aktif' };
            if (message.includes('FORBIDDEN'))
                return { error: 'Akun tidak diizinkan melakukan transaksi ini' };
            return { error: 'Gagal mencatat transaksi di database' };
        }
        const inserted = result.transaction as Transaction;
        const visitor = result.visitor as {
            name?: string;
            phone?: string | null;
            credit_limit?: number;
            credit_used?: number;
        } | undefined;
        // Fire and forget WA notification
        if (!result.duplicate && visitor?.phone && data.amount > 0) {
            const creditRemaining = visitor.credit_limit === 0
                ? 'Unlimited'
                : Number(visitor.credit_limit) - Number(visitor.credit_used);
            // Asynchronous fire-and-forget WA request
            fetch('/api/notify', {
                method: 'POST',
                keepalive: true,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: visitor.phone,
                    visitorName: visitor.name,
                    merchantName: data.merchant_name || 'WAVR Partner',
                    amount: data.amount,
                    creditLeft: creditRemaining,
                    transactionType: data.type,
                    transactionId: inserted.id,
                })
            }).catch(err => console.warn('[transactionService] WA failed:', err));
        }
        return { transaction: inserted };
    }
    catch (err: unknown) {
        console.error('[transactionService] logTransaction caught error:', err);
        return { error: 'Terjadi kesalahan sistem, coba lagi' };
    }
}
export async function fetchTransactions(merchantId: string, filters: TransactionFilters): Promise<{
    transactions: Transaction[];
    total: number;
}> {
    try {
        const limit = filters.limit || 50;
        const offset = filters.offset || 0;
        let query = supabase
            .from('transactions')
            .select('*, merchant:merchants(name, category)', { count: 'exact' });
        if (merchantId !== 'all') {
            query = query.eq('merchant_id', merchantId);
        }
        if (filters.type) {
            query = query.eq('type', filters.type);
        }
        if (filters.dateFrom) {
            query = query.gte('created_at', filters.dateFrom);
        }
        if (filters.dateTo) {
            query = query.lte('created_at', filters.dateTo);
        }
        const { data, count, error } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (error) {
            console.error('[transactionService] error fetching transactions:', error);
            return { transactions: [], total: 0 };
        }

        const rows = (data || []) as unknown as TransactionQueryRow[];
        const uniqueUids = [...new Set(rows.map(tx => tx.rfid_uid).filter(Boolean))];
        const visitorByUid = new Map<string, TransactionTagRow['visitor']>();

        if (uniqueUids.length > 0) {
            const { data: tagData, error: tagError } = await supabase
                .from('rfid_tags')
                .select('uid, visitor:visitors(name, phone, ticket_type)')
                .in('uid', uniqueUids);

            if (tagError) {
                console.warn('[transactionService] visitor enrichment failed:', tagError);
            } else {
                (tagData as unknown as TransactionTagRow[] | null)?.forEach(tag => {
                    visitorByUid.set(tag.uid, tag.visitor);
                });
            }
        }

        // Enrich nested outputs to match TypeScript Transaction interface joins
        const enriched: Transaction[] = rows.map(tx => {
            const vInfo = visitorByUid.get(tx.rfid_uid);
            const amount = Number(tx.amount || 0);
            const type = tx.type === 'entry' || tx.type === 'payment'
                ? tx.type
                : amount > 0 ? 'payment' : 'entry';
            return {
                id: tx.id,
                rfid_uid: tx.rfid_uid,
                merchant_id: tx.merchant_id,
                type,
                amount,
                created_at: tx.created_at,
                whatsapp_status: tx.whatsapp_status || 'not_applicable',
                refunded_at: tx.refunded_at,
                refund_reason: tx.refund_reason,
                refunded_by: tx.refunded_by,
                visitor_name: vInfo?.name || 'Unknown',
                visitor_phone: vInfo?.phone || undefined,
                ticket_type: vInfo?.ticket_type || 'Regular',
                merchant_name: tx.merchant?.name || 'Unknown',
                merchant_category: tx.merchant?.category || 'General'
            };
        });
        return { transactions: enriched, total: count || 0 };
    }
    catch (err) {
        console.error('[transactionService] fetchTransactions caught error:', err);
        return { transactions: [], total: 0 };
    }
}
export async function fetchTransactionStats(merchantId: string): Promise<{
    today: {
        count: number;
        total: number;
    };
    thisWeek: {
        count: number;
        total: number;
    };
    thisMonth: {
        count: number;
        total: number;
    };
}> {
    try {
        const now = new Date();
        // Start dates
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const startOfWeekVal = new Date(now);
        const day = startOfWeekVal.getDay();
        const diff = startOfWeekVal.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
        const startOfWeek = new Date(startOfWeekVal.setDate(diff));
        startOfWeek.setHours(0, 0, 0, 0);
        const startOfWeekISO = startOfWeek.toISOString();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        // Fetch stats from Supabase
        let query = supabase.from('transactions').select('amount, type, created_at');
        if (merchantId !== 'all') {
            query = query.eq('merchant_id', merchantId);
        }
        const { data, error } = await query.gte('created_at', startOfMonth);
        if (error || !data) {
            return {
                today: { count: 0, total: 0 },
                thisWeek: { count: 0, total: 0 },
                thisMonth: { count: 0, total: 0 }
            };
        }
        const rows = data as unknown as TransactionStatRow[];
        const todayList = rows.filter(t => t.created_at >= startOfToday);
        const weekList = rows.filter(t => t.created_at >= startOfWeekISO);
        const sumTotal = (list: TransactionStatRow[]) => list
            .filter(t => t.type === 'payment')
            .reduce((acc, t) => acc + Number(t.amount), 0);
        const count = (list: TransactionStatRow[]) => list.length;
        return {
            today: { count: count(todayList), total: sumTotal(todayList) },
            thisWeek: { count: count(weekList), total: sumTotal(weekList) },
            thisMonth: { count: count(rows), total: sumTotal(rows) }
        };
    }
    catch (err) {
        console.error('[transactionService] fetchTransactionStats caught error:', err);
        return {
            today: { count: 0, total: 0 },
            thisWeek: { count: 0, total: 0 },
            thisMonth: { count: 0, total: 0 }
        };
    }
}
