-- WAVR - Supabase Schema
-- Skala Produksi (50+ Merchant)

-- Drop existing resources if resetting
-- DROP TRIGGER IF EXISTS trg_after_transaction_insert ON transactions;
-- DROP FUNCTION IF EXISTS trg_fn_after_transaction_insert;
-- DROP TRIGGER IF EXISTS trg_after_visitor_insert ON visitors;
-- DROP FUNCTION IF EXISTS trg_fn_after_visitor_insert;
-- DROP TABLE IF EXISTS audit_log;
-- DROP TABLE IF EXISTS transactions;
-- DROP TABLE IF EXISTS merchants;
-- DROP TABLE IF EXISTS rfid_tags;
-- DROP TABLE IF EXISTS visitors;
-- DROP TABLE IF EXISTS profiles;

-- =======================================================================
-- 1. PROFILES (Extends Supabase auth.users)
-- =======================================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'merchant')),
  merchant_id TEXT,
  merchant_type TEXT CHECK (merchant_type IN ('loket', 'regular')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =======================================================================
-- 2. VISITORS
-- =======================================================================
CREATE TABLE visitors (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  phone TEXT,
  photo_url TEXT,
  ticket_type TEXT NOT NULL DEFAULT 'Regular' CHECK (ticket_type IN ('Regular', 'VIP', 'Family', 'Group')),
  credit_limit NUMERIC NOT NULL DEFAULT 0,
  credit_used NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT phone_format CHECK (
    phone IS NULL OR phone ~ '^(08|\+62)[0-9]{8,11}$'
  ),
  CONSTRAINT credit_non_negative CHECK (credit_limit >= 0 AND credit_used >= 0)
);

-- =======================================================================
-- 3. RFID_TAGS
-- =======================================================================
CREATE TABLE rfid_tags (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  uid TEXT UNIQUE NOT NULL,
  visitor_id TEXT REFERENCES visitors(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  registered_by TEXT,
  registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- =======================================================================
-- 4. MERCHANTS
-- =======================================================================
CREATE TABLE merchants (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  location TEXT NOT NULL,
  merchant_type TEXT NOT NULL DEFAULT 'regular' CHECK (merchant_type IN ('loket', 'regular')),
  owner_user_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =======================================================================
-- 5. TRANSACTIONS
-- =======================================================================
CREATE TABLE transactions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  rfid_uid TEXT NOT NULL,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('entry', 'payment')),
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  whatsapp_status TEXT DEFAULT 'not_applicable' CHECK (whatsapp_status IN ('not_applicable','pending','sent','failed')),
  CONSTRAINT amount_non_negative CHECK (amount >= 0)
);

-- =======================================================================
-- 6. AUDIT_LOG (Penting untuk audit trail 50+ merchant)
-- =======================================================================
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,          -- 'register_visitor', 'tap', 'reset_credit', dll
  actor_user_id TEXT,            -- User ID pelaksana
  merchant_id TEXT,
  target_id TEXT,                -- visitor_id atau transaction_id
  metadata JSONB,                -- Detail tambahan payload
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =======================================================================
-- INDEXES (Penting untuk efisiensi kueri skala besar)
-- =======================================================================
CREATE INDEX idx_transactions_merchant_id ON transactions(merchant_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX idx_transactions_rfid_uid ON transactions(rfid_uid);
CREATE INDEX idx_rfid_tags_uid ON rfid_tags(uid);
CREATE INDEX idx_visitors_name ON visitors(name);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_user_id);
CREATE INDEX idx_audit_log_merchant ON audit_log(merchant_id);

-- =======================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =======================================================================

-- Profile Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select profile to owner" 
  ON profiles FOR SELECT TO authenticated 
  USING (auth.uid() = id);

CREATE POLICY "Allow update profile to owner" 
  ON profiles FOR UPDATE TO authenticated 
  USING (auth.uid() = id);

CREATE POLICY "Allow read profiles to admin" 
  ON profiles FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Visitors Policies
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all visitors" 
  ON visitors FOR SELECT TO authenticated 
  USING (true);

CREATE POLICY "Loket merchant or admin can insert visitors" 
  ON visitors FOR INSERT TO authenticated 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND (role = 'admin' OR (role = 'merchant' AND merchant_type = 'loket'))
    )
  );

CREATE POLICY "Admin or Loket merchant can update visitors" 
  ON visitors FOR UPDATE TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND (role = 'admin' OR (role = 'merchant' AND merchant_type = 'loket'))
    )
  );

-- RFID Tags Policies
ALTER TABLE rfid_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read RFID Tags" 
  ON rfid_tags FOR SELECT TO authenticated 
  USING (true);

CREATE POLICY "Loket merchant or admin can register RFID Tags" 
  ON rfid_tags FOR INSERT TO authenticated 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND (role = 'admin' OR (role = 'merchant' AND merchant_type = 'loket'))
    )
  );

-- Merchants Policies
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read merchants" 
  ON merchants FOR SELECT TO authenticated 
  USING (true);

CREATE POLICY "Only Admin can write merchants" 
  ON merchants FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Transactions Policies
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read all, Merchant can read their own transactions" 
  ON transactions FOR SELECT TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND (role = 'admin' OR merchant_id = transactions.merchant_id)
    )
  );

