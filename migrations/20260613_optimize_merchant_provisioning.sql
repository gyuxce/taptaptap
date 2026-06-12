-- Combines merchant insert, profile update, and audit logging in one transaction.
CREATE OR REPLACE FUNCTION public.finalize_merchant_provisioning(
  p_user_id UUID,
  p_actor_user_id UUID,
  p_name TEXT,
  p_category TEXT,
  p_location TEXT,
  p_merchant_type TEXT,
  p_phone TEXT,
  p_owner_email TEXT
)
RETURNS SETOF public.merchants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant public.merchants%ROWTYPE;
BEGIN
  IF p_merchant_type NOT IN ('loket', 'regular') THEN
    RAISE EXCEPTION 'INVALID_MERCHANT_TYPE';
  END IF;

  INSERT INTO public.merchants (
    name, category, location, merchant_type, owner_user_id, phone, is_active
  )
  VALUES (
    p_name, p_category, p_location, p_merchant_type, p_user_id::text, p_phone, TRUE
  )
  RETURNING * INTO v_merchant;

  INSERT INTO public.profiles (id, role, merchant_id, merchant_type)
  VALUES (p_user_id, 'merchant', v_merchant.id, p_merchant_type)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    merchant_id = EXCLUDED.merchant_id,
    merchant_type = EXCLUDED.merchant_type;

  INSERT INTO public.audit_log (action, actor_user_id, merchant_id, target_id, metadata)
  VALUES (
    'create_merchant',
    p_actor_user_id::text,
    v_merchant.id,
    v_merchant.id,
    jsonb_build_object(
      'name', p_name,
      'category', p_category,
      'location', p_location,
      'phone', p_phone,
      'owner_email', p_owner_email
    )
  );

  RETURN NEXT v_merchant;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_merchant_provisioning(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_merchant_provisioning(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

NOTIFY pgrst, 'reload schema';
