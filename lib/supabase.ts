import { createBrowserClient } from '@supabase/ssr';
import { Visitor, Merchant, Transaction, RFIDTag, Profile, CreditCheckResult } from '@/types';
import { normalizeUID } from './utils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Pass placeholders if not configured to prevent crash during createBrowserClient
export const supabase = createBrowserClient(
  supabaseUrl || 'https://placeholder-project.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);

// Helper to generate a mock RFID UID
function generateRFIDUID(): string {
  const chars = '0123456789ABCDEF';
  let uid = '';
  for (let i = 0; i < 16; i++) {
    uid += chars[Math.floor(Math.random() * 16)];
  }
  return uid;
}

// Preloaded Mock Data
const MOCK_MERCHANTS: Merchant[] = [
  { id: 'm-lok1', name: 'Loket Utama Barat (Entry)', category: 'Loket/Gerbang', location: 'Gerbang Barat Area A', merchant_type: 'loket', owner_user_id: 'u-lok1', phone: '081234567890', is_active: true, created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
  { id: 'm-lok2', name: 'Loket Utama Timur (Entry)', category: 'Loket/Gerbang', location: 'Gerbang Timur Area C', merchant_type: 'loket', owner_user_id: 'u-lok2', phone: '081234567890', is_active: true, created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
  { id: 'm-adv1', name: 'Zipline Canopy Canopy', category: 'Adventure', location: 'Lembah Pinus Area B', merchant_type: 'regular', owner_user_id: 'u-adv1', phone: '081234567890', is_active: true, created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
  { id: 'm-adv2', name: 'Rafting Sungai Citarum', category: 'Adventure', location: 'Dermaga Sungai Area A', merchant_type: 'regular', owner_user_id: 'u-adv2', phone: '081234567890', is_active: true, created_at: new Date(Date.now() - 28 * 24 * 3600 * 1000).toISOString() },
  { id: 'm-fb1', name: 'Warung Kopi Pinus', category: 'F&B', location: 'Puncak Pinus Area B', merchant_type: 'regular', owner_user_id: 'u-fb1', phone: '081234567890', is_active: true, created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
  { id: 'm-fb2', name: 'Resto Sunda EcoGreen', category: 'F&B', location: 'Food Court Utama', merchant_type: 'regular', owner_user_id: 'u-fb2', phone: '081234567890', is_active: true, created_at: new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString() },
  { id: 'm-ret1', name: 'EcoCraft Souvenir & Kaos', category: 'Retail', location: 'Plaza Belanja Utama', merchant_type: 'regular', owner_user_id: 'u-ret1', phone: '081234567890', is_active: true, created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
  { id: 'm-ret2', name: 'Oleh-oleh Keripik & Madu', category: 'Retail', location: 'Plaza Belanja Kios #5', merchant_type: 'regular', owner_user_id: 'u-ret2', phone: '081234567890', is_active: true, created_at: new Date(Date.now() - 27 * 24 * 3600 * 1000).toISOString() },
  { id: 'm-sight1', name: 'Gardu Pandang Gunung Indah', category: 'Sightseeing', location: 'Puncak Bukit Area D', merchant_type: 'regular', owner_user_id: 'u-sight1', phone: '081234567890', is_active: true, created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
];

// Add auto-generated merchants to reach 50+ scale
for (let i = 10; i <= 52; i++) {
  const categories = ['Adventure', 'F&B', 'Retail', 'Sightseeing'] as const;
  const category = categories[i % categories.length];
  MOCK_MERCHANTS.push({
    id: `m-gen${i}`,
    name: `${category} Merchant #${i}`,
    category: category,
    location: `Lokasi Kios #${i} Area ${String.fromCharCode(65 + (i % 4))}`,
    merchant_type: 'regular',
    owner_user_id: `u-gen${i}`,
    phone: `081234567890`,
    is_active: true,
    created_at: new Date(Date.now() - (30 - (i % 20)) * 24 * 3600 * 1000).toISOString(),
  });
}
const MOCK_VISITORS: Visitor[] = [];
const MOCK_RFID_TAGS: RFIDTag[] = [];
const MOCK_TRANSACTIONS: Transaction[] = [];

// Storage Helpers
export const getStorageItem = <T>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  const stored = window.localStorage.getItem(key);
  if (!stored) {
    window.localStorage.setItem(key, JSON.stringify(defaultValue));
    return defaultValue;
  }
  return JSON.parse(stored) as T;
};

export const setStorageItem = <T>(key: string, value: T): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

export const db = {
  getSession: (): Profile | null => {
    if (typeof window !== 'undefined') {
      const stored = window.sessionStorage.getItem('ecotour_session') || window.localStorage.getItem('ecotour_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        const sessionObj = parsed.profile || parsed;
        if (sessionObj && !document.cookie.includes('ecotour_session')) {
          document.cookie = `ecotour_session=${encodeURIComponent(JSON.stringify(sessionObj))}; path=/; max-age=86400`;
        }
        return sessionObj;
      }
    }
    return null;
  },

  // Visitors & RFID
  getVisitors: async (): Promise<Visitor[]> => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('visitors')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('[db.getVisitors] error:', error);
        return [];
      }
      return data as Visitor[];
    }
    return getStorageItem<Visitor[]>('ecotour_visitors', MOCK_VISITORS);
  },

  getRFIDTags: async (): Promise<RFIDTag[]> => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('rfid_tags')
        .select('*')
        .order('registered_at', { ascending: false });
      if (error) {
        console.error('[db.getRFIDTags] error:', error);
        return [];
      }
      return data as RFIDTag[];
    }
    return getStorageItem<RFIDTag[]>('ecotour_rfid_tags', MOCK_RFID_TAGS);
  },

  getVisitorByUID: async (uid: string): Promise<{ visitor: Visitor; tag: RFIDTag } | null> => {
    const normalized = normalizeUID(uid);
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('rfid_tags')
        .select('*, visitor:visitors(*)')
        .eq('uid', normalized)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !data || !data.visitor) {
        return null;
      }
      const { visitor, ...tagOnly } = data;
      return { visitor: visitor as Visitor, tag: tagOnly as RFIDTag };
    }
    const tags = await db.getRFIDTags();
    const visitors = await db.getVisitors();
    
    const tag = tags.find(t => t.uid === normalized && t.is_active);
    if (!tag) return null;
    
    const visitor = visitors.find(v => v.id === tag.visitor_id);
    if (!visitor) return null;
    
    return { visitor, tag };
  },

  createVisitor: async (data: Omit<Visitor, 'id' | 'created_at' | 'credit_used' | 'photo_url'>, uid: string): Promise<Visitor> => {
    const normalized = normalizeUID(uid);
    const photoUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.name)}`;
    if (isSupabaseConfigured) {
      // 1. Insert visitor
      const { data: newVisitor, error: vErr } = await supabase
        .from('visitors')
        .insert({
          name: data.name,
          phone: data.phone || null,
          photo_url: photoUrl,
          ticket_type: data.ticket_type,
          credit_limit: data.credit_limit,
          credit_used: 0
        })
        .select()
        .single();
      if (vErr || !newVisitor) {
        throw new Error(vErr?.message || 'Gagal menyimpan data wisatawan');
      }

      // 2. Insert tag
      const { error: tErr } = await supabase
        .from('rfid_tags')
        .insert({
          uid: normalized,
          visitor_id: newVisitor.id,
          is_active: true,
          registered_by: 'admin'
        });
      if (tErr) {
        // Rollback visitor
        await supabase.from('visitors').delete().eq('id', newVisitor.id);
        throw new Error(tErr.message || 'Gagal meregistrasi tag RFID');
      }
      return newVisitor as Visitor;
    }
    const visitors = await db.getVisitors();
    const tags = await db.getRFIDTags();
    
    const newVisitor: Visitor = {
      id: `v-${Date.now()}`,
      name: data.name,
      phone: data.phone || null,
      photo_url: photoUrl,
      ticket_type: data.ticket_type,
      credit_limit: data.credit_limit,
      credit_used: 0,
      created_at: new Date().toISOString(),
    };
    
    const newTag: RFIDTag = {
      id: `tag-${Date.now()}`,
      uid: normalized,
      visitor_id: newVisitor.id,
      is_active: true,
      registered_by: 'admin',
      registered_at: new Date().toISOString(),
    };

    visitors.unshift(newVisitor);
    tags.unshift(newTag);
    
    setStorageItem('ecotour_visitors', visitors);
    setStorageItem('ecotour_rfid_tags', tags);
    
    return newVisitor;
  },

  resetVisitorCredit: async (id: string, limit: number, used: number): Promise<boolean> => {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('visitors')
        .update({ credit_limit: limit, credit_used: used })
        .eq('id', id);
      return !error;
    }
    const visitors = await db.getVisitors();
    const idx = visitors.findIndex(v => v.id === id);
    if (idx !== -1) {
      visitors[idx].credit_limit = limit;
      visitors[idx].credit_used = used;
      setStorageItem('ecotour_visitors', visitors);
      return true;
    }
    return false;
  },

  // Merchants
  getMerchants: async (): Promise<Merchant[]> => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('merchants')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('[db.getMerchants] error:', error);
        return [];
      }
      return data as Merchant[];
    }
    return getStorageItem<Merchant[]>('ecotour_merchants', MOCK_MERCHANTS);
  },

  createMerchant: async (merchantData: Omit<Merchant, 'id' | 'created_at' | 'is_active'>): Promise<Merchant> => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('merchants')
        .insert({
          name: merchantData.name,
          category: merchantData.category,
          location: merchantData.location,
          merchant_type: merchantData.merchant_type,
          owner_user_id: merchantData.owner_user_id,
          is_active: true
        })
        .select()
        .single();
      if (error || !data) {
        throw new Error(error?.message || 'Gagal menyimpan merchant');
      }
      return data as Merchant;
    }
    const merchants = await db.getMerchants();
    const newMerchant: Merchant = {
      id: `m-${Date.now()}`,
      name: merchantData.name,
      category: merchantData.category,
      location: merchantData.location,
      merchant_type: merchantData.merchant_type,
      owner_user_id: merchantData.owner_user_id || `u-${Date.now()}`,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    merchants.unshift(newMerchant);
    setStorageItem('ecotour_merchants', merchants);
    return newMerchant;
  },

  updateMerchant: async (id: string, merchantData: { name: string; category: string; location: string; phone: string }): Promise<boolean> => {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('merchants')
        .update({
          name: merchantData.name,
          category: merchantData.category,
          location: merchantData.location,
          phone: merchantData.phone
        })
        .eq('id', id);
      return !error;
    }
    const merchants = await db.getMerchants();
    const idx = merchants.findIndex(m => m.id === id);
    if (idx !== -1) {
      merchants[idx].name = merchantData.name;
      merchants[idx].category = merchantData.category;
      merchants[idx].location = merchantData.location;
      merchants[idx].phone = merchantData.phone;
      setStorageItem('ecotour_merchants', merchants);
      return true;
    }
    return false;
  },

  deleteMerchant: async (id: string): Promise<boolean> => {
    if (isSupabaseConfigured) {
      const res = await fetch('/api/admin/delete-merchant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const resJson = await res.json();
      return !!resJson.success;
    }
    const merchants = await db.getMerchants();
    const filtered = merchants.filter(m => m.id !== id);
    setStorageItem('ecotour_merchants', filtered);
    
    // Clean up offline mock credentials and profiles
    if (typeof window !== 'undefined') {
      const credentials = JSON.parse(window.localStorage.getItem('ecotour_credentials') || '[]');
      const filteredCreds = credentials.filter((c: any) => c.merchant_id !== id);
      window.localStorage.setItem('ecotour_credentials', JSON.stringify(filteredCreds));

      const profiles = JSON.parse(window.localStorage.getItem('ecotour_profiles') || '[]');
      const filteredProfs = profiles.filter((p: any) => p.merchant_id !== id);
      window.localStorage.setItem('ecotour_profiles', JSON.stringify(filteredProfs));
    }

    return true;
  },

  // Transactions
  getTransactions: async (): Promise<Transaction[]> => {
    if (isSupabaseConfigured) {
      const { data: txs, error: txErr } = await supabase
        .from('transactions')
        .select('*, merchant:merchants(name)')
        .order('created_at', { ascending: false });
        
      if (txErr || !txs) {
        console.error('[db.getTransactions] error:', txErr);
        return [];
      }

      const { data: tags } = await supabase.from('rfid_tags').select('*, visitor:visitors(name, phone, ticket_type)');
      
      return txs.map(tx => {
        const tag = tags?.find(t => t.uid === tx.rfid_uid);
        const visitor = tag?.visitor as any;
        const merchant = tx.merchant as any;
        
        return {
          id: tx.id,
          rfid_uid: tx.rfid_uid,
          merchant_id: tx.merchant_id,
          type: tx.type,
          amount: Number(tx.amount),
          created_at: tx.created_at,
          whatsapp_status: tx.whatsapp_status,
          visitor_name: visitor?.name || 'Unknown',
          visitor_phone: visitor?.phone || undefined,
          ticket_type: visitor?.ticket_type || 'Regular',
          merchant_name: merchant?.name || 'Unknown',
        };
      });
    }
    
    const txs = getStorageItem<Transaction[]>('ecotour_transactions', MOCK_TRANSACTIONS);
    const visitors = await db.getVisitors();
    const tags = await db.getRFIDTags();
    const merchants = await db.getMerchants();
    
    return txs.map(tx => {
      const tag = tags.find(t => t.uid === tx.rfid_uid);
      const visitor = tag ? visitors.find(v => v.id === tag.visitor_id) : null;
      const merchant = merchants.find(m => m.id === tx.merchant_id);
      
      return {
        ...tx,
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
    const allowed = remaining >= amount;
    
    return {
      allowed,
      credit_limit: visitor.credit_limit,
      credit_used: visitor.credit_used,
      credit_remaining: remaining,
      reason: allowed ? null : `Saldo tidak cukup. Sisa: Rp ${remaining.toLocaleString('id-ID')}`,
    };
  },

  createTransaction: async (txData: {
    rfid_uid: string;
    merchant_id: string;
    amount: number;
  }): Promise<{ success: boolean; transaction?: Transaction; error?: string }> => {
    const normalizedUID = normalizeUID(txData.rfid_uid);
    if (isSupabaseConfigured) {
      const { data: tagData, error: tagErr } = await supabase
        .from('rfid_tags')
        .select('*, visitor:visitors(*)')
        .eq('uid', normalizedUID)
        .eq('is_active', true)
        .maybeSingle();

      if (tagErr || !tagData) {
        return { success: false, error: 'Tag RFID tidak terdaftar atau tidak aktif!' };
      }
      const visitor = tagData.visitor as Visitor;
      if (!visitor) {
        return { success: false, error: 'Wisatawan pemilik gelang tidak ditemukan!' };
      }

      const { data: merchant, error: mErr } = await supabase
        .from('merchants')
        .select('*')
        .eq('id', txData.merchant_id)
        .single();

      if (mErr || !merchant) {
        return { success: false, error: 'Merchant tidak terdaftar!' };
      }
      if (!merchant.is_active) {
        return { success: false, error: 'Merchant partner sedang dinonaktifkan!' };
      }

      const txType = merchant.merchant_type === 'loket' ? 'entry' : 'payment';
      const amountToCharge = txType === 'entry' ? 0 : txData.amount;

      if (txType === 'payment') {
        const check = db.checkCredit(visitor, amountToCharge);
        if (!check.allowed) {
          return { success: false, error: check.reason || 'Saldo gelang NFC tidak mencukupi!' };
        }

        const { error: updErr } = await supabase
          .from('visitors')
          .update({ credit_used: visitor.credit_used + amountToCharge })
          .eq('id', visitor.id);
        if (updErr) {
          return { success: false, error: 'Gagal memperbarui saldo wisatawan!' };
        }
      }

      const { data: newTx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          rfid_uid: normalizedUID,
          merchant_id: merchant.id,
          type: txType,
          amount: amountToCharge,
          whatsapp_status: visitor.phone ? 'pending' : 'not_applicable'
        })
        .select()
        .single();

      if (txErr || !newTx) {
        if (txType === 'payment') {
          await supabase.from('visitors').update({ credit_used: visitor.credit_used }).eq('id', visitor.id);
        }
        return { success: false, error: 'Gagal menyimpan transaksi!' };
      }

      if (visitor.phone) {
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: visitor.phone,
            name: visitor.name,
            merchantName: merchant.name,
            amount: amountToCharge,
            creditLeft: visitor.credit_limit === 0 ? 'Unlimited' : (visitor.credit_limit - (visitor.credit_used + amountToCharge)),
            transactionType: txType,
          }),
        }).then(async (r) => {
          const resJson = await r.json();
          await supabase
            .from('transactions')
            .update({ whatsapp_status: resJson.success ? 'sent' : 'failed' })
            .eq('id', newTx.id);
        }).catch(err => console.warn('WA dispatch failed', err));
      }

      return {
        success: true,
        transaction: {
          id: newTx.id,
          rfid_uid: newTx.rfid_uid,
          merchant_id: newTx.merchant_id,
          type: newTx.type,
          amount: Number(newTx.amount),
          created_at: newTx.created_at,
          whatsapp_status: newTx.whatsapp_status,
          visitor_name: visitor.name,
          visitor_phone: visitor.phone || undefined,
          ticket_type: visitor.ticket_type,
          merchant_name: merchant.name,
        },
      };
    }
    
    const visitors = await db.getVisitors();
    const tags = await db.getRFIDTags();
    const merchants = await db.getMerchants();
    const transactions = getStorageItem<Transaction[]>('ecotour_transactions', MOCK_TRANSACTIONS);

    const tag = tags.find(t => t.uid === normalizedUID && t.is_active);
    if (!tag) {
      return { success: false, error: 'Tag RFID tidak terdaftar atau tidak aktif!' };
    }

    const visitor = visitors.find(v => v.id === tag.visitor_id);
    if (!visitor) {
      return { success: false, error: 'Wisatawan pemilik gelang tidak ditemukan!' };
    }

    const merchant = merchants.find(m => m.id === txData.merchant_id);
    if (!merchant) {
      return { success: false, error: 'Merchant tidak terdaftar!' };
    }

    if (!merchant.is_active) {
      return { success: false, error: 'Merchant partner sedang dinonaktifkan!' };
    }

    const txType = merchant.merchant_type === 'loket' ? 'entry' : 'payment';
    const amountToCharge = txType === 'entry' ? 0 : txData.amount;

    if (txType === 'payment') {
      const check = db.checkCredit(visitor, amountToCharge);
      if (!check.allowed) {
        return { success: false, error: check.reason || 'Saldo gelang NFC tidak mencukupi!' };
      }
    }

    visitor.credit_used += amountToCharge;
    setStorageItem('ecotour_visitors', visitors);

    const newTx: Transaction = {
      id: `tx-${Date.now()}`,
      rfid_uid: normalizedUID,
      merchant_id: merchant.id,
      type: txType,
      amount: amountToCharge,
      created_at: new Date().toISOString(),
      whatsapp_status: visitor.phone ? 'pending' : 'not_applicable',
    };

    transactions.unshift(newTx);
    setStorageItem('ecotour_transactions', transactions);

    if (visitor.phone) {
      try {
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: visitor.phone,
            name: visitor.name,
            merchantName: merchant.name,
            amount: amountToCharge,
            creditLeft: visitor.credit_limit === 0 ? 'Unlimited' : (visitor.credit_limit - visitor.credit_used),
            transactionType: txType,
          }),
        }).then(async (r) => {
          const resJson = await r.json();
          const updatedTxs = getStorageItem<Transaction[]>('ecotour_transactions', MOCK_TRANSACTIONS);
          const tIdx = updatedTxs.findIndex(t => t.id === newTx.id);
          if (tIdx !== -1) {
            updatedTxs[tIdx].whatsapp_status = resJson.success ? 'sent' : 'failed';
            setStorageItem('ecotour_transactions', updatedTxs);
          }
        }).catch(err => console.warn('WA dispatch failed', err));
      } catch {
        // ignore
      }
    }

    return {
      success: true,
      transaction: {
        ...newTx,
        visitor_name: visitor.name,
        visitor_phone: visitor.phone || undefined,
        ticket_type: visitor.ticket_type,
        merchant_name: merchant.name,
      },
    };
  },
};