CREATE POLICY "Merchant can log transaction matching their profile" 
  ON transactions FOR INSERT TO authenticated 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND (role = 'admin' OR merchant_id = transactions.merchant_id)
    )
  );

-- Audit Log Policies
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only Admin can view audit logs" 
  ON audit_log FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "System triggers can insert audit logs" 
  ON audit_log FOR INSERT TO authenticated 
  WITH CHECK (true);

-- =======================================================================
-- AUTOMATED TRIGGERS & FUNCTIONS
-- =======================================================================

-- Trigger 1: Auto Audit Log on Visitor Insertion
CREATE OR REPLACE FUNCTION trg_fn_after_visitor_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (action, actor_user_id, merchant_id, target_id, metadata)
  VALUES (
    'register_visitor',
    auth.uid()::text,
    (SELECT merchant_id FROM profiles WHERE id = auth.uid() LIMIT 1),
    NEW.id,
    jsonb_build_object(
      'name', NEW.name,
      'ticket_type', NEW.ticket_type,
      'credit_limit', NEW.credit_limit
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_after_visitor_insert
  AFTER INSERT ON visitors
  FOR EACH ROW EXECUTE FUNCTION trg_fn_after_visitor_insert();


-- Trigger 2: Auto Audit Log on Transaction Tap
CREATE OR REPLACE FUNCTION trg_fn_after_transaction_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (action, actor_user_id, merchant_id, target_id, metadata)
  VALUES (
    'tap',
    (SELECT id::text FROM profiles WHERE merchant_id = NEW.merchant_id LIMIT 1),
    NEW.merchant_id,
    NEW.id,
    jsonb_build_object(
      'rfid_uid', NEW.rfid_uid,
      'type', NEW.type,
      'amount', NEW.amount,
      'whatsapp_status', NEW.whatsapp_status
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_after_transaction_insert
  AFTER INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION trg_fn_after_transaction_insert();


-- Trigger 3: Otomatis sinkronisasi auth.users ke public.profiles saat signup baru
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, merchant_id, merchant_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'merchant'), -- Default role is merchant
    NEW.raw_user_meta_data->>'merchant_id',
    NEW.raw_user_meta_data->>'merchant_type'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =======================================================================
-- SEED DATA
-- =======================================================================

-- Seed Merchants
INSERT INTO merchants (id, name, category, location, merchant_type, is_active) VALUES
('m-lok1', 'Loket Utama Barat (Entry)', 'Loket/Gerbang', 'Gerbang Barat Area A', 'loket', true),
('m-adv1', 'Zipline Canopy Canopy', 'Adventure', 'Lembah Pinus Area B', 'regular', true),
('m-fb1', 'Warung Kopi Pinus', 'F&B', 'Puncak Pinus Area B', 'regular', true),
('m-ret1', 'EcoCraft Souvenir & Kaos', 'Retail', 'Plaza Belanja Utama', 'regular', true);

-- Seed Visitors
INSERT INTO visitors (id, name, phone, ticket_type, credit_limit, credit_used) VALUES
('v-1', 'Ahmad Faisal', '081234567890', 'VIP', 500000, 110000),
('v-2', 'Siti Rahmawati', '082345678901', 'Regular', 150000, 80000),
('v-3', 'Dewi Lestari', '083456789012', 'Family', 800000, 0),
('v-4', 'Budi Hartono', '084567890123', 'Group', 0, 120000);

-- Seed RFID Tags mapping
INSERT INTO rfid_tags (id, uid, visitor_id, is_active, registered_by) VALUES
('tag-1', 'E280113C200078AC', 'v-1', true, 'm-lok1'),
('tag-2', 'E280113C200078AD', 'v-2', true, 'm-lok1'),
('tag-3', 'E280113C200078AE', 'v-3', true, 'm-lok1'),
('tag-4', 'E280113C200078AF', 'v-4', true, 'm-lok1');

-- Seed Admin Profile (COMMENTS ONLY TO PREVENT FK ERROR)
-- Catatan: Supabase melarang data dimasukkan ke profiles sebelum user di auth.users dibuat.
-- Setelah melakukan registrasi/sign up admin baru di auth dashboard, jalankan query berikut:
--
-- INSERT INTO public.profiles (id, role, merchant_id, merchant_type)
-- VALUES ('UUID_USER_AUTH_ANDA', 'admin', null, null);


-- =======================================================================
-- 7. CREDIT TOPUPS (Top up history)
-- =======================================================================
CREATE TABLE credit_topups (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  visitor_id TEXT REFERENCES visitors(id) ON DELETE CASCADE,
  rfid_uid TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  top_up_by TEXT NOT NULL,  -- merchant_id atau 'admin'
  top_up_by_name TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_topups_visitor ON credit_topups(visitor_id);
CREATE INDEX idx_topups_created ON credit_topups(created_at DESC);

-- RLS for credit_topups
ALTER TABLE credit_topups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read all, Merchant can read their own topups" 
  ON credit_topups FOR SELECT TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND (role = 'admin' OR merchant_id = credit_topups.top_up_by)
    )
  );

CREATE POLICY "Admin or Merchant can log topup matching their profile" 
  ON credit_topups FOR INSERT TO authenticated 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
        AND (role = 'admin' OR merchant_id = credit_topups.top_up_by)
    )
  );
