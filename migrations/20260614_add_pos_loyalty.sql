-- WAVR POS and loyalty trial migration.
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS loyalty_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS loyalty_target INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS loyalty_reward TEXT NOT NULL DEFAULT '1x Gratis';

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'tap',
  ADD COLUMN IF NOT EXISTS order_id TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT;

CREATE TABLE IF NOT EXISTS public.menu_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  merchant_id TEXT NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL CHECK (price >= 0),
  category TEXT NOT NULL DEFAULT 'Makanan',
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  merchant_id TEXT NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
  rfid_uid TEXT NOT NULL,
  visitor_id TEXT NOT NULL REFERENCES public.visitors(id) ON DELETE RESTRICT,
  visitor_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','cancelled','refunded')),
  total_amount NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  transaction_id TEXT REFERENCES public.transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id TEXT REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  subtotal NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loyalty_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  merchant_id TEXT NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL REFERENCES public.visitors(id) ON DELETE CASCADE,
  rfid_uid TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('stamp','reward')),
  transaction_id TEXT REFERENCES public.transactions(id) ON DELETE SET NULL,
  order_id TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
  reward_label TEXT,
  stamp_date DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_open
  ON public.orders(merchant_id, rfid_uid) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_orders_merchant_status ON public.orders(merchant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_menu_merchant ON public.menu_items(merchant_id,is_available,sort_order);
CREATE INDEX IF NOT EXISTS idx_loyalty_visitor ON public.loyalty_events(merchant_id,visitor_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_daily_stamp
  ON public.loyalty_events(merchant_id,visitor_id,stamp_date) WHERE event_type = 'stamp';

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu read" ON public.menu_items FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "menu manage" ON public.menu_items FOR ALL TO authenticated
  USING (current_app_role() = 'admin' OR merchant_id = current_merchant_id())
  WITH CHECK (current_app_role() = 'admin' OR merchant_id = current_merchant_id());
CREATE POLICY "orders read" ON public.orders FOR SELECT TO authenticated
  USING (current_app_role() = 'admin' OR merchant_id = current_merchant_id());
CREATE POLICY "orders create" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (current_app_role() = 'admin' OR merchant_id = current_merchant_id());
CREATE POLICY "orders update" ON public.orders FOR UPDATE TO authenticated
  USING (current_app_role() = 'admin' OR merchant_id = current_merchant_id());
CREATE POLICY "items read" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND (current_app_role() = 'admin' OR o.merchant_id = current_merchant_id())
  ));
CREATE POLICY "items create" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.status = 'open'
      AND (current_app_role() = 'admin' OR o.merchant_id = current_merchant_id())
  ));
CREATE POLICY "items delete" ON public.order_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.status = 'open'
      AND (current_app_role() = 'admin' OR o.merchant_id = current_merchant_id())
  ));
CREATE POLICY "loyalty read" ON public.loyalty_events FOR SELECT TO authenticated
  USING (current_app_role() = 'admin' OR merchant_id = current_merchant_id());

CREATE OR REPLACE FUNCTION public.sync_pos_refund()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF OLD.refunded_at IS NULL AND NEW.refunded_at IS NOT NULL THEN
    IF NEW.order_id IS NOT NULL THEN
      UPDATE orders SET status='refunded',updated_at=now() WHERE id=NEW.order_id;
    END IF;
    DELETE FROM loyalty_events WHERE transaction_id=NEW.id AND event_type='stamp';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_pos_refund ON public.transactions;
CREATE TRIGGER trg_sync_pos_refund AFTER UPDATE OF refunded_at ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_pos_refund();

