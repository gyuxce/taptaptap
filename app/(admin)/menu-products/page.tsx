'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { db } from '@/lib/supabase';
import { deleteMenuItem, fetchMerchantMenu, saveMenuItem } from '@/lib/services/posService';
import type { MenuItem, Merchant } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toaster, toast } from '@/components/ui/Toast';
import { Badge } from '@/components/ui/Badge';

const emptyForm = { name: '', price: '', category: 'Makanan', is_available: true, sort_order: '0' };

export default function MenuProductsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [merchantId, setMerchantId] = useState('');
  const [items, setItems] = useState<MenuItem[]>([]);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<MenuItem | null>(null);

  useEffect(() => {
    void db.getMerchants().then(list => {
      const regularMerchants = list.filter(item => item.merchant_type === 'regular');
      setMerchants(regularMerchants);
      if (regularMerchants[0]) setMerchantId(regularMerchants[0].id);
    });
  }, []);

  const merchant = useMemo(() => merchants.find(item => item.id === merchantId), [merchantId, merchants]);
  const loadItems = async () => {
    if (!merchantId) return;
    try {
      setItems(await fetchMerchantMenu(merchantId, true));
    } catch {
      toast.error('Menu belum tersedia. Pastikan migrasi POS sudah dijalankan.');
    }
  };
  useEffect(() => { void loadItems(); }, [merchantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };
  const startEdit = (item: MenuItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      price: String(item.price),
      category: item.category,
      is_available: item.is_available,
      sort_order: String(item.sort_order),
    });
    setOpen(true);
  };
  const submit = async () => {
    if (!merchantId || form.name.trim().length < 2 || Number(form.price) < 0) {
      toast.error('Nama dan harga menu belum valid');
      return;
    }
    setSaving(true);
    try {
      await saveMenuItem({
        id: editing?.id,
        merchant_id: merchantId,
        name: form.name.trim(),
        price: Number(form.price),
        category: form.category,
        is_available: form.is_available,
        sort_order: Number(form.sort_order) || 0,
        updated_at: new Date().toISOString(),
      });
      toast.success(editing ? 'Menu diperbarui' : 'Menu ditambahkan');
      setOpen(false);
      await loadItems();
    } catch {
      toast.error('Gagal menyimpan menu');
    } finally {
      setSaving(false);
    }
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMenuItem(deleting.id);
      setItems(current => current.filter(item => item.id !== deleting.id));
      toast.success('Menu dihapus');
    } catch {
      toast.error('Menu tidak dapat dihapus');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <Toaster position="top-center" richColors />
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase text-[#29ABE2]">POS Merchant Reguler</p>
          <h1 className="text-2xl font-black">Menu & Produk</h1>
          <p className="mt-1 text-xs text-slate-500">Loket tidak memakai menu atau transaksi POS.</p>
        </div>
        <Button onClick={startCreate} disabled={!merchantId}><Plus className="mr-2 h-4 w-4" /> Tambah Menu</Button>
      </header>
      <div className="rounded-2xl border bg-white p-4">
        <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Merchant</label>
        <select value={merchantId} onChange={event => setMerchantId(event.target.value)} className="w-full rounded-xl border bg-[#f7f7f5] px-4 py-3 text-sm font-bold">
          {merchants.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {merchant && <p className="mt-2 text-xs text-slate-400">{merchant.location}</p>}
      </div>
      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-xs">
            <thead className="bg-slate-50 uppercase text-slate-400"><tr><th className="p-4">Nama</th><th>Kategori</th><th>Harga</th><th>Tersedia</th><th className="text-right pr-4">Aksi</th></tr></thead>
            <tbody>
              {items.map(item => <tr key={item.id} className="border-t">
                <td className="p-4 font-black">{item.name}</td><td>{item.category}</td><td className="font-bold text-[#29ABE2]">{formatRupiah(item.price)}</td>
                <td><Badge variant={item.is_available ? 'success' : 'inactive'}>{item.is_available ? 'Tersedia' : 'Nonaktif'}</Badge></td>
                <td className="space-x-2 py-3 pr-4 text-right">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(item)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(item)} className="text-red-600"><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>)}
              {items.length === 0 && <tr><td colSpan={5} className="p-12 text-center text-slate-400">Belum ada menu untuk merchant ini.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'Edit Menu' : 'Tambah Menu'}>
        <div className="space-y-4">
          <Input label="Nama menu" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} />
          <Input label="Harga" type="number" value={form.price} onChange={event => setForm(current => ({ ...current, price: event.target.value }))} />
          <div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Kategori</label><select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))} className="w-full rounded-xl border px-4 py-3">
            {['Makanan','Minuman','Snack','Lainnya'].map(value => <option key={value}>{value}</option>)}
          </select></div>
          <label className="flex min-h-11 items-center gap-3 rounded-xl border p-3 text-sm font-bold"><input type="checkbox" checked={form.is_available} onChange={event => setForm(current => ({ ...current, is_available: event.target.checked }))} /> Tersedia di POS</label>
          <Button onClick={submit} loading={saving} fullWidth>Simpan Menu</Button>
        </div>
      </Modal>
      <ConfirmDialog isOpen={deleting !== null} onClose={() => setDeleting(null)} onConfirm={confirmDelete} title="Hapus Menu" message={`Hapus ${deleting?.name || 'menu'}?`} confirmLabel="Hapus" />
    </div>
  );
}
