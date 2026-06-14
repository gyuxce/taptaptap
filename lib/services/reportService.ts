import { supabase } from '@/lib/supabase';
import { toLocalDateRangeIso } from '@/lib/reportDate';
import { Transaction, Merchant } from '@/types';
export interface RevenueReportFilters {
    dateFrom: string;
    dateTo: string;
    merchantIds?: string[];
    ticketType?: string; // 'Regular' | 'VIP' | 'Family' | 'Group' | 'all'
}
export interface RevenueReportItem {
    id: string;
    name: string;
    category: string;
    location: string;
    total_taps: number;
    total_revenue: number;
    unique_visitors: number;
}
export interface DailyRevenueItem {
    date: string; // formatted e.g. "DD/MM"
    [key: string]: number | string; // dynamic merchant series keys + 'date'
}
export interface CommissionReportBreakdown {
    date: string;
    total_taps: number;
    total_revenue: number;
    commission: number;
    net_payout: number;
}
export interface CommissionReport {
    merchant: Merchant;
    total_taps: number;
    total_revenue: number;
    commission_rate: number; // e.g. 0.10 (10%)
    total_commission: number;
    total_net_payout: number;
    breakdown: CommissionReportBreakdown[];
}

interface RevenueTransactionRow {
    rfid_uid: string;
    merchant_id: string;
    type: Transaction['type'];
    amount: number | string;
    created_at: string;
    visitor_id?: string | null;
    ticket_type?: string;
    rfid_tag?: {
        visitor_id?: string | null;
        visitor?: { ticket_type?: string } | null;
    } | null;
    merchant?: { name?: string } | null;
    merchant_name?: string;
    refunded_at?: string | null;
    source?: Transaction['source'];
}

interface RevenueTagRow {
    uid: string;
    visitor_id?: string | null;
    visitor?: { ticket_type?: string } | null;
}

// Helper: Get list of dates in range YYYY-MM-DD
function getDatesInRange(dateFrom: string, dateTo: string): string[] {
    const dates: string[] = [];
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const current = new Date(start);
    while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
    }
    return dates;
}

