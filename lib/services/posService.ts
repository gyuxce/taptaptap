import { supabase } from '@/lib/supabase';
import type { LoyaltyInfo, MenuItem, PosOrder, Transaction, Visitor } from '@/types';

export interface PosCartItem extends MenuItem {
  quantity: number;
}

export async function fetchMerchantMenu(merchantId: string, includeUnavailable = false) {
  let query = supabase.from('menu_items').select('*').eq('merchant_id', merchantId);
  if (!includeUnavailable) query = query.eq('is_available', true);
  const { data, error } = await query.order('category').order('sort_order').order('name');
  if (error) throw error;
  return (data || []).map(item => ({ ...item, price: Number(item.price) })) as MenuItem[];
}

export async function saveMenuItem(item: Omit<MenuItem, 'id' | 'created_at'> & { id?: string }) {
  const payload = { ...item, price: Number(item.price) };
  const query = item.id
    ? supabase.from('menu_items').update(payload).eq('id', item.id)
    : supabase.from('menu_items').insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function deleteMenuItem(id: string) {
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) throw error;
}

export async function findOpenOrder(merchantId: string, rfidUid: string): Promise<PosOrder | null> {
  const { data, error } = await supabase.from('orders').select('*')
    .eq('merchant_id', merchantId).eq('rfid_uid', rfidUid).eq('status', 'open')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? { ...data, total_amount: Number(data.total_amount) } as PosOrder : null;
}

export async function getOrCreateOpenOrder(input: {
  merchantId: string;
  rfidUid: string;
  visitor: Visitor;
}): Promise<{ order: PosOrder; resumed: boolean }> {
  const existing = await findOpenOrder(input.merchantId, input.rfidUid);
  if (existing) return { order: existing, resumed: true };
  const { data, error } = await supabase.from('orders').insert({
    merchant_id: input.merchantId,
    rfid_uid: input.rfidUid,
    visitor_id: input.visitor.id,
    visitor_name: input.visitor.name,
    status: 'open',
  }).select().single();
  if (error) throw error;
  return { order: { ...data, total_amount: Number(data.total_amount) } as PosOrder, resumed: false };
}

export async function fetchOrderItems(orderId: string, menu: MenuItem[]): Promise<PosCartItem[]> {
  const { data, error } = await supabase.from('order_items').select('menu_item_id,quantity').eq('order_id', orderId);
  if (error) throw error;
  return (data || []).flatMap(row => {
    const item = menu.find(menuItem => menuItem.id === row.menu_item_id);
    return item ? [{ ...item, quantity: Number(row.quantity) }] : [];
  });
}

export async function saveOrderDraft(orderId: string, items: PosCartItem[]) {
  const { error: deleteError } = await supabase.from('order_items').delete().eq('order_id', orderId);
  if (deleteError) throw deleteError;
  if (items.length === 0) return;
  const { error } = await supabase.from('order_items').insert(items.map(item => ({
    order_id: orderId,
    menu_item_id: item.id,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    subtotal: item.price * item.quantity,
  })));
  if (error) throw error;
}

export async function checkoutPosOrder(input: {
  orderId: string;
  merchantId: string;
  rfidUid: string;
  items: PosCartItem[];
  note?: string;
  idempotencyKey: string;
}): Promise<{ order: PosOrder; transaction: Transaction; visitor: Visitor; loyalty: LoyaltyInfo }> {
  const { data, error } = await supabase.rpc('process_pos_order', {
    p_order_id: input.orderId,
    p_merchant_id: input.merchantId,
    p_rfid_uid: input.rfidUid,
    p_items: input.items.map(item => ({ menu_item_id: item.id, quantity: item.quantity })),
    p_note: input.note || null,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error || !data?.transaction) {
    const message = error?.message || '';
    if (message.includes('INSUFFICIENT_CREDIT')) throw new Error('Saldo wisatawan tidak mencukupi');
    if (message.includes('MENU_ITEM_UNAVAILABLE')) throw new Error('Ada menu yang sudah tidak tersedia');
    throw new Error('Order gagal diproses');
  }
  return data;
}
