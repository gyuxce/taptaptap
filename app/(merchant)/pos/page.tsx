'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Minus, Plus, SmartphoneNfc } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { normalizeUID, formatRupiah } from '@/lib/utils';
import { fetchVisitorByUID } from '@/lib/services/visitorService';
import { getMerchantByUserId } from '@/lib/services/merchantService';
import { checkoutPosOrder, fetchMerchantMenu, fetchOrderItems, getOrCreateOpenOrder, saveOrderDraft, type PosCartItem } from '@/lib/services/posService';
import type { LoyaltyInfo, MenuItem, Merchant, PosOrder, Visitor } from '@/types';
import { MerchantNav } from '@/components/merchant/MerchantNav';
import { WavrLogo } from '@/components/ui/WavrLogo';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Toaster, toast } from '@/components/ui/Toast';

export default function MerchantPosPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [state, setState] = useState<'scan' | 'ordering' | 'success'>('scan');
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [rfidUid, setRfidUid] = useState('');
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [category, setCategory] = useState('Semua');
  const [order, setOrder] = useState<PosOrder | null>(null);
  const [resumed, setResumed] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [loyalty, setLoyalty] = useState<LoyaltyInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const idempotencyRef = useRef('');

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) return router.push('/');
    if (profile.role === 'admin') return router.push('/dashboard');
    if (profile.merchant_type !== 'regular') return router.replace('/tap');
    void getMerchantByUserId(profile.id).then(setMerchant);
  }, [authLoading, profile, router, user]);

  useEffect(() => {
    if (!merchant || !profile) return;
    if (merchant.merchant_type !== 'regular' || profile.merchant_id !== merchant.id) {
      router.replace('/tap');
    }
  }, [merchant, profile, router]);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (state !== 'ordering' || !order) return;
    const timer = window.setTimeout(() => {
      void saveOrderDraft(order.id, cart).catch(() => toast.error('Draft order gagal disimpan'));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [cart, order, state]);

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const itemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const categories = useMemo(() => ['Semua', ...new Set(menu.map(item => item.category))], [menu]);
  const visibleMenu = category === 'Semua' ? menu : menu.filter(item => item.category === category);

  const changeQuantity = (item: MenuItem, delta: number) => {
    setCart(current => {
      const existing = current.find(entry => entry.id === item.id);
      const quantity = Math.max(0, (existing?.quantity || 0) + delta);
      if (quantity === 0) return current.filter(entry => entry.id !== item.id);
      if (existing) return current.map(entry => entry.id === item.id ? { ...entry, quantity } : entry);
      return [...current, { ...item, quantity }];
    });
  };

  const processUid = useCallback(async (uid: string) => {
    if (!merchant) return;
    setScanning(false);
    setProcessing(true);
    try {
      const result = await fetchVisitorByUID(uid);
      if ('error' in result) throw new Error('Gelang belum terdaftar atau tidak aktif');
      const menuItems = await fetchMerchantMenu(merchant.id);
      if (menuItems.length === 0) throw new Error('Menu merchant belum tersedia');
      const openOrder = await getOrCreateOpenOrder({
        merchantId: merchant.id,
        rfidUid: uid,
        visitor: result.visitor,
      });
      const draftItems = await fetchOrderItems(openOrder.order.id, menuItems);
      setVisitor(result.visitor);
      setRfidUid(uid);
      setMenu(menuItems);
      setOrder(openOrder.order);
      setResumed(openOrder.resumed);
      setCart(draftItems);
      idempotencyRef.current = crypto.randomUUID();
      setState('ordering');
    } catch (error) {
      toast.error('POS belum dapat dibuka', {
        description: error instanceof Error
          ? error.message
          : 'Terjadi kendala saat membuka POS',
      });
    } finally {
      setProcessing(false);
    }
  }, [merchant]);

  const scanNfc = async () => {
    if (scanning) {
      abortRef.current?.abort();
      setScanning(false);
      return;
    }

    if (!('NDEFReader' in window)) {
      toast.error('NFC tidak tersedia', {
        description: 'Gunakan Chrome Android pada perangkat yang mendukung NFC.',
      });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setScanning(true);
    try {
      const reader = new NDEFReader();
      await reader.scan({ signal: controller.signal });
      reader.onreading = event => void processUid(normalizeUID(event.serialNumber));
      reader.onreadingerror = () => toast.error('Gelang gagal dibaca', {
        description: 'Tempelkan kembali gelang dan tahan sebentar di belakang HP.',
      });
    } catch (error) {
      setScanning(false);
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error('NFC gagal dimulai', {
          description: 'Periksa izin NFC lalu coba lagi.',
        });
      }
    }
  };

  const checkout = async () => {
    if (!merchant || !visitor || cart.length === 0) return;
    setCheckoutLoading(true);
    try {
      const result = await checkoutPosOrder({
        orderId: order?.id || crypto.randomUUID(),
        merchantId: merchant.id,
        rfidUid,
        items: cart,
        idempotencyKey: idempotencyRef.current || crypto.randomUUID(),
      });
      setOrder(result.order);
      setLoyalty(result.loyalty);
      setCartOpen(false);
      setState('success');
      if (result.visitor.phone) {
        void fetch('/api/notify', {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: result.visitor.phone,
            visitorName: result.visitor.name,
            merchantName: merchant.name,
            amount: result.transaction.amount,
            transactionId: result.transaction.id,
          }),
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Checkout gagal');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const resetOrder = () => {
    setState('scan');
    setVisitor(null);
    setRfidUid('');
    setCart([]);
    setOrder(null);
    setResumed(false);
    setLoyalty(null);
  };

  if (!merchant) return <div className="flex min-h-screen items-center justify-center text-sm">Memuat terminal POS...</div>;
  return (
    <div className="flex min-h-[100dvh] justify-center overflow-hidden bg-slate-900 lg:py-8">
      <Toaster position="top-center" richColors />
      <div className="relative flex h-[100dvh] w-full max-w-[448px] flex-col overflow-hidden bg-[#f7f7f5] lg:h-[860px] lg:rounded-[40px] lg:border-[10px] lg:border-slate-800">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex items-center gap-3">
            <WavrLogo variant="full" size="sm" />
            <div><p className="text-sm font-black">{merchant.name}</p><p className="text-[9px] text-slate-400">Powered by WAVR</p></div>
          </div>
          <Badge variant="success">POS</Badge>
        </header>

        {state === 'scan' && (
          <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-[linear-gradient(180deg,#f1faf6_0%,#ffffff_62%)] p-6 text-center">
            <div className="relative flex h-64 w-64 items-center justify-center">
              {(scanning || processing) && (
                <>
                  <span className="absolute h-64 w-64 animate-ping rounded-full border border-[#1D9E75]/15 bg-[#1D9E75]/5 [animation-duration:2.2s]" />
                  <span className="absolute h-52 w-52 animate-pulse rounded-full border border-[#1D9E75]/20 bg-[#1D9E75]/5" />
                </>
              )}
              <button
                onClick={scanNfc}
                disabled={processing}
                className="relative z-10 flex h-40 w-40 flex-col items-center justify-center gap-3 rounded-full bg-[#1D9E75] text-white shadow-[0_20px_44px_rgba(29,158,117,0.3)] transition duration-200 active:scale-95 disabled:cursor-wait disabled:opacity-90"
              >
                <SmartphoneNfc className={`h-14 w-14 ${scanning ? 'animate-pulse' : ''}`} />
                <span className="text-xs font-black">
                  {processing ? 'MEMBUKA POS' : scanning ? 'PULSE ON' : 'TAP UNTUK ORDER'}
                </span>
              </button>
            </div>
            <div>
              <h1 className="font-black">Tap Gelang Tamu</h1>
              <p className="mt-1 text-xs text-slate-500">
                {scanning
                  ? 'NFC aktif, dekatkan gelang ke bagian belakang HP'
                  : processing
                    ? 'Menyiapkan data tamu dan menu merchant'
                    : 'Dekatkan gelang ke HP untuk mulai order'}
              </p>
            </div>
          </main>
        )}

        {state === 'ordering' && visitor && (
          <main className="min-h-0 flex-1 overflow-y-auto pb-24">
            <div className="sticky top-0 z-10 border-b bg-white px-4 py-3">
              <div className="flex items-center justify-between">
                <div><p className="font-black">{visitor.name}</p><Badge variant={visitor.ticket_type}>{visitor.ticket_type}</Badge></div>
                <button onClick={() => setCartOpen(true)} className="rounded-xl bg-[#E8F6FD] px-3 py-2 text-xs font-black text-[#29ABE2]">
                  {itemCount} item - {formatRupiah(total)}
                </button>
              </div>
              {resumed && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[10px] font-bold text-amber-700">Order sebelumnya ditemukan - lanjutkan order aktif</p>}
            </div>
            <div className="flex gap-2 overflow-x-auto px-4 py-3">
              {categories.map(value => <button key={value} onClick={() => setCategory(value)} className={`min-h-11 whitespace-nowrap rounded-xl px-4 text-xs font-bold ${category === value ? 'bg-[#29ABE2] text-white' : 'bg-white text-slate-500'}`}>{value}</button>)}
            </div>
            <div className="grid grid-cols-2 gap-3 px-4">
              {visibleMenu.map(item => {
                const qty = cart.find(entry => entry.id === item.id)?.quantity || 0;
                return <article key={item.id} className="rounded-2xl border bg-white p-3">
                  <p className="min-h-10 text-sm font-bold">{item.name}</p>
                  <p className="mb-3 font-black text-[#29ABE2]">{formatRupiah(item.price)}</p>
                  {qty === 0 ? <button onClick={() => changeQuantity(item, 1)} className="min-h-11 w-full rounded-xl border border-[#29ABE2] text-xs font-bold text-[#29ABE2]">+ Tambah</button>
                    : <div className="flex min-h-11 items-center justify-between rounded-xl bg-[#E8F6FD] px-2">
                      <button onClick={() => changeQuantity(item, -1)}><Minus className="h-5 w-5" /></button><b>{qty}</b><button onClick={() => changeQuantity(item, 1)}><Plus className="h-5 w-5" /></button>
                    </div>}
                </article>;
              })}
            </div>
          </main>
        )}

        {state === 'ordering' && itemCount > 0 && (
          <button onClick={() => setCartOpen(true)} className="absolute bottom-14 left-3 right-3 z-20 flex min-h-14 items-center justify-between rounded-t-2xl bg-[#29ABE2] px-5 text-sm font-black text-white">
            <span>{itemCount} item dipilih</span><span>{formatRupiah(total)}</span>
          </button>
        )}

        {state === 'success' && (
          <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <CheckCircle2 className="h-24 w-24 text-emerald-500" />
            <div><h1 className="text-xl font-black">Order & Pembayaran Berhasil</h1><p className="font-bold">{visitor?.name}</p><p className="text-[#29ABE2]">{formatRupiah(order?.total_amount || total)} - {itemCount} item</p></div>
            {loyalty?.enabled && <p className="rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-700">{loyalty.available_rewards > 0 ? `Reward siap: ${loyalty.reward}` : `${loyalty.remaining} kunjungan lagi untuk ${loyalty.reward}`}</p>}
            <Button onClick={resetOrder} fullWidth>Order Baru</Button>
            <Button variant="ghost" onClick={() => router.push('/tap')} fullWidth>Kembali ke Tap</Button>
          </main>
        )}

        <MerchantNav active="pos" merchantType="regular" onHistory={() => router.push('/tap')} />

        <Modal isOpen={cartOpen} onClose={() => setCartOpen(false)} title="Detail Order" footer={
          <Button onClick={checkout} loading={checkoutLoading} disabled={cart.length === 0} fullWidth>
            Bayar & Catat Order {formatRupiah(total)}
          </Button>
        }>
          <div className="space-y-3">
            {cart.map(item => <div key={item.id} className="flex items-center justify-between border-b pb-3 text-sm">
              <div><p className="font-bold">{item.name}</p><p className="text-xs text-slate-400">{formatRupiah(item.price * item.quantity)}</p></div>
              <div className="flex items-center gap-3"><button onClick={() => changeQuantity(item, -1)}><Minus /></button><b>{item.quantity}</b><button onClick={() => changeQuantity(item, 1)}><Plus /></button></div>
            </div>)}
            <div className="flex justify-between pt-2 text-lg font-black"><span>Total</span><span>{formatRupiah(total)}</span></div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
