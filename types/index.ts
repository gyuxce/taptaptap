export interface Profile {
  id: string              // = auth.users.id
  role: 'admin' | 'merchant'
  merchant_id: string | null
  merchant_type: 'loket' | 'regular' | null
  created_at: string
}

export interface Visitor {
  id: string
  name: string
  phone: string | null
  photo_url: string | null
  ticket_type: 'Regular' | 'VIP' | 'Family' | 'Group'
  credit_limit: number    // 0 = unlimited
  credit_used: number
  created_at: string
}

export interface RFIDTag {
  id: string
  uid: string             // hex uppercase, e.g. E280113C200078AC
  visitor_id: string
  is_active: boolean
  registered_by: string | null   // merchant_id yang daftarkan
  registered_at: string
}

export interface Merchant {
  id: string
  name: string
  category: string
  location: string
  merchant_type: 'loket' | 'regular'
  owner_user_id: string | null
  is_active: boolean
  created_at: string
}

export interface Transaction {
  id: string
  rfid_uid: string
  merchant_id: string
  type: 'entry' | 'payment'
  amount: number
  created_at: string
  whatsapp_status: 'not_applicable' | 'pending' | 'sent' | 'failed'
  // joined fields (tidak di DB, di-compute saat fetch)
  visitor_name?: string
  visitor_phone?: string
  ticket_type?: string
  merchant_name?: string
  merchant_category?: string
}

export interface CreditCheckResult {
  allowed: boolean
  credit_limit: number
  credit_used: number
  credit_remaining: number
  reason: string | null
}

export interface CreditTopUp {
  id: string;
  visitor_id: string;
  rfid_uid: string;
  amount: number;
  top_up_by: string; // merchant_id or 'admin'
  top_up_by_name?: string;
  note?: string;
  created_at: string;
}

export interface JourneyItem {
  transaction_id: string;
  merchant_name: string;
  merchant_category: string;
  merchant_location: string;
  type: 'entry' | 'payment';
  amount: number;
  created_at: string;
}

export interface JourneyStats {
  total_spend: number;
  total_taps: number;
  first_tap: string;
  last_tap: string;
  duration_minutes: number;
  merchants_visited: string[];
}
