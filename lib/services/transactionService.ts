import { supabase, isSupabaseConfigured, getStorageItem, setStorageItem } from '@/lib/supabase';
import { Transaction, Visitor, RFIDTag, Merchant } from '@/types';

export interface LogTransactionInput {
  rfid_uid: string;
  merchant_id: string;
  type: 'entry' | 'payment';
  amount: number;
  created_at?: string;
}

export interface TransactionFilters {
  dateFrom?: string;
  dateTo?: string;
  type?: 'entry' | 'payment';
  limit?: number;
  offset?: number;
}

export async function logTransaction(
  data: LogTransactionInput
): Promise<{ transaction: Transaction } | { error: string }> {
  try {
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const generatedId = `${data.merchant_id}_${Date.now()}_${randomSuffix}`;
    const createdAt = data.created_at || new Date().toISOString();

    const newTx: Transaction = {
      id: generatedId,
      rfid_uid: data.rfid_uid,
      merchant_id: data.merchant_id,
      type: data.type,
      amount: data.amount,
      created_at: createdAt,
      whatsapp_status: 'not_applicable' // defaults
    };

    if (isSupabaseConfigured) {
      // Fetch visitor details for WA
      const { data: tagData } = await supabase
        .from('rfid_tags')
        .select('visitor:visitors(name, phone, credit_limit, credit_used)')
        .eq('uid', data.rfid_uid)
        .maybeSingle();

      const visitor = tagData?.visitor as any;
      newTx.whatsapp_status = visitor?.phone ? 'pending' : 'not_applicable';

      const { data: inserted, error } = await supabase
        .from('transactions')
        .insert(newTx)
        .select()
        .single();

      if (error || !inserted) {
        console.error('[transactionService] logTransaction error:', error);
        return { error: 'Gagal mencatat transaksi di database' };
      }

      // Fire and forget WA notification
      if (visitor?.phone && data.amount > 0) {
        const creditRemaining = visitor.credit_limit === 0 ? 'Unlimited' : (visitor.credit_limit - visitor.credit_used);
        
        // Asynchronous fire-and-forget WA request
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: visitor.phone,
            name: visitor.name,
            merchantName: 'EcoTour Partner',
            amount: data.amount,
            creditLeft: creditRemaining,
            transactionType: data.type
          })
        }).then(async (r) => {
          const res = await r.json();
          // Update WA status to database silently
          await supabase
            .from('transactions')
            .update({ whatsapp_status: res.success ? 'sent' : 'failed' })
            .eq('id', inserted.id);
        }).catch(err => console.warn('[transactionService] WA failed:', err));
      }

      return { transaction: inserted as Transaction };
    } else {
      // Simulation mode
      const transactions = getStorageItem<Transaction[]>('ecotour_transactions', []);
      const visitors = getStorageItem<Visitor[]>('ecotour_visitors', []);
      const tags = getStorageItem<RFIDTag[]>('ecotour_rfid_tags', []);
      const merchants = getStorageItem<Merchant[]>('ecotour_merchants', []);

      const tag = tags.find(t => t.uid === data.rfid_uid);
      const visitor = tag ? visitors.find(v => v.id === tag.visitor_id) : null;
      const merchant = merchants.find(m => m.id === data.merchant_id);

      newTx.whatsapp_status = visitor?.phone ? 'pending' : 'not_applicable';
      
      transactions.unshift(newTx);
      setStorageItem('ecotour_transactions', transactions);

      // Join metadata details for UI
      const enriched: Transaction = {
        ...newTx,
        visitor_name: visitor?.name || 'Unknown',
        visitor_phone: visitor?.phone || undefined,
        ticket_type: visitor?.ticket_type || 'Regular',
        merchant_name: merchant?.name || 'Unknown',
        merchant_category: merchant?.category || 'General'
      };

      // Fire and forget WA notification simulation
      if (visitor?.phone && data.amount > 0) {
        const creditRemaining = visitor.credit_limit === 0 ? 'Unlimited' : (visitor.credit_limit - visitor.credit_used);
        
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: visitor.phone,
            name: visitor.name,
            merchantName: merchant?.name || 'EcoTour Partner',
            amount: data.amount,
            creditLeft: creditRemaining,
            transactionType: data.type
          })
        }).then(async (r) => {
          const res = await r.json();
          const txList = getStorageItem<Transaction[]>('ecotour_transactions', []);
          const tIdx = txList.findIndex(t => t.id === newTx.id);
          if (tIdx !== -1) {
            txList[tIdx].whatsapp_status = res.success ? 'sent' : 'failed';
            setStorageItem('ecotour_transactions', txList);
          }
        }).catch(err => console.warn('[transactionService] WA failed:', err));
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ecotour_new_transaction', { detail: enriched }));
      }

      return { transaction: enriched };
    }
  } catch (err: any) {
    console.error('[transactionService] logTransaction caught error:', err);
    return { error: 'Terjadi kesalahan sistem, coba lagi' };
  }
}

