'use client';
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { db } from '@/lib/supabase';
import { Merchant } from '@/types';
import { createMerchantSchema, CreateMerchantInput } from '@/lib/validations';
import { toggleMerchantStatus, updateMerchantLoyalty } from '@/lib/services/merchantService';
import { formatPhoneForWA, formatDatetime } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toaster, toast } from '@/components/ui/Toast';
import { Plus, Store, MapPin, ShieldAlert, Key, Phone, Calendar, Pencil, Trash2, Gift } from 'lucide-react';
export default function AdminMerchantsPage() {
    const [merchants, setMerchants] = useState<Merchant[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    // Modals state
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editMerchantData, setEditMerchantData] = useState<Merchant | null>(null);
    const [confirmDeleteData, setConfirmDeleteData] = useState<Merchant | null>(null);
    // Toggle status dialog state
    const [confirmToggleData, setConfirmToggleData] = useState<{
        id: string;
        name: string;
        isActive: boolean;
    } | null>(null);
    // Success credentials modal state
    const [generatedCredentials, setGeneratedCredentials] = useState<{
        email: string;
        pass: string;
        name: string;
    } | null>(null);
    // Detail modal state
    const [selectedMerchantDetail, setSelectedMerchantDetail] = useState<Merchant | null>(null);
    const [loyaltyMerchant, setLoyaltyMerchant] = useState<Merchant | null>(null);
    const [loyaltyTarget, setLoyaltyTarget] = useState(10);
    const [loyaltyReward, setLoyaltyReward] = useState('1x Gratis');
    const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
    const [loyaltySaving, setLoyaltySaving] = useState(false);
    const [provisioningMerchant, setProvisioningMerchant] = useState<string | null>(null);
    // Form setup for create merchant
    const { register, handleSubmit, setValue, reset, formState: { errors, isSubmitting }, } = useForm<CreateMerchantInput>({
        resolver: zodResolver(createMerchantSchema),
        mode: 'onBlur',
        defaultValues: {
            name: '',
            category: 'F&B',
            location: '',
            merchant_type: 'regular',
            phone: '',
            owner_email: '',
            owner_password: 'WAVR2025!',
        }
    });
    async function loadMerchants() {
        setLoading(true);
        try {
            const data = await db.getMerchants();
            setMerchants(data);
        }
        catch {
            toast.error('Gagal mengambil daftar merchant');
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadMerchants();
    }, []);
    const handleToggleClick = (m: Merchant) => {
        setConfirmToggleData({
            id: m.id,
            name: m.name,
            isActive: m.is_active,
        });
    };
    const handleConfirmToggle = async () => {
        if (!confirmToggleData)
            return;
        setUpdatingId(confirmToggleData.id);
        try {
            const res = await toggleMerchantStatus(confirmToggleData.id);
            if (res.success) {
                toast.success(`Merchant ${confirmToggleData.name} berhasil ${confirmToggleData.isActive ? 'dinonaktifkan' : 'diaktifkan'}`);
                await loadMerchants();
            }
            else {
                toast.error(res.error || 'Gagal mengubah status merchant');
            }
        }
        catch {
            toast.error('Gagal mengubah status');
        }
        finally {
            setUpdatingId(null);
            setConfirmToggleData(null);
        }
    };
    const handleCreateClick = () => {
        setEditMerchantData(null);
        reset({
            name: '',
            category: 'F&B',
            location: '',
            merchant_type: 'regular',
            phone: '',
            owner_email: '',
            owner_password: 'WAVR2025!',
        });
        setIsCreateModalOpen(true);
    };
    const handleEditClick = (m: Merchant) => {
        setEditMerchantData(m);
        setValue('name', m.name);
        setValue('category', m.category as CreateMerchantInput['category']);
        setValue('location', m.location);
        setValue('merchant_type', m.merchant_type);
        setValue('phone', m.phone || '');
        // Pre-fill email and password with dummy values to bypass schema validation
        setValue('owner_email', 'dummy@email.com');
        setValue('owner_password', 'dummyPassword123');
        setIsCreateModalOpen(true);
    };
    const handleDeleteClick = (m: Merchant) => {
        setConfirmDeleteData(m);
    };
    const openLoyaltyConfig = (m: Merchant) => {
        setLoyaltyMerchant(m);
        setLoyaltyEnabled(Boolean(m.loyalty_enabled));
        setLoyaltyTarget(m.loyalty_target || 10);
        setLoyaltyReward(m.loyalty_reward || '1x Gratis');
    };
    const saveLoyaltyConfig = async () => {
        if (!loyaltyMerchant || loyaltyTarget < 2 || !loyaltyReward.trim())
            return toast.error('Konfigurasi loyalty belum valid');
        setLoyaltySaving(true);
        const result = await updateMerchantLoyalty(loyaltyMerchant.id, {
            loyalty_enabled: loyaltyEnabled,
            loyalty_target: loyaltyTarget,
            loyalty_reward: loyaltyReward.trim(),
        });
        setLoyaltySaving(false);
        if (!result.success)
            return toast.error('Gagal menyimpan loyalty. Jalankan migrasi POS terlebih dahulu.');
        setMerchants(current => current.map(item => item.id === loyaltyMerchant.id ? {
            ...item,
            loyalty_enabled: loyaltyEnabled,
            loyalty_target: loyaltyTarget,
            loyalty_reward: loyaltyReward.trim(),
        } : item));
        setLoyaltyMerchant(null);
        toast.success('Konfigurasi loyalty diperbarui');
    };
    const handleConfirmDelete = async () => {
        if (!confirmDeleteData)
            return;
        const merchantToDelete = confirmDeleteData;
        setDeleteLoading(true);
        try {
            const success = await db.deleteMerchant(merchantToDelete.id);
            if (success) {
                setMerchants(current => current.filter(merchant => merchant.id !== merchantToDelete.id));
                toast.success(`Merchant ${merchantToDelete.name} berhasil dihapus dari sistem`);
            }
            else {
                toast.error('Gagal menghapus merchant');
            }
        }
        catch {
            toast.error('Terjadi kesalahan saat menghapus merchant');
        }
        finally {
            setDeleteLoading(false);
            setConfirmDeleteData(null);
        }
    };
    const onCreateSubmit = async (data: CreateMerchantInput) => {
        let toastId: string | number | undefined;
        try {
            if (editMerchantData) {
                // Edit flow
                toastId = toast.loading(`Menyimpan perubahan ${data.name}...`);
                setProvisioningMerchant(data.name);
                setIsCreateModalOpen(false);
                const success = await db.updateMerchant(editMerchantData.id, {
                    name: data.name,
                    category: data.category,
                    location: data.location,
                    phone: data.phone,
                });
                if (success) {
                    setMerchants(current => current.map(merchant => merchant.id === editMerchantData.id
                        ? {
                            ...merchant,
                            name: data.name,
                            category: data.category,
                            location: data.location,
                            phone: data.phone,
                        }
                        : merchant));
                    toast.success(`Informasi ${data.name} berhasil diperbarui`, { id: toastId });
                    setEditMerchantData(null);
                    reset();
                }
                else {
                    toast.error('Gagal memperbarui merchant', { id: toastId });
                    setIsCreateModalOpen(true);
                }
                return;
            }
            // Real API provisioning call
            toastId = toast.loading(`Menyiapkan akun ${data.name}...`);
            setProvisioningMerchant(data.name);
            setIsCreateModalOpen(false);
            const res = await fetch('/api/admin/create-merchant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const resJson = await res.json();
            if (resJson.success) {
                setMerchants(current => [
                    resJson.merchant as Merchant,
                    ...current.filter(item => item.id !== resJson.merchant.id),
                ]);
                setGeneratedCredentials({
                    email: data.owner_email,
                    pass: data.owner_password,
                    name: data.name,
                });
                reset();
                toast.success(`${data.name} berhasil didaftarkan`, { id: toastId });
            }
            else {
                toast.error(resJson.error || 'Gagal membuat merchant', { id: toastId });
                setIsCreateModalOpen(true);
            }
        }
        catch {
            toast.error('Kendala koneksi, gagal memproses data merchant', toastId ? { id: toastId } : undefined);
            setIsCreateModalOpen(true);
        }
        finally {
            setProvisioningMerchant(null);
        }
    };
    if (loading) {
        return (<div className="flex flex-col gap-6 w-full animate-pulse">
        <div className="flex justify-between items-center">
          <div className="h-8 w-48 bg-slate-200 rounded"/>
          <div className="h-10 w-36 bg-slate-200 rounded"/>
        </div>
        <div className="h-96 bg-white border border-[#e5e3db] rounded-2xl"/>
      </div>);
    }
    return (<div className="flex flex-col gap-6 text-left">
      <Toaster position="top-center" richColors/>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <span className="text-xs font-bold text-[#29ABE2] uppercase tracking-wider block">
            Kelola Merchant Partner
          </span>
          <h1 className="text-xl md:text-2xl font-black text-[#1e293b] mt-0.5">
            Daftar Gerbang & Regular Merchant
          </h1>
        </div>
        <Button onClick={handleCreateClick} className="flex items-center gap-2 text-xs font-bold cursor-pointer">
          <Plus className="h-4.5 w-4.5"/> Tambah Merchant
        </Button>
      </div>

      {provisioningMerchant && (
        <div className="flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-left shadow-xs">
          <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-sky-200 border-t-[#29ABE2]" />
          <div>
            <p className="text-xs font-black text-sky-900">Mendaftarkan {provisioningMerchant}</p>
            <p className="text-[10px] font-medium text-sky-700">Menyimpan akun login dan profil merchant ke sistem.</p>
          </div>
        </div>
      )}

      {/* Table grid */}
      <div className="bg-white border border-[#e5e3db] rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#e5e3db] text-[#64748b] font-bold uppercase tracking-wider bg-[#fbfbfa]">
                <th className="p-4">Nama Merchant</th>
                <th className="py-4 px-2">Kategori</th>
                <th className="py-4 px-2">Lokasi Kios</th>
                <th className="py-4 px-2">Tipe Terminal</th>
                <th className="py-4 px-2">WhatsApp Owner</th>
                <th className="py-4 px-2 text-center">Status</th>
                <th className="py-4 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((m) => (<tr key={m.id} className="border-b border-[#f7f7f5] hover:bg-[#f7f7f5]/30 transition-colors">
                  <td onClick={() => setSelectedMerchantDetail(m)} className="py-3 px-4 font-bold text-[#1e293b] flex items-center gap-2 cursor-pointer hover:text-[#29ABE2] transition-colors">
                    <Store className="h-4 w-4 text-[#29ABE2]"/> {m.name}
                  </td>
                  <td className="py-3 px-2 text-gray-500 font-semibold">{m.category}</td>
                  <td className="py-3 px-2 text-[#64748b] font-medium">
                    <span className="flex items-start gap-1.5">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 min-w-3.5 shrink-0"/>
                      <span>{m.location}</span>
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <Badge variant={m.merchant_type === 'loket' ? 'VIP' : 'Family'}>
                      {m.merchant_type === 'loket' ? 'Loket Entry' : 'Regular'}
                    </Badge>
                  </td>
                  <td className="py-3 px-2 font-medium text-slate-600">
                    {m.phone ? (<a href={`https://wa.me/${formatPhoneForWA(m.phone)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[#29ABE2] hover:underline">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#29ABE2] animate-pulse"/>
                        {m.phone}
                      </a>) : (<span className="text-gray-400">-</span>)}
                  </td>
                  <td className="py-3 px-2 text-center">
                    <Badge variant={m.is_active ? 'success' : 'error'}>
                      {m.is_active ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right flex items-center justify-end gap-1.5">
                    <Button onClick={() => setSelectedMerchantDetail(m)} variant="ghost" size="sm" className="text-[#29ABE2] hover:bg-[#E8F6FD] border border-[#29ABE2]/20 font-bold px-2 py-1 rounded-lg">
                      Detail
                    </Button>
                    <Button onClick={() => handleEditClick(m)} variant="ghost" size="sm" className="text-blue-600 hover:bg-blue-50 border border-blue-200 font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                      <Pencil className="h-3 w-3"/> Edit
                    </Button>
                    <Button onClick={() => openLoyaltyConfig(m)} variant="ghost" size="sm" className="text-amber-600 hover:bg-amber-50 border border-amber-200 font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                      <Gift className="h-3 w-3"/> Loyalty
                    </Button>
                    <Button onClick={() => handleDeleteClick(m)} variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 border border-red-200 font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                      <Trash2 className="h-3 w-3"/> Hapus
                    </Button>
                    <Button onClick={() => handleToggleClick(m)} disabled={updatingId === m.id} variant="ghost" size="sm" className={`text-[10px] font-bold border rounded-lg cursor-pointer ${m.is_active
                ? 'border-red-200 text-red-500 bg-red-50 hover:bg-red-100'
                : 'border-green-200 text-green-500 bg-green-50 hover:bg-green-100'}`}>
                      {m.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                  </td>
                </tr>))}
              {merchants.length === 0 && (<tr>
                  <td colSpan={7} className="text-center py-16 text-gray-400">
                    Tidak ada merchant wisata terdaftar.
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Create Merchant Form */}
      <Modal deferContent isOpen={isCreateModalOpen} onClose={() => {
            setIsCreateModalOpen(false);
            setEditMerchantData(null);
            reset();
        }} title={editMerchantData ? 'Edit Informasi Partner' : 'Daftarkan Merchant Baru'}>
        <form onSubmit={handleSubmit(onCreateSubmit)} className="flex flex-col gap-4 text-left">
          <Input label="Nama Merchant Partner *" placeholder="Contoh: Zipline Canopy B" error={errors.name?.message} disabled={isSubmitting} {...register('name')}/>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#64748b]">
                Kategori Kios
              </label>
              <select disabled={isSubmitting} className="w-full px-4 py-2.5 text-sm bg-white text-[#1e293b] border border-[#e5e3db] rounded-xl outline-none focus:border-[#29ABE2]" {...register('category')}>
                <option value="Adventure">Adventure</option>
                <option value="F&B">F&B</option>
                <option value="Retail">Retail</option>
                <option value="Sightseeing">Sightseeing</option>
                <option value="Loket/Gerbang">Loket/Gerbang</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#64748b]">
                Tipe Merchant
              </label>
              <select disabled={isSubmitting} className="w-full px-4 py-2.5 text-sm bg-white text-[#1e293b] border border-[#e5e3db] rounded-xl outline-none focus:border-[#29ABE2]" {...register('merchant_type')}>
                <option value="regular">Regular (Belanja)</option>
                <option value="loket">Loket (Entry Gate)</option>
              </select>
            </div>
          </div>

          <Input label="Lokasi Pos Area *" placeholder="Contoh: Plaza Utama Kios #1" error={errors.location?.message} disabled={isSubmitting} {...register('location')}/>

          <Input label="Nomor HP Owner (WhatsApp) *" placeholder="Contoh: 081234567890" error={errors.phone?.message} disabled={isSubmitting} {...register('phone')}/>

          <div className={editMerchantData ? 'hidden' : 'flex flex-col gap-4'}>
            <Input label="Email Owner Merchant *" type="email" placeholder="owner@zipline.com" error={errors.owner_email?.message} disabled={isSubmitting} {...register('owner_email')}/>

            <Input label="Kata Sandi Owner *" type="password" placeholder="Minimal 8 karakter" error={errors.owner_password?.message} disabled={isSubmitting} {...register('owner_password')}/>
          </div>

          <div className="flex gap-2.5 pt-3">
            <Button type="button" variant="ghost" onClick={() => {
            setIsCreateModalOpen(false);
            setEditMerchantData(null);
            reset();
        }} disabled={isSubmitting} className="w-1/3 text-xs border border-[#e5e3db] font-bold">
              Batal
            </Button>
            <Button type="submit" loading={isSubmitting} disabled={isSubmitting} className="w-2/3 text-xs font-bold">
              {editMerchantData ? 'Simpan Perubahan' : 'Tambah Partner'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Generated Credentials details */}
      <Modal isOpen={generatedCredentials !== null} onClose={() => setGeneratedCredentials(null)} title="Merchant Berhasil Dibuat">
        {generatedCredentials && (<div className="flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-full bg-[#E8F6FD] border border-[#29ABE2]/20 flex items-center justify-center text-[#29ABE2] shadow-xs">
              <Key className="h-8 w-8"/>
            </div>

            <div className="space-y-1 text-xs">
              <h3 className="text-sm font-black text-[#1e293b]">Kredensial Owner Baru</h3>
              <p className="text-gray-400">
                Gunakan email & sandi berikut untuk masuk ke terminal merchant {generatedCredentials.name}:
              </p>
            </div>

            <div className="w-full bg-[#f7f7f5] border border-[#e5e3db] rounded-2xl p-4 text-xs space-y-2.5 text-left font-mono">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-sans font-bold text-gray-400 uppercase tracking-widest">
                  ALAMAT EMAIL
                </span>
                <span className="font-bold text-[#1e293b] select-all block truncate">
                  {generatedCredentials.email}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 border-t border-[#e5e3db] pt-2">
                <span className="text-[9px] font-sans font-bold text-gray-400 uppercase tracking-widest">
                  KATA SANDI (PASSWORD)
                </span>
                <span className="font-bold text-[#1e293b] select-all block truncate">
                  {generatedCredentials.pass}
                </span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-medium p-3 rounded-xl flex items-start gap-2 text-left leading-relaxed">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-500"/>
              <span>Penting: Pastikan Anda mencatat kredensial di atas sebelum menutup dialog ini.</span>
            </div>

            <Button variant="primary" onClick={() => setGeneratedCredentials(null)} className="w-full text-xs font-bold mt-2">
              Saya Mengerti & Sudah Mencatat
            </Button>
          </div>)}
      </Modal>

      {/* Modal 3: Merchant Details View */}
      <Modal isOpen={selectedMerchantDetail !== null} onClose={() => setSelectedMerchantDetail(null)} title="Detail Informasi Merchant">
        {selectedMerchantDetail && (<div className="flex flex-col gap-4 text-left text-xs font-bold text-slate-700">
            <div className="flex items-center gap-3 p-4 bg-slate-50 border border-[#e5e3db] rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-[#E8F6FD] flex items-center justify-center text-[#29ABE2]">
                <Store className="h-6 w-6"/>
              </div>
              <div>
                <h4 className="text-sm font-black text-[#1e293b]">{selectedMerchantDetail.name}</h4>
                <p
                  className="text-[10px] text-slate-400 mt-0.5"
                  title={selectedMerchantDetail.id}
                >
                  ID: {selectedMerchantDetail.merchant_type === 'loket' ? 'POS' : 'TRM'}-
                  {selectedMerchantDetail.id.replace(/-/g, '').slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">Kategori Kios</span>
                <span className="text-slate-800 font-black text-[#1e293b]">{selectedMerchantDetail.category}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">Tipe Terminal</span>
                <Badge variant={selectedMerchantDetail.merchant_type === 'loket' ? 'VIP' : 'Family'} className="w-fit mt-0.5">
                  {selectedMerchantDetail.merchant_type === 'loket' ? 'Loket Entry' : 'Regular'}
                </Badge>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-400">Lokasi Pos Kios</span>
              <span className="text-slate-800 flex items-center gap-1 mt-0.5 font-black text-[#1e293b]">
                <MapPin className="h-3.5 w-3.5 min-w-3.5 shrink-0 text-slate-400"/> {selectedMerchantDetail.location}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-400">Nomor WhatsApp Owner</span>
              {selectedMerchantDetail.phone ? (<a href={`https://wa.me/${formatPhoneForWA(selectedMerchantDetail.phone)}`} target="_blank" rel="noopener noreferrer" className="text-[#29ABE2] hover:underline flex items-center gap-1 mt-0.5">
                  <Phone className="h-3.5 w-3.5 text-[#29ABE2]"/> {selectedMerchantDetail.phone} (Hubungi)
                </a>) : (<span className="text-slate-400 font-medium">-</span>)}
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-400">Owner User ID</span>
              <span className="text-slate-500 font-mono select-all break-all">{selectedMerchantDetail.owner_user_id || '-'}</span>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-3.5 mt-1">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">Status Akun</span>
                <Badge variant={selectedMerchantDetail.is_active ? 'success' : 'error'} className="w-fit mt-0.5">
                  {selectedMerchantDetail.is_active ? 'Aktif' : 'Nonaktif'}
                </Badge>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">Terdaftar Pada</span>
                <span className="text-slate-650 flex items-center gap-1 mt-0.5 text-[#1e293b]">
                  <Calendar className="h-3.5 w-3.5 text-slate-400"/> {formatDatetime(selectedMerchantDetail.created_at)}
                </span>
              </div>
            </div>

            <div className="flex justify-end mt-2">
              <Button onClick={() => setSelectedMerchantDetail(null)} variant="ghost" size="sm" className="font-bold border border-slate-200">
                Tutup Detail
              </Button>
            </div>
          </div>)}
      </Modal>

      <Modal isOpen={loyaltyMerchant !== null} onClose={() => setLoyaltyMerchant(null)} title="Konfigurasi Loyalty">
        <div className="space-y-4">
          <div className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">{loyaltyMerchant?.name}</div>
          <label className="flex min-h-11 items-center gap-3 rounded-xl border p-3 text-sm font-bold">
            <input type="checkbox" checked={loyaltyEnabled} onChange={(event) => setLoyaltyEnabled(event.target.checked)}/>
            Aktifkan loyalty
          </label>
          <Input label="Target kunjungan" type="number" min={2} max={50} value={loyaltyTarget} onChange={(event) => setLoyaltyTarget(Number(event.target.value))}/>
          <Input label="Nama reward" value={loyaltyReward} onChange={(event) => setLoyaltyReward(event.target.value)} placeholder="Contoh: 1x Makan Gratis"/>
          <p className="text-[10px] text-slate-500">Satu stamp diberikan maksimal sekali per wisatawan, merchant, dan hari setelah pembayaran berhasil.</p>
          <Button onClick={saveLoyaltyConfig} loading={loyaltySaving} fullWidth>Simpan Loyalty</Button>
        </div>
      </Modal>

      {/* Toggle status confirmation dialog */}
      <ConfirmDialog isOpen={confirmToggleData !== null} onClose={() => setConfirmToggleData(null)} onConfirm={handleConfirmToggle} title="Ubah Status Merchant" message={confirmToggleData ? `Yakin ${confirmToggleData.isActive ? 'nonaktifkan' : 'aktifkan'} merchant ${confirmToggleData.name}? ${confirmToggleData.isActive ? 'Merchant tidak akan bisa mencatat transaksi tap gelang NFC.' : 'Merchant akan aktif kembali untuk tap.'}` : ''} confirmLabel={confirmToggleData?.isActive ? 'Nonaktifkan' : 'Aktifkan'}/>

      {/* Delete merchant confirmation dialog */}
      <ConfirmDialog isOpen={confirmDeleteData !== null} onClose={() => setConfirmDeleteData(null)} onConfirm={handleConfirmDelete} loading={deleteLoading} title="Hapus Merchant" message={confirmDeleteData ? `Yakin ingin menghapus merchant ${confirmDeleteData.name}? Tindakan ini akan menghapus data merchant dan akun login owner secara permanen.` : ''} confirmLabel={deleteLoading ? 'Menghapus...' : 'Hapus'}/>
    </div>);
}
