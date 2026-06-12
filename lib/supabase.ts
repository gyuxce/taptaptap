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
  { id: 'm-lok1', name: 'Loket Utama Barat (Entry)', category: 'Loket/Gerbang', location: 'Gerbang Barat Area A', merchant_type: 'loket', owner_user_id: 'u-lok1', is_active: true, created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
  { id: 'm-lok2', name: 'Loket Utama Timur (Entry)', category: 'Loket/Gerbang', location: 'Gerbang Timur Area C', merchant_type: 'loket', owner_user_id: 'u-lok2', is_active: true, created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
  { id: 'm-adv1', name: 'Zipline Canopy Canopy', category: 'Adventure', location: 'Lembah Pinus Area B', merchant_type: 'regular', owner_user_id: 'u-adv1', is_active: true, created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
  { id: 'm-adv2', name: 'Rafting Sungai Citarum', category: 'Adventure', location: 'Dermaga Sungai Area A', merchant_type: 'regular', owner_user_id: 'u-adv2', is_active: true, created_at: new Date(Date.now() - 28 * 24 * 3600 * 1000).toISOString() },
  { id: 'm-fb1', name: 'Warung Kopi Pinus', category: 'F&B', location: 'Puncak Pinus Area B', merchant_type: 'regular', owner_user_id: 'u-fb1', is_active: true, created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
  { id: 'm-fb2', name: 'Resto Sunda EcoGreen', category: 'F&B', location: 'Food Court Utama', merchant_type: 'regular', owner_user_id: 'u-fb2', is_active: true, created_at: new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString() },
  { id: 'm-ret1', name: 'EcoCraft Souvenir & Kaos', category: 'Retail', location: 'Plaza Belanja Utama', merchant_type: 'regular', owner_user_id: 'u-ret1', is_active: true, created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
  { id: 'm-ret2', name: 'Oleh-oleh Keripik & Madu', category: 'Retail', location: 'Plaza Belanja Kios #5', merchant_type: 'regular', owner_user_id: 'u-ret2', is_active: true, created_at: new Date(Date.now() - 27 * 24 * 3600 * 1000).toISOString() },
  { id: 'm-sight1', name: 'Gardu Pandang Gunung Indah', category: 'Sightseeing', location: 'Puncak Bukit Area D', merchant_type: 'regular', owner_user_id: 'u-sight1', is_active: true, created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
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
    return getStorageItem<Visitor[]>('ecotour_visitors', MOCK_VISITORS);
  },

  getRFIDTags: async (): Promise<RFIDTag[]> => {
    return getStorageItem<RFIDTag[]>('ecotour_rfid_tags', MOCK_RFID_TAGS);
  },

  getVisitorByUID: async (uid: string): Promise<{ visitor: Visitor; tag: RFIDTag } | null> => {
    const normalized = normalizeUID(uid);
    const tags = await db.getRFIDTags();
    const visitors = await db.getVisitors();
    
    const tag = tags.find(t => t.uid === normalized && t.is_active);
    if (!tag) return null;
    
    const visitor = visitors.find(v => v.id === tag.visitor_id);
    if (!visitor) return null;
    
    return { visitor, tag };
  },

  createVisitor: async (data: Omit<Visitor, 'id' | 'created_at' | 'credit_used' | 'photo_url'>, uid: string): Promise<Visitor> => {
    const visitors = await db.getVisitors();
    const tags = await db.getRFIDTags();
    
    const newVisitor: Visitor = {
      id: `v-${Date.now()}`,
      name: data.name,
      phone: data.phone || null,
      photo_url: null,
      ticket_type: data.ticket_type,
      credit_limit: data.credit_limit,
      credit_used: 0,
      created_at: new Date().toISOString(),
    };
    
    const newTag: RFIDTag = {
      id: `tag-${Date.now()}`,
      uid: normalizeUID(uid),
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
    return getStorageItem<Merchant[]>('ecotour_merchants', MOCK_MERCHANTS);
  },

  createMerchant: async (merchantData: Omit<Merchant, 'id' | 'created_at' | 'is_active'>): Promise<Merchant> => {
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

  // Transactions
  getTransactions: async (): Promise<Transaction[]> => {
    const txs = getStorageItem<Transaction[]>('ecotour_transactions', MOCK_TRANSACTIONS);
    const visitors = await db.getVisitors();
    const tags = await db.getRFIDTags();
    const merchants = await db.getMerchants();
    
    // Join names and details
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
    // 0 = unlimited
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
    const visitors = await db.getVisitors();
    const tags = await db.getRFIDTags();
    const merchants = await db.getMerchants();
    const transactions = getStorageItem<Transaction[]>('ecotour_transactions', MOCK_TRANSACTIONS);

    // Find tag
    const tag = tags.find(t => t.uid === normalizedUID && t.is_active);
    if (!tag) {
      return { success: false, error: 'Tag RFID tidak terdaftar atau tidak aktif!' };
    }

    // Find visitor
    const visitor = visitors.find(v => v.id === tag.visitor_id);
    if (!visitor) {
      return { success: false, error: 'Wisatawan pemilik gelang tidak ditemukan!' };
    }

    // Find merchant
    const merchant = merchants.find(m => m.id === txData.merchant_id);
    if (!merchant) {
      return { success: false, error: 'Merchant tidak terdaftar!' };
    }

    if (!merchant.is_active) {
      return { success: false, error: 'Merchant partner sedang dinonaktifkan!' };
    }

    const txType = merchant.merchant_type === 'loket' ? 'entry' : 'payment';
    const amountToCharge = txType === 'entry' ? 0 : txData.amount;

    // Check balance
    if (txType === 'payment') {
      const check = db.checkCredit(visitor, amountToCharge);
      if (!check.allowed) {
        return { success: false, error: check.reason || 'Saldo gelang NFC tidak mencukupi!' };
      }
    }

    // Update visitor credit_used
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

    // Call notification dispatch
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
          // Update status in local storage transactions
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
