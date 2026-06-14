import { createBrowserClient } from '@supabase/ssr';
import type { CreditCheckResult, Merchant, RFIDTag, Transaction, Visitor } from '@/types';
import { normalizeUID } from './utils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export function requireSupabaseConfig() {
  if (!hasSupabaseConfig) {
    throw new Error(
      'Konfigurasi Supabase belum tersedia. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }
}

export const supabase = createBrowserClient(
  supabaseUrl || 'https://missing-config.supabase.co',
  supabaseAnonKey || 'missing-config'
);

export const db = {
  getVisitors: async (): Promise<Visitor[]> => {
    requireSupabaseConfig();
    const { data, error } = await supabase
      .from('visitors')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as Visitor[];
  },

  getRFIDTags: async (): Promise<RFIDTag[]> => {
    requireSupabaseConfig();
    const { data, error } = await supabase
      .from('rfid_tags')
      .select('*')
      .order('registered_at', { ascending: false });
    if (error) throw error;
    return data as RFIDTag[];
  },

  getVisitorByUID: async (uid: string): Promise<{ visitor: Visitor; tag: RFIDTag } | null> => {
    requireSupabaseConfig();
    const { data, error } = await supabase
      .from('rfid_tags')
      .select('*, visitor:visitors(*)')
      .eq('uid', normalizeUID(uid))
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    if (!data?.visitor) return null;
    const { visitor, ...tag } = data;
    return { visitor: visitor as Visitor, tag: tag as RFIDTag };
  },

  createVisitor: async (
    input: Omit<Visitor, 'id' | 'created_at' | 'credit_used' | 'photo_url'>,
    uid: string
  ): Promise<Visitor> => {
    requireSupabaseConfig();
    const photoUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(input.name)}`;
    const { data: visitor, error: visitorError } = await supabase
      .from('visitors')
      .insert({
        name: input.name,
        phone: input.phone || null,
        photo_url: photoUrl,
        ticket_type: input.ticket_type,
        credit_limit: input.credit_limit,
        credit_used: 0,
      })
      .select()
      .single();

    if (visitorError || !visitor) {
      throw new Error(visitorError?.message || 'Gagal menyimpan data wisatawan');
    }

    const { error: tagError } = await supabase.from('rfid_tags').insert({
      uid: normalizeUID(uid),
      visitor_id: visitor.id,
      is_active: true,
      registered_by: 'admin',
    });

    if (tagError) {
      await supabase.from('visitors').delete().eq('id', visitor.id);
      throw new Error(tagError.message || 'Gagal meregistrasi tag RFID');
    }

    return visitor as Visitor;
  },

  resetVisitorCredit: async (id: string, limit: number, used: number): Promise<boolean> => {
    requireSupabaseConfig();
    const { error } = await supabase
      .from('visitors')
      .update({ credit_limit: limit, credit_used: used })
      .eq('id', id);
    return !error;
  },

  getMerchants: async (): Promise<Merchant[]> => {
    requireSupabaseConfig();
    const { data, error } = await supabase
      .from('merchants')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as Merchant[];
  },

  updateMerchant: async (
    id: string,
    merchant: { name: string; category: string; location: string; phone: string }
  ): Promise<boolean> => {
    requireSupabaseConfig();
    const { error } = await supabase.from('merchants').update(merchant).eq('id', id);
    return !error;
  },

  deleteMerchant: async (id: string): Promise<boolean> => {
    const response = await fetch('/api/admin/delete-merchant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  },

  getTransactions: async (): Promise<Transaction[]> => {
    requireSupabaseConfig();
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*, merchant:merchants(name)')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const { data: tags, error: tagsError } = await supabase
      .from('rfid_tags')
      .select('uid, visitor:visitors(name, phone, ticket_type)');
    if (tagsError) throw tagsError;

    return (transactions || []).map(transaction => {
      const tag = tags?.find(item => item.uid === transaction.rfid_uid);
      const visitor = tag?.visitor as unknown as Pick<Visitor, 'name' | 'phone' | 'ticket_type'> | null;
      const merchant = transaction.merchant as unknown as Pick<Merchant, 'name'> | null;
      return {
        id: transaction.id,
        rfid_uid: transaction.rfid_uid,
        merchant_id: transaction.merchant_id,
        type: transaction.type,
        amount: Number(transaction.amount),
        created_at: transaction.created_at,
        whatsapp_status: transaction.whatsapp_status,
        source: transaction.source || 'tap',
        order_id: transaction.order_id,
        note: transaction.note,
        visitor_name: visitor?.name || 'Unknown',
        visitor_phone: visitor?.phone || undefined,
        ticket_type: visitor?.ticket_type || 'Regular',
        merchant_name: merchant?.name || 'Unknown',
      };
    });
  },

  checkCredit: (visitor: Visitor, amount: number): CreditCheckResult => {
    if (visitor.credit_limit === 0) {
      return {
        allowed: true,
        credit_limit: 0,
        credit_used: visitor.credit_used,
        credit_remaining: Infinity,
        reason: null,
      };
    }

    const remaining = visitor.credit_limit - visitor.credit_used;
    return {
      allowed: remaining >= amount,
      credit_limit: visitor.credit_limit,
      credit_used: visitor.credit_used,
      credit_remaining: remaining,
      reason: remaining >= amount
        ? null
        : `Saldo tidak cukup. Sisa: Rp ${remaining.toLocaleString('id-ID')}`,
    };
  },
};
