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
  phone TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT merchant_phone_format CHECK (
    phone IS NULL OR phone ~ '^(08|\+62)[0-9]{8,11}$'
  )
);

-- =======================================================================
-- 5. TRANSACTIONS
-- =======================================================================
CREATE TABLE transactions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  idempotency_key UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
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

CREATE TABLE rate_limit_buckets (
  key_hash TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =======================================================================
-- INDEXES (Penting untuk efisiensi kueri skala besar)
-- =======================================================================
CREATE INDEX idx_transactions_merchant_id ON transactions(merchant_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX idx_transactions_rfid_uid ON transactions(rfid_uid);
CREATE INDEX idx_transactions_rapid_tap ON transactions(merchant_id, rfid_uid, created_at DESC);
CREATE INDEX idx_rfid_tags_uid ON rfid_tags(uid);
CREATE INDEX idx_visitors_name ON visitors(name);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_user_id);
CREATE INDEX idx_audit_log_merchant ON audit_log(merchant_id);
CREATE INDEX idx_rate_limit_updated_at ON rate_limit_buckets(updated_at);

-- =======================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =======================================================================

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT role FROM profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.current_merchant_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT merchant_id FROM profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.current_merchant_type()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT merchant_type FROM profiles WHERE id = auth.uid() $$;

REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_merchant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_merchant_type() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_merchant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_merchant_type() TO authenticated;

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
  USING (current_app_role() = 'admin');

-- Visitors Policies
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all visitors" 
  ON visitors FOR SELECT TO authenticated 
  USING (true);

CREATE POLICY "Loket merchant or admin can insert visitors" 
  ON visitors FOR INSERT TO authenticated 
  WITH CHECK (
    current_app_role() = 'admin'
    OR (current_app_role() = 'merchant' AND current_merchant_type() = 'loket')
  );

CREATE POLICY "Admin or Loket merchant can update visitors" 
  ON visitors FOR UPDATE TO authenticated 
  USING (
    current_app_role() = 'admin'
    OR (current_app_role() = 'merchant' AND current_merchant_type() = 'loket')
  );

CREATE POLICY "Admin or Loket merchant can delete visitors"
  ON visitors FOR DELETE TO authenticated
  USING (
    current_app_role() = 'admin'
    OR (current_app_role() = 'merchant' AND current_merchant_type() = 'loket')
  );

-- RFID Tags Policies
ALTER TABLE rfid_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read RFID Tags" 
  ON rfid_tags FOR SELECT TO authenticated 
  USING (true);

CREATE POLICY "Loket merchant or admin can register RFID Tags" 
  ON rfid_tags FOR INSERT TO authenticated 
  WITH CHECK (
    current_app_role() = 'admin'
    OR (current_app_role() = 'merchant' AND current_merchant_type() = 'loket')
  );

CREATE POLICY "Loket merchant or admin can update RFID Tags"
  ON rfid_tags FOR UPDATE TO authenticated
  USING (
    current_app_role() = 'admin'
    OR (current_app_role() = 'merchant' AND current_merchant_type() = 'loket')
  )
  WITH CHECK (
    current_app_role() = 'admin'
    OR (current_app_role() = 'merchant' AND current_merchant_type() = 'loket')
  );

-- Merchants Policies
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read merchants" 
  ON merchants FOR SELECT TO authenticated 
  USING (true);

CREATE POLICY "Only Admin can write merchants" 
  ON merchants FOR ALL TO authenticated 
  USING (current_app_role() = 'admin')
  WITH CHECK (current_app_role() = 'admin');

-- Transactions Policies
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read all, Merchant can read their own transactions" 
  ON transactions FOR SELECT TO authenticated 
  USING (
    current_app_role() = 'admin'
    OR current_merchant_id() = transactions.merchant_id
  );

CREATE POLICY "Merchant can log transaction matching their profile" 
  ON transactions FOR INSERT TO authenticated 
  WITH CHECK (
    current_app_role() = 'admin'
    OR current_merchant_id() = transactions.merchant_id
  );

-- Audit Log Policies
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only Admin can view audit logs" 
  ON audit_log FOR SELECT TO authenticated 
  USING (current_app_role() = 'admin');

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
    auth.uid()::text,
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

CREATE OR REPLACE FUNCTION trg_fn_audit_visitor_update()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (action, actor_user_id, target_id, metadata)
  VALUES (
    'update_visitor',
    auth.uid()::text,
    NEW.id,
    jsonb_build_object(
      'before', to_jsonb(OLD) - 'photo_url',
      'after', to_jsonb(NEW) - 'photo_url'
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_audit_visitor_update
  AFTER UPDATE ON visitors
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION trg_fn_audit_visitor_update();

CREATE OR REPLACE FUNCTION trg_fn_audit_tag_update()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (action, actor_user_id, target_id, metadata)
  VALUES (
    'toggle_tag',
    auth.uid()::text,
    NEW.id,
    jsonb_build_object('uid', NEW.uid, 'is_active_before', OLD.is_active, 'is_active_after', NEW.is_active)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_audit_tag_update
  AFTER UPDATE OF is_active ON rfid_tags
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION trg_fn_audit_tag_update();


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
    current_app_role() = 'admin'
    OR current_merchant_id() = credit_topups.top_up_by
  );

CREATE POLICY "Admin or Merchant can log topup matching their profile" 
  ON credit_topups FOR INSERT TO authenticated 
  WITH CHECK (
    current_app_role() = 'admin'
    OR current_merchant_id() = credit_topups.top_up_by
  );

-- =======================================================================
-- ATOMIC MONEY OPERATIONS
-- All balance changes and their ledger rows are committed together.
-- =======================================================================

CREATE OR REPLACE FUNCTION public.process_tap(
  p_rfid_uid TEXT,
  p_merchant_id TEXT,
  p_type TEXT,
  p_amount NUMERIC,
  p_idempotency_key UUID,
  p_allow_rapid_repeat BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_merchant merchants%ROWTYPE;
  v_tag rfid_tags%ROWTYPE;
  v_visitor visitors%ROWTYPE;
  v_transaction transactions%ROWTYPE;
  v_existing transactions%ROWTYPE;
  v_whatsapp_status TEXT;
BEGIN
  IF p_type NOT IN ('entry', 'payment') OR p_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_TRANSACTION';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR (
    v_profile.role <> 'admin'
    AND (v_profile.role <> 'merchant' OR v_profile.merchant_id <> p_merchant_id)
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_merchant FROM merchants
  WHERE id = p_merchant_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MERCHANT_INACTIVE';
  END IF;

  IF (v_merchant.merchant_type = 'loket' AND (p_type <> 'entry' OR p_amount <> 0))
    OR (v_merchant.merchant_type = 'regular' AND (p_type <> 'payment' OR p_amount <= 0)) THEN
    RAISE EXCEPTION 'INVALID_MERCHANT_TRANSACTION';
  END IF;

  SELECT * INTO v_existing FROM transactions
  WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'transaction', to_jsonb(v_existing),
      'duplicate', TRUE
    );
  END IF;

  SELECT t.* INTO v_tag
  FROM rfid_tags t
  WHERE t.uid = upper(regexp_replace(p_rfid_uid, '[^0-9A-Fa-f]', '', 'g'))
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TAG_NOT_FOUND';
  END IF;
  IF NOT v_tag.is_active THEN
    RAISE EXCEPTION 'TAG_INACTIVE';
  END IF;

  SELECT * INTO v_visitor FROM visitors
  WHERE id = v_tag.visitor_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISITOR_NOT_FOUND';
  END IF;

  IF NOT p_allow_rapid_repeat AND EXISTS (
    SELECT 1 FROM transactions
    WHERE merchant_id = p_merchant_id
      AND rfid_uid = v_tag.uid
      AND created_at >= NOW() - INTERVAL '3 seconds'
  ) THEN
    RAISE EXCEPTION 'DOUBLE_TAP';
  END IF;

  IF p_amount > 0
    AND v_visitor.credit_limit > 0
    AND v_visitor.credit_used + p_amount > v_visitor.credit_limit THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDIT';
  END IF;

  IF p_amount > 0 THEN
    UPDATE visitors
    SET credit_used = credit_used + p_amount
    WHERE id = v_visitor.id
    RETURNING * INTO v_visitor;
  END IF;

  v_whatsapp_status := CASE
    WHEN p_amount > 0 AND v_visitor.phone IS NOT NULL THEN 'pending'
    ELSE 'not_applicable'
  END;

  INSERT INTO transactions (
    idempotency_key,
    rfid_uid,
    merchant_id,
    type,
    amount,
    whatsapp_status
  )
  VALUES (
    p_idempotency_key,
    v_tag.uid,
    p_merchant_id,
    p_type,
    p_amount,
    v_whatsapp_status
  )
  RETURNING * INTO v_transaction;

  RETURN jsonb_build_object(
    'transaction', to_jsonb(v_transaction),
    'duplicate', FALSE,
    'visitor', jsonb_build_object(
      'id', v_visitor.id,
      'name', v_visitor.name,
      'phone', v_visitor.phone,
      'credit_limit', v_visitor.credit_limit,
      'credit_used', v_visitor.credit_used
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_topup(
  p_rfid_uid TEXT,
  p_amount NUMERIC,
  p_merchant_id TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_tag rfid_tags%ROWTYPE;
  v_visitor visitors%ROWTYPE;
  v_topup credit_topups%ROWTYPE;
BEGIN
  IF p_amount <= 0 OR p_amount > 5000000 THEN
    RAISE EXCEPTION 'INVALID_TOPUP_AMOUNT';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR (
    v_profile.role <> 'admin'
    AND (
      v_profile.role <> 'merchant'
      OR v_profile.merchant_type <> 'loket'
      OR v_profile.merchant_id <> p_merchant_id
    )
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_tag FROM rfid_tags
  WHERE uid = upper(regexp_replace(p_rfid_uid, '[^0-9A-Fa-f]', '', 'g'))
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TAG_NOT_FOUND';
  END IF;
  IF NOT v_tag.is_active THEN
    RAISE EXCEPTION 'TAG_INACTIVE';
  END IF;

  UPDATE visitors
  SET credit_limit = credit_limit + p_amount
  WHERE id = v_tag.visitor_id
  RETURNING * INTO v_visitor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISITOR_NOT_FOUND';
  END IF;

  INSERT INTO credit_topups (
    visitor_id,
    rfid_uid,
    amount,
    top_up_by,
    top_up_by_name,
    note
  )
  VALUES (
    v_visitor.id,
    v_tag.uid,
    p_amount,
    p_merchant_id,
    CASE WHEN v_profile.role = 'admin' THEN 'Administrator' ELSE 'Merchant' END,
    NULLIF(trim(p_note), '')
  )
  RETURNING * INTO v_topup;

  INSERT INTO audit_log (action, actor_user_id, merchant_id, target_id, metadata)
  VALUES (
    'topup_credit',
    auth.uid()::text,
    p_merchant_id,
    v_visitor.id,
    jsonb_build_object(
      'topup_id', v_topup.id,
      'amount', p_amount,
      'rfid_uid', v_tag.uid,
      'note', NULLIF(trim(p_note), '')
    )
  );

  RETURN jsonb_build_object(
    'topup', to_jsonb(v_topup),
    'new_credit_limit', v_visitor.credit_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_tap(TEXT, TEXT, TEXT, NUMERIC, UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_topup(TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_tap(TEXT, TEXT, TEXT, NUMERIC, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_topup(TEXT, NUMERIC, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key_hash TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket rate_limit_buckets%ROWTYPE;
BEGIN
  IF p_limit <= 0 OR p_window_seconds <= 0 OR length(p_key_hash) < 16 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT';
  END IF;

  INSERT INTO rate_limit_buckets (key_hash, request_count)
  VALUES (p_key_hash, 0)
  ON CONFLICT (key_hash) DO NOTHING;

  SELECT * INTO v_bucket
  FROM rate_limit_buckets
  WHERE key_hash = p_key_hash
  FOR UPDATE;

  IF v_bucket.window_started_at <= NOW() - make_interval(secs => p_window_seconds) THEN
    UPDATE rate_limit_buckets
    SET request_count = 1, window_started_at = NOW(), updated_at = NOW()
    WHERE key_hash = p_key_hash;
    RETURN TRUE;
  END IF;

  IF v_bucket.request_count >= p_limit THEN
    RETURN FALSE;
  END IF;

  UPDATE rate_limit_buckets
  SET request_count = request_count + 1, updated_at = NOW()
  WHERE key_hash = p_key_hash;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
