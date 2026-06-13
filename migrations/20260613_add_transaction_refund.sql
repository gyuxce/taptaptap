ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS refunded_by TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_refunded_at
  ON public.transactions(refunded_at);

UPDATE public.transactions
SET whatsapp_status = 'failed'
WHERE whatsapp_status = 'pending'
  AND created_at < now() - interval '10 minutes';

CREATE OR REPLACE FUNCTION public.refund_transaction(
  p_transaction_id TEXT,
  p_actor_user_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction transactions%ROWTYPE;
  v_tag rfid_tags%ROWTYPE;
  v_visitor visitors%ROWTYPE;
BEGIN
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'TRANSACTION_NOT_FOUND'; END IF;
  IF v_transaction.type <> 'payment' OR v_transaction.amount <= 0 THEN
    RAISE EXCEPTION 'NOT_REFUNDABLE';
  END IF;
  IF v_transaction.refunded_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_REFUNDED';
  END IF;
  IF length(trim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'REFUND_REASON_REQUIRED';
  END IF;

  SELECT * INTO v_tag FROM rfid_tags
  WHERE uid = v_transaction.rfid_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'TAG_NOT_FOUND'; END IF;

  SELECT * INTO v_visitor FROM visitors
  WHERE id = v_tag.visitor_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'VISITOR_NOT_FOUND'; END IF;

  UPDATE visitors
  SET credit_used = greatest(0, credit_used - v_transaction.amount)
  WHERE id = v_visitor.id
  RETURNING * INTO v_visitor;

  UPDATE transactions
  SET refunded_at = now(),
      refund_reason = trim(p_reason),
      refunded_by = p_actor_user_id::text
  WHERE id = p_transaction_id
  RETURNING * INTO v_transaction;

  INSERT INTO audit_log(action, actor_user_id, merchant_id, target_id, metadata)
  VALUES (
    'refund_transaction',
    p_actor_user_id::text,
    v_transaction.merchant_id,
    v_transaction.id,
    jsonb_build_object(
      'amount', v_transaction.amount,
      'reason', v_transaction.refund_reason,
      'rfid_uid', v_transaction.rfid_uid,
      'visitor_id', v_visitor.id,
      'credit_used_after', v_visitor.credit_used
    )
  );

  RETURN jsonb_build_object(
    'transaction', to_jsonb(v_transaction),
    'visitor_credit_used', v_visitor.credit_used
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_transaction(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_transaction(TEXT, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