function toLocalDateKey(value: string) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
// Helper: Format YYYY-MM-DD to DD/MM
function formatDateDDMM(dateStr: string): string {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}`;
    }
    return dateStr;
}
/**
 * 1. Generates revenue aggregations grouped by merchant
 */
export async function getRevenueReport(filters: RevenueReportFilters): Promise<RevenueReportItem[]> {
    try {
        let allTransactions: RevenueTransactionRow[] = [];
        let merchantsList: Merchant[] = [];
        // Fetch merchants
        const { data: merchantsData } = await supabase
            .from('merchants')
            .select('*');
        merchantsList = (merchantsData || []) as Merchant[];
        // Fetch transactions in date range
        const query = supabase
            .from('transactions')
            .select('*')
            .gte('created_at', filters.dateFrom)
            .lte('created_at', filters.dateTo);
        const { data: txsData, error } = await query;
        if (error) {
            console.error('[reportService] error getRevenueReport:', error);
            return [];
        }
        const transactionRows = (txsData || []) as unknown as RevenueTransactionRow[];
        const uniqueUids = [...new Set(transactionRows.map(tx => tx.rfid_uid).filter(Boolean))];
        const tagByUid = new Map<string, RevenueTagRow>();

        if (uniqueUids.length > 0) {
            const { data: tagData, error: tagError } = await supabase
                .from('rfid_tags')
                .select('uid, visitor_id, visitor:visitors(ticket_type)')
                .in('uid', uniqueUids);
            if (tagError) {
                console.warn('[reportService] RFID enrichment failed:', tagError);
            } else {
                (tagData as unknown as RevenueTagRow[] | null)?.forEach(tag => {
                    tagByUid.set(tag.uid, tag);
                });
            }
        }

        allTransactions = transactionRows.map(tx => {
            const rfidTag = tagByUid.get(tx.rfid_uid);
            return {
                ...tx,
                visitor_id: rfidTag?.visitor_id || null,
                ticket_type: rfidTag?.visitor?.ticket_type || 'Regular'
            };
        });
        // Filter transactions by ticket type if specified (and not 'all')
        if (filters.ticketType && filters.ticketType !== 'all') {
            allTransactions = allTransactions.filter(t => t.ticket_type === filters.ticketType);
        }
        // Filter transactions by merchantIds if specified
        if (filters.merchantIds && filters.merchantIds.length > 0) {
            allTransactions = allTransactions.filter(t => filters.merchantIds!.includes(t.merchant_id));
            merchantsList = merchantsList.filter(m => filters.merchantIds!.includes(m.id));
        }
        // Aggregate by merchant
        const report: RevenueReportItem[] = merchantsList.map(m => {
            const merchantTxs = allTransactions.filter(t => t.merchant_id === m.id && t.source !== 'reward');
            const total_taps = merchantTxs.length;
            const total_revenue = merchantTxs
                .filter(t => t.type === 'payment' && !t.refunded_at)
                .reduce((sum, t) => sum + Number(t.amount), 0);
            const visitorIds = new Set<string>();
            merchantTxs.forEach(t => {
                if (t.visitor_id)
                    visitorIds.add(t.visitor_id);
            });
            return {
                id: m.id,
                name: m.name,
                category: m.category,
                location: m.location,
                total_taps,
                total_revenue,
                unique_visitors: visitorIds.size
            };
        });
        // Sort by revenue descending
        return report.sort((a, b) => b.total_revenue - a.total_revenue);
    }
    catch (err) {
        console.error('[reportService] getRevenueReport caught error:', err);
        return [];
    }
}
/**
 * 2. Generates daily revenue trends for Recharts
 */
export async function getDailyRevenue(dateFrom: string, dateTo: string, merchantIds?: string[]): Promise<DailyRevenueItem[]> {
    try {
        const range = toLocalDateRangeIso(dateFrom, dateTo);
        let allTransactions: RevenueTransactionRow[] = [];
        let merchantsList: Merchant[] = [];
        const { data: merchantsData } = await supabase.from('merchants').select('*');
        merchantsList = (merchantsData || []) as Merchant[];
        const { data: txsData, error } = await supabase
            .from('transactions')
            .select('*, merchant:merchants(name)')
            .eq('type', 'payment')
            .gte('created_at', range.dateFrom)
            .lte('created_at', range.dateTo);
        if (error) {
            console.error('[reportService] error getDailyRevenue:', error);
            return [];
        }
        allTransactions = (txsData || []).map(rawTx => {
            const tx = rawTx as unknown as RevenueTransactionRow;
            return {
                ...tx,
                merchant_name: tx.merchant?.name || 'Unknown'
            };
        }).filter(tx => !tx.refunded_at);
        // Filter by merchant IDs if specified
        if (merchantIds && merchantIds.length > 0) {
            allTransactions = allTransactions.filter(t => merchantIds.includes(t.merchant_id));
            merchantsList = merchantsList.filter(m => merchantIds.includes(m.id));
        }
        const dateList = getDatesInRange(dateFrom, dateTo);
        // Group transactions by date and merchant name
        const dailyData: DailyRevenueItem[] = dateList.map(dateStr => {
            const dateFormatted = formatDateDDMM(dateStr);
            const dayTxs = allTransactions.filter(t => toLocalDateKey(t.created_at) === dateStr);
            const item: DailyRevenueItem = {
                date: dateFormatted
            };
            if (merchantIds && merchantIds.length > 1) {
                // Plot distinct series for each merchant
                merchantsList.forEach(m => {
                    const mRev = dayTxs
                        .filter(t => t.merchant_id === m.id)
                        .reduce((sum, t) => sum + Number(t.amount), 0);
                    item[m.name] = mRev;
                });
            }
            else {
                // Single merchant or all merchants aggregated as single series
                const total = dayTxs.reduce((sum, t) => sum + Number(t.amount), 0);
                item['Revenue'] = total;
            }
            return item;
        });
        return dailyData;
    }
    catch (err) {
        console.error('[reportService] getDailyRevenue caught error:', err);
        return [];
    }
}
/**
 * 3. Generates commission report for a specific merchant
 */
export async function generateMerchantCommissionReport(merchantId: string, dateFrom: string, dateTo: string, commissionRate: number = 0.10 // 10% default commission
): Promise<CommissionReport | null> {
    try {
        const range = toLocalDateRangeIso(dateFrom, dateTo);
        let merchant: Merchant | null = null;
        let merchantTxs: Transaction[] = [];
        const { data: mData } = await supabase
            .from('merchants')
            .select('*')
            .eq('id', merchantId)
            .maybeSingle();
        merchant = mData as Merchant | null;
        if (!merchant)
            return null;
        const { data: txsData, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('merchant_id', merchantId)
            .gte('created_at', range.dateFrom)
            .lte('created_at', range.dateTo);
        if (error) {
            console.error('[reportService] error generateMerchantCommissionReport:', error);
            return null;
        }
        merchantTxs = (txsData || []) as Transaction[];
        const dateList = getDatesInRange(dateFrom, dateTo);
        // Group by day for breakdown
        const breakdown: CommissionReportBreakdown[] = dateList.map(dateStr => {
            const dayTxs = merchantTxs.filter(t => toLocalDateKey(t.created_at) === dateStr);
            const total_taps = dayTxs.filter(t => t.source !== 'reward').length;
            const total_revenue = dayTxs
                .filter(t => t.type === 'payment' && !t.refunded_at)
                .reduce((sum, t) => sum + Number(t.amount), 0);
            const commission = total_revenue * commissionRate;
            const net_payout = total_revenue - commission;
            return {
                date: formatDateDDMM(dateStr),
                total_taps,
                total_revenue,
                commission,
                net_payout
            };
        });
        const total_taps = merchantTxs.filter(t => t.source !== 'reward').length;
        const total_revenue = merchantTxs
            .filter(t => t.type === 'payment' && !t.refunded_at)
            .reduce((sum, t) => sum + Number(t.amount), 0);
        const total_commission = total_revenue * commissionRate;
        const total_net_payout = total_revenue - total_commission;
        return {
            merchant,
            total_taps,
            total_revenue,
            commission_rate: commissionRate,
            total_commission,
            total_net_payout,
            breakdown
        };
    }
    catch (err) {
        console.error('[reportService] generateMerchantCommissionReport caught error:', err);
        return null;
    }
}
