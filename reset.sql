-- WAVR database reset
-- WARNING: This permanently deletes all WAVR data in the public schema.
-- Supabase Auth users are intentionally not deleted.

BEGIN;

-- This trigger lives in the protected auth schema, so remove it before
-- dropping the public function it calls.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- CASCADE also removes table policies, indexes, foreign keys, and triggers.
DROP TABLE IF EXISTS public.credit_topups CASCADE;
DROP TABLE IF EXISTS public.rate_limit_buckets CASCADE;
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.rfid_tags CASCADE;
DROP TABLE IF EXISTS public.merchants CASCADE;
DROP TABLE IF EXISTS public.visitors CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP FUNCTION IF EXISTS public.process_tap(TEXT, TEXT, TEXT, NUMERIC, UUID, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS public.process_topup(TEXT, NUMERIC, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.consume_rate_limit(TEXT, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.current_app_role() CASCADE;
DROP FUNCTION IF EXISTS public.current_merchant_id() CASCADE;
DROP FUNCTION IF EXISTS public.current_merchant_type() CASCADE;
DROP FUNCTION IF EXISTS public.trg_fn_after_visitor_insert() CASCADE;
DROP FUNCTION IF EXISTS public.trg_fn_after_transaction_insert() CASCADE;
DROP FUNCTION IF EXISTS public.trg_fn_audit_visitor_update() CASCADE;
DROP FUNCTION IF EXISTS public.trg_fn_audit_tag_update() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

COMMIT;