export async function fetchTransactions(
  merchantId: string, 
  filters: TransactionFilters
): Promise<{ transactions: Transaction[]; total: number }> {
  try {
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    
    if (isSupabaseConfigured) {
      let query = supabase
        .from('transactions')
        .select('*, rfid_tag:rfid_tags(visitor:visitors(name, phone, ticket_type)), merchant:merchants(name, category)', { count: 'exact' });

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

      // Enrich nested outputs to match TypeScript Transaction interface joins
      const enriched: Transaction[] = (data || []).map(tx => {
        const vInfo = (tx as any).rfid_tag?.visitor;
        return {
          id: tx.id,
          rfid_uid: tx.rfid_uid,
          merchant_id: tx.merchant_id,
          type: tx.type as any,
          amount: Number(tx.amount),
          created_at: tx.created_at,
          whatsapp_status: tx.whatsapp_status as any,
          visitor_name: vInfo?.name || 'Unknown',
          visitor_phone: vInfo?.phone || undefined,
          ticket_type: vInfo?.ticket_type || 'Regular',
          merchant_name: (tx as any).merchant?.name || 'Unknown',
          merchant_category: (tx as any).merchant?.category || 'General'
        };
      });

      return { transactions: enriched, total: count || 0 };
    } else {
      // Simulation mode
      let transactions = getStorageItem<Transaction[]>('ecotour_transactions', []);
      const visitors = getStorageItem<Visitor[]>('ecotour_visitors', []);
      const tags = getStorageItem<RFIDTag[]>('ecotour_rfid_tags', []);
      const merchants = getStorageItem<Merchant[]>('ecotour_merchants', []);

      // Filter by merchant
      if (merchantId !== 'all') {
        transactions = transactions.filter(t => t.merchant_id === merchantId);
      }
      if (filters.type) {
        transactions = transactions.filter(t => t.type === filters.type);
      }
      if (filters.dateFrom) {
        transactions = transactions.filter(t => t.created_at >= (filters.dateFrom || ''));
      }
      if (filters.dateTo) {
        transactions = transactions.filter(t => t.created_at <= (filters.dateTo || ''));
      }

      const total = transactions.length;

      // Slice for pagination
      const pageList = transactions.slice(offset, offset + limit);

      // Join details
      const enriched: Transaction[] = pageList.map(tx => {
        const tag = tags.find(t => t.uid === tx.rfid_uid);
        const visitor = tag ? visitors.find(v => v.id === tag.visitor_id) : null;
        const merchantObj = merchants.find(m => m.id === tx.merchant_id);

        return {
          ...tx,
          visitor_name: visitor?.name || 'Unknown',
          visitor_phone: visitor?.phone || undefined,
          ticket_type: visitor?.ticket_type || 'Regular',
          merchant_name: merchantObj?.name || 'Unknown',
          merchant_category: merchantObj?.category || 'General'
        };
      });

      return { transactions: enriched, total };
    }
  } catch (err) {
    console.error('[transactionService] fetchTransactions caught error:', err);
    return { transactions: [], total: 0 };
  }
}

export async function fetchTransactionStats(
  merchantId: string
): Promise<{ today: { count: number; total: number }; thisWeek: { count: number; total: number }; thisMonth: { count: number; total: number } }> {
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

    if (isSupabaseConfigured) {
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

      const todayList = data.filter(t => t.created_at >= startOfToday);
      const weekList = data.filter(t => t.created_at >= startOfWeekISO);

      const sumTotal = (list: any[]) => list.filter(t => t.type === 'payment').reduce((acc, t) => acc + Number(t.amount), 0);
      const count = (list: any[]) => list.length;

      return {
        today: { count: count(todayList), total: sumTotal(todayList) },
        thisWeek: { count: count(weekList), total: sumTotal(weekList) },
        thisMonth: { count: count(data), total: sumTotal(data) }
      };
    } else {
      // Simulation mode
      let transactions = getStorageItem<Transaction[]>('ecotour_transactions', []);
      if (merchantId !== 'all') {
        transactions = transactions.filter(t => t.merchant_id === merchantId);
      }

      const todayList = transactions.filter(t => t.created_at >= startOfToday);
      const weekList = transactions.filter(t => t.created_at >= startOfWeekISO);
      const monthList = transactions.filter(t => t.created_at >= startOfMonth);

      const sumTotal = (list: Transaction[]) => list.filter(t => t.type === 'payment').reduce((acc, t) => acc + t.amount, 0);
      const count = (list: Transaction[]) => list.length;

      return {
        today: { count: count(todayList), total: sumTotal(todayList) },
        thisWeek: { count: count(weekList), total: sumTotal(weekList) },
        thisMonth: { count: count(monthList), total: sumTotal(monthList) }
      };
    }
  } catch (err) {
    console.error('[transactionService] fetchTransactionStats caught error:', err);
    return {
      today: { count: 0, total: 0 },
      thisWeek: { count: 0, total: 0 },
      thisMonth: { count: 0, total: 0 }
    };
  }
}