CREATE OR REPLACE FUNCTION public.get_loyalty_info(p_rfid_uid TEXT,p_merchant_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p profiles%ROWTYPE; m merchants%ROWTYPE; t rfid_tags%ROWTYPE; stamps INTEGER; rewards INTEGER; available INTEGER;
BEGIN
  SELECT * INTO p FROM profiles WHERE id=auth.uid();
  IF p.id IS NULL OR (p.role<>'admin' AND p.merchant_id<>p_merchant_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO m FROM merchants WHERE id = p_merchant_id;
  SELECT * INTO t FROM rfid_tags WHERE uid = upper(regexp_replace(p_rfid_uid,'[^0-9A-Fa-f]','','g'));
  IF m.id IS NULL OR t.id IS NULL THEN RAISE EXCEPTION 'LOYALTY_LOOKUP_FAILED'; END IF;
  SELECT count(*) FILTER (WHERE event_type='stamp'),count(*) FILTER (WHERE event_type='reward')
    INTO stamps,rewards FROM loyalty_events
    WHERE merchant_id=p_merchant_id AND visitor_id=t.visitor_id;
  available := greatest(0,(stamps/m.loyalty_target)-rewards);
  RETURN jsonb_build_object(
    'enabled',m.loyalty_enabled,'target',m.loyalty_target,'reward',m.loyalty_reward,
    'stamp_count',stamps,'cycle_progress',stamps%m.loyalty_target,
    'available_rewards',available,
    'remaining',CASE WHEN available>0 THEN 0 ELSE m.loyalty_target-(stamps%m.loyalty_target) END
  );
END $$;

CREATE OR REPLACE FUNCTION public.redeem_loyalty_reward(p_rfid_uid TEXT,p_merchant_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p profiles%ROWTYPE; m merchants%ROWTYPE; t rfid_tags%ROWTYPE;
  stamps INTEGER; rewards INTEGER; e loyalty_events%ROWTYPE; tx transactions%ROWTYPE;
BEGIN
  SELECT * INTO p FROM profiles WHERE id=auth.uid();
  IF p.id IS NULL OR (p.role<>'admin' AND p.merchant_id<>p_merchant_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO m FROM merchants WHERE id=p_merchant_id AND loyalty_enabled=TRUE;
  SELECT * INTO t FROM rfid_tags WHERE uid=upper(regexp_replace(p_rfid_uid,'[^0-9A-Fa-f]','','g')) FOR UPDATE;
  SELECT count(*) FILTER (WHERE event_type='stamp'),count(*) FILTER (WHERE event_type='reward')
    INTO stamps,rewards FROM loyalty_events WHERE merchant_id=p_merchant_id AND visitor_id=t.visitor_id;
  IF m.id IS NULL OR t.id IS NULL OR (stamps/m.loyalty_target)-rewards<=0 THEN
    RAISE EXCEPTION 'REWARD_NOT_READY';
  END IF;
  INSERT INTO transactions(rfid_uid,merchant_id,type,amount,whatsapp_status,source,note)
    VALUES(t.uid,p_merchant_id,'payment',0,'not_applicable','reward',m.loyalty_reward) RETURNING * INTO tx;
  INSERT INTO loyalty_events(merchant_id,visitor_id,rfid_uid,event_type,transaction_id,reward_label,created_by)
    VALUES(p_merchant_id,t.visitor_id,t.uid,'reward',tx.id,m.loyalty_reward,auth.uid()::text) RETURNING * INTO e;
  INSERT INTO audit_log(action,actor_user_id,merchant_id,target_id,metadata)
    VALUES('redeem_loyalty_reward',auth.uid()::text,p_merchant_id,e.id,
      jsonb_build_object('visitor_id',t.visitor_id,'reward',m.loyalty_reward));
  RETURN jsonb_build_object('event',to_jsonb(e),'transaction',to_jsonb(tx),'reward',m.loyalty_reward);
END $$;

CREATE OR REPLACE FUNCTION public.award_loyalty_stamp(
  p_transaction_id TEXT,p_rfid_uid TEXT,p_merchant_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p profiles%ROWTYPE; m merchants%ROWTYPE; t rfid_tags%ROWTYPE; tx transactions%ROWTYPE;
BEGIN
  SELECT * INTO p FROM profiles WHERE id=auth.uid();
  IF p.id IS NULL OR (p.role<>'admin' AND p.merchant_id<>p_merchant_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO m FROM merchants WHERE id=p_merchant_id;
  IF NOT coalesce(m.loyalty_enabled,FALSE) THEN RETURN get_loyalty_info(p_rfid_uid,p_merchant_id); END IF;
  SELECT * INTO tx FROM transactions WHERE id=p_transaction_id
    AND merchant_id=p_merchant_id AND type='payment' AND refunded_at IS NULL;
  SELECT * INTO t FROM rfid_tags WHERE uid=upper(regexp_replace(p_rfid_uid,'[^0-9A-Fa-f]','','g'));
  IF tx.id IS NULL OR t.id IS NULL THEN RAISE EXCEPTION 'INVALID_STAMP_SOURCE'; END IF;
  INSERT INTO loyalty_events(merchant_id,visitor_id,rfid_uid,event_type,transaction_id,stamp_date,created_by)
    VALUES(p_merchant_id,t.visitor_id,t.uid,'stamp',tx.id,
      (now() AT TIME ZONE 'Asia/Jakarta')::date,auth.uid()::text)
    ON CONFLICT DO NOTHING;
  RETURN get_loyalty_info(t.uid,p_merchant_id);
END $$;

CREATE OR REPLACE FUNCTION public.process_tap(
  p_rfid_uid TEXT,p_merchant_id TEXT,p_type TEXT,p_amount NUMERIC,
  p_idempotency_key UUID,p_allow_rapid_repeat BOOLEAN DEFAULT FALSE
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  p profiles%ROWTYPE; m merchants%ROWTYPE; t rfid_tags%ROWTYPE; v visitors%ROWTYPE;
  tx transactions%ROWTYPE; existing transactions%ROWTYPE; wa TEXT; loyalty JSONB;
BEGIN
  IF p_type NOT IN ('entry','payment') OR p_amount<0 THEN RAISE EXCEPTION 'INVALID_TRANSACTION'; END IF;
  SELECT * INTO p FROM profiles WHERE id=auth.uid();
  IF p.id IS NULL OR (p.role<>'admin' AND (p.role<>'merchant' OR p.merchant_id<>p_merchant_id)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT * INTO m FROM merchants WHERE id=p_merchant_id AND is_active=TRUE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'MERCHANT_INACTIVE'; END IF;
  IF (m.merchant_type='loket' AND (p_type<>'entry' OR p_amount<>0))
    OR (m.merchant_type='regular' AND (p_type<>'payment' OR p_amount<=0)) THEN
    RAISE EXCEPTION 'INVALID_MERCHANT_TRANSACTION';
  END IF;
  SELECT * INTO existing FROM transactions WHERE idempotency_key=p_idempotency_key;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('transaction',to_jsonb(existing),'duplicate',TRUE);
  END IF;
  SELECT * INTO t FROM rfid_tags
    WHERE uid=upper(regexp_replace(p_rfid_uid,'[^0-9A-Fa-f]','','g')) FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'TAG_NOT_FOUND'; END IF;
  IF NOT t.is_active THEN RAISE EXCEPTION 'TAG_INACTIVE'; END IF;
  SELECT * INTO v FROM visitors WHERE id=t.visitor_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'VISITOR_NOT_FOUND'; END IF;
  IF NOT p_allow_rapid_repeat AND EXISTS(
    SELECT 1 FROM transactions WHERE merchant_id=p_merchant_id AND rfid_uid=t.uid
      AND created_at>=now()-interval '3 seconds'
  ) THEN RAISE EXCEPTION 'DOUBLE_TAP'; END IF;
  IF p_amount>0 AND v.credit_limit>0 AND v.credit_used+p_amount>v.credit_limit THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDIT';
  END IF;
  IF p_amount>0 THEN
    UPDATE visitors SET credit_used=credit_used+p_amount WHERE id=v.id RETURNING * INTO v;
  END IF;
  wa:=CASE WHEN p_amount>0 AND v.phone IS NOT NULL THEN 'pending' ELSE 'not_applicable' END;
  INSERT INTO transactions(idempotency_key,rfid_uid,merchant_id,type,amount,whatsapp_status,source)
    VALUES(p_idempotency_key,t.uid,p_merchant_id,p_type,p_amount,wa,'tap') RETURNING * INTO tx;
  IF p_type='payment' AND m.loyalty_enabled THEN
    INSERT INTO loyalty_events(merchant_id,visitor_id,rfid_uid,event_type,transaction_id,stamp_date,created_by)
      VALUES(p_merchant_id,v.id,t.uid,'stamp',tx.id,
        (now() AT TIME ZONE 'Asia/Jakarta')::date,auth.uid()::text)
      ON CONFLICT DO NOTHING;
    loyalty:=get_loyalty_info(t.uid,p_merchant_id);
  END IF;
  RETURN jsonb_build_object(
    'transaction',to_jsonb(tx),'duplicate',FALSE,'loyalty',loyalty,
    'visitor',jsonb_build_object('id',v.id,'name',v.name,'phone',v.phone,
      'credit_limit',v.credit_limit,'credit_used',v.credit_used)
  );
END $$;

CREATE OR REPLACE FUNCTION public.process_pos_order(
  p_order_id TEXT,p_merchant_id TEXT,p_rfid_uid TEXT,p_items JSONB,p_note TEXT,p_idempotency_key UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p profiles%ROWTYPE; m merchants%ROWTYPE; t rfid_tags%ROWTYPE; v visitors%ROWTYPE;
  o orders%ROWTYPE; tx transactions%ROWTYPE; existing transactions%ROWTYPE;
  item JSONB; menu menu_items%ROWTYPE; qty INTEGER; total NUMERIC:=0; wa TEXT;
BEGIN
  SELECT * INTO p FROM profiles WHERE id=auth.uid();
  IF p.role<>'admin' AND p.merchant_id<>p_merchant_id THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO m FROM merchants WHERE id=p_merchant_id AND is_active=TRUE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'MERCHANT_INACTIVE'; END IF;
  SELECT * INTO existing FROM transactions WHERE idempotency_key=p_idempotency_key;
  IF existing.id IS NOT NULL THEN RETURN jsonb_build_object('transaction',to_jsonb(existing),'duplicate',TRUE); END IF;
  SELECT * INTO t FROM rfid_tags
    WHERE uid=upper(regexp_replace(p_rfid_uid,'[^0-9A-Fa-f]','','g')) AND is_active=TRUE FOR UPDATE;
  SELECT * INTO v FROM visitors WHERE id=t.visitor_id FOR UPDATE;
  IF t.id IS NULL OR v.id IS NULL THEN RAISE EXCEPTION 'VISITOR_NOT_FOUND'; END IF;
  IF jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'EMPTY_ORDER'; END IF;
  INSERT INTO orders(id,merchant_id,rfid_uid,visitor_id,visitor_name,status,note)
    VALUES(p_order_id,p_merchant_id,t.uid,v.id,v.name,'open',nullif(trim(p_note),''))
    ON CONFLICT(id) DO UPDATE SET note=excluded.note,updated_at=now() RETURNING * INTO o;
  IF o.status<>'open' OR o.merchant_id<>p_merchant_id OR o.rfid_uid<>t.uid THEN
    RAISE EXCEPTION 'ORDER_MISMATCH';
  END IF;
  DELETE FROM order_items WHERE order_id=o.id;
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    qty:=greatest(1,least(99,(item->>'quantity')::INTEGER));
    SELECT * INTO menu FROM menu_items WHERE id=item->>'menu_item_id'
      AND merchant_id=p_merchant_id AND is_available=TRUE;
    IF menu.id IS NULL THEN RAISE EXCEPTION 'MENU_ITEM_UNAVAILABLE'; END IF;
    INSERT INTO order_items(order_id,menu_item_id,name,price,quantity,subtotal)
      VALUES(o.id,menu.id,menu.name,menu.price,qty,menu.price*qty);
    total:=total+(menu.price*qty);
  END LOOP;
  IF total<=0 THEN RAISE EXCEPTION 'INVALID_ORDER_TOTAL'; END IF;
  IF v.credit_limit>0 AND v.credit_used+total>v.credit_limit THEN RAISE EXCEPTION 'INSUFFICIENT_CREDIT'; END IF;
  UPDATE visitors SET credit_used=credit_used+total WHERE id=v.id RETURNING * INTO v;
  wa:=CASE WHEN v.phone IS NULL THEN 'not_applicable' ELSE 'pending' END;
  INSERT INTO transactions(idempotency_key,rfid_uid,merchant_id,type,amount,whatsapp_status,source,order_id,note)
    VALUES(p_idempotency_key,t.uid,p_merchant_id,'payment',total,wa,'pos',o.id,
      'POS - '||jsonb_array_length(p_items)||' menu') RETURNING * INTO tx;
  UPDATE orders SET status='paid',total_amount=total,transaction_id=tx.id,paid_at=now(),updated_at=now()
    WHERE id=o.id RETURNING * INTO o;
  IF m.loyalty_enabled THEN
    INSERT INTO loyalty_events(merchant_id,visitor_id,rfid_uid,event_type,transaction_id,order_id,stamp_date,created_by)
      VALUES(p_merchant_id,v.id,t.uid,'stamp',tx.id,o.id,(now() AT TIME ZONE 'Asia/Jakarta')::date,auth.uid()::text)
      ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO audit_log(action,actor_user_id,merchant_id,target_id,metadata)
    VALUES('pos_order_paid',auth.uid()::text,p_merchant_id,o.id,
      jsonb_build_object('transaction_id',tx.id,'amount',total,'visitor_id',v.id));
  RETURN jsonb_build_object('order',to_jsonb(o),'transaction',to_jsonb(tx),
    'visitor',jsonb_build_object('id',v.id,'name',v.name,'phone',v.phone,
      'credit_limit',v.credit_limit,'credit_used',v.credit_used),
    'loyalty',get_loyalty_info(t.uid,p_merchant_id),'duplicate',FALSE);
END $$;

REVOKE ALL ON FUNCTION public.get_loyalty_info(TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_loyalty_reward(TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_pos_order(TEXT,TEXT,TEXT,JSONB,TEXT,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_loyalty_stamp(TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_loyalty_info(TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_loyalty_reward(TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_pos_order(TEXT,TEXT,TEXT,JSONB,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_loyalty_stamp(TEXT,TEXT,TEXT) TO authenticated;
NOTIFY pgrst,'reload schema';
