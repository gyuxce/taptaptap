'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { Merchant } from '@/types';
import { createMerchantSchema, CreateMerchantInput } from '@/lib/validations';
import { toggleMerchantStatus } from '@/lib/services/merchantService';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toaster, toast } from '@/components/ui/Toast';
import { Plus, ToggleLeft, Store, MapPin, Eye, EyeOff, ShieldAlert, Key } from 'lucide-react';

export default function AdminMerchantsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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

  // Form setup for create merchant
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateMerchantInput>({
    resolver: zodResolver(createMerchantSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      category: 'F&B',
      location: '',
      merchant_type: 'regular',
      owner_email: '',
      owner_password: 'EcoTour2025!',
    }
  });

  useEffect(() => {
    loadMerchants();
  }, []);

  const loadMerchants = async () => {
    setLoading(true);
    try {
      const data = await db.getMerchants();
      setMerchants(data);
    } catch (err) {
      toast.error('Gagal mengambil daftar merchant');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleClick = (m: Merchant) => {
    setConfirmToggleData({
      id: m.id,
      name: m.name,
      isActive: m.is_active,
    });
  };

  const handleConfirmToggle = async () => {
    if (!confirmToggleData) return;
    setUpdatingId(confirmToggleData.id);

    try {
      const res = await toggleMerchantStatus(confirmToggleData.id);
      if (res.success) {
        toast.success(`Merchant ${confirmToggleData.name} berhasil ${confirmToggleData.isActive ? 'dinonaktifkan' : 'diaktifkan'}`);
        await loadMerchants();
      } else {
        toast.error(res.error || 'Gagal mengubah status merchant');
      }
    } catch (err) {
      toast.error('Gagal mengubah status');
    } finally {
      setUpdatingId(null);
      setConfirmToggleData(null);
    }
  };

  const onCreateSubmit = async (data: CreateMerchantInput) => {
    try {
      if (isSupabaseConfigured) {
        // Real API provisioning call
        const res = await fetch('/api/admin/create-merchant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const resJson = await res.json();
        if (resJson.success) {
          setGeneratedCredentials({
            email: data.owner_email,
            pass: data.owner_password,
            name: data.name,
          });
          setIsCreateModalOpen(false);
          reset();
          await loadMerchants();
        } else {
          toast.error(resJson.error || 'Gagal membuat merchant');
        }
      } else {
        // simulation
        const mockMerchant = await db.createMerchant({
          name: data.name,
          category: data.category,
          location: data.location,
          merchant_type: data.merchant_type,
          owner_user_id: `u-${data.owner_email.replace(/@/g, '_')}`,
        });

        // Add dummy profiles for demo
        const profiles = JSON.parse(window.localStorage.getItem('ecotour_profiles') || '[]');
        profiles.push({
          id: mockMerchant.owner_user_id,
          role: 'merchant',
          merchant_id: mockMerchant.id,
          merchant_type: mockMerchant.merchant_type,
          created_at: new Date().toISOString()
        });
        window.localStorage.setItem('ecotour_profiles', JSON.stringify(profiles));

        // Sync storage credentials
        const credentialsList = JSON.parse(window.localStorage.getItem('ecotour_credentials') || '[]');
        credentialsList.push({
          email: data.owner_email,
          role: 'merchant',
          merchant_id: mockMerchant.id,
          merchant_type: mockMerchant.merchant_type,
        });
        window.localStorage.setItem('ecotour_credentials', JSON.stringify(credentialsList));

        setGeneratedCredentials({
          email: data.owner_email,
          pass: data.owner_password,
          name: data.name,
        });
        setIsCreateModalOpen(false);
        reset();
        await loadMerchants();
      }
    } catch (err) {
      toast.error('Kendala koneksi, gagal membuat merchant');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 w-full animate-pulse">
        <div className="flex justify-between items-center">
          <div className="h-8 w-48 bg-slate-200 rounded" />
          <div className="h-10 w-36 bg-slate-200 rounded" />
        </div>
        <div className="h-96 bg-white border border-[#e5e3db] rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <span className="text-xs font-bold text-[#1D9E75] uppercase tracking-wider block">
            Kelola Merchant Partner
          </span>
          <h1 className="text-xl md:text-2xl font-black text-[#1e293b] mt-0.5">
            Daftar Gerbang & Regular Merchant
          </h1>
        </div>
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 text-xs font-bold cursor-pointer"
        >
          <Plus className="h-4.5 w-4.5" /> Tambah Merchant
        </Button>
      </div>

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
                <th className="py-4 px-2">Owner User</th>
                <th className="py-4 px-2 text-center">Status</th>
                <th className="py-4 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((m) => (
                <tr key={m.id} className="border-b border-[#f7f7f5] hover:bg-[#f7f7f5]/30 transition-colors">
                  <td className="py-3 px-4 font-bold text-[#1e293b] flex items-center gap-2">
                    <Store className="h-4 w-4 text-[#1D9E75]" /> {m.name}
                  </td>
                  <td className="py-3 px-2 text-gray-500 font-semibold">{m.category}</td>
                  <td className="py-3 px-2 text-[#64748b] font-medium flex items-center gap-1 mt-1">
                    <MapPin className="h-3.5 w-3.5" /> {m.location}
                  </td>
                  <td className="py-3 px-2">
                    <Badge variant={m.merchant_type === 'loket' ? 'VIP' : 'Family'}>
                      {m.merchant_type === 'loket' ? 'Loket Entry' : 'Regular'}
                    </Badge>
                  </td>
                  <td className="py-3 px-2 font-mono font-bold text-slate-500 truncate max-w-[150px]">
                    {m.owner_user_id || '-'}
                  </td>
                  <td className="py-3 px-2 text-center">
                    <Badge variant={m.is_active ? 'success' : 'error'}>
                      {m.is_active ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button
                      onClick={() => handleToggleClick(m)}
                      disabled={updatingId === m.id}
                      variant="ghost"
                      size="sm"
                      className={`text-[10px] font-bold border rounded-lg cursor-pointer ${
                        m.is_active 
                          ? 'border-red-200 text-red-500 bg-red-50 hover:bg-red-100' 
                          : 'border-green-200 text-green-500 bg-green-50 hover:bg-green-100'
                      }`}
                    >
                      {m.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                  </td>
                </tr>
              ))}
              {merchants.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-gray-400">
                    Tidak ada merchant wisata terdaftar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Create Merchant Form */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          reset();
        }}
        title="Daftarkan Merchant Baru"
      >
        <form onSubmit={handleSubmit(onCreateSubmit)} className="flex flex-col gap-4 text-left">
          <Input
            label="Nama Merchant Partner *"
            placeholder="Contoh: Zipline Canopy B"
            error={errors.name?.message}
            disabled={isSubmitting}
            {...register('name')}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#64748b]">
                Kategori Kios
              </label>
              <select
                disabled={isSubmitting}
                className="w-full px-4 py-2.5 text-sm bg-white text-[#1e293b] border border-[#e5e3db] rounded-xl outline-none focus:border-[#1D9E75]"
                {...register('category')}
              >
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
              <select
                disabled={isSubmitting}
                className="w-full px-4 py-2.5 text-sm bg-white text-[#1e293b] border border-[#e5e3db] rounded-xl outline-none focus:border-[#1D9E75]"
                {...register('merchant_type')}
              >
                <option value="regular">Regular (Belanja)</option>
                <option value="loket">Loket (Entry Gate)</option>
              </select>
            </div>
          </div>

          <Input
            label="Lokasi Pos Area *"
            placeholder="Contoh: Plaza Utama Kios #1"
            error={errors.location?.message}
            disabled={isSubmitting}
            {...register('location')}
          />

          <Input
            label="Email Owner Merchant *"
            type="email"
            placeholder="owner@zipline.com"
            error={errors.owner_email?.message}
            disabled={isSubmitting}
            {...register('owner_email')}
          />

          <div className="relative">
            <Input
              label="Kata Sandi Owner"
              type={showPassword ? 'text' : 'password'}
              error={errors.owner_password?.message}
              disabled={isSubmitting}
              className="pr-10"
              {...register('owner_password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isSubmitting}
              className="absolute right-3.5 top-[38px] p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
            </button>
          </div>

          <div className="flex gap-2.5 pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsCreateModalOpen(false);
                reset();
              }}
              disabled={isSubmitting}
              className="w-1/3 text-xs border border-[#e5e3db] font-bold"
            >
              Batal
            </Button>
            <Button
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting}
              className="w-2/3 text-xs font-bold"
            >
              Tambah Partner
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Generated Credentials details */}
      <Modal
        isOpen={generatedCredentials !== null}
        onClose={() => setGeneratedCredentials(null)}
        title="Merchant Berhasil Dibuat"
      >
        {generatedCredentials && (
          <div className="flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-full bg-[#E1F5EE] border border-[#1D9E75]/20 flex items-center justify-center text-[#1D9E75] shadow-xs">
              <Key className="h-8 w-8" />
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
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <span>Penting: Pastikan Anda mencatat kredensial di atas sebelum menutup dialog ini.</span>
            </div>

            <Button
              variant="primary"
              onClick={() => setGeneratedCredentials(null)}
              className="w-full text-xs font-bold mt-2"
            >
              Saya Mengerti & Sudah Mencatat
            </Button>
          </div>
        )}
      </Modal>

      {/* Toggle status confirmation dialog */}
      <ConfirmDialog
        isOpen={confirmToggleData !== null}
        onClose={() => setConfirmToggleData(null)}
        onConfirm={handleConfirmToggle}
        title="Ubah Status Merchant"
        message={confirmToggleData ? `Yakin ${confirmToggleData.isActive ? 'nonaktifkan' : 'aktifkan'} merchant ${confirmToggleData.name}? ${confirmToggleData.isActive ? 'Merchant tidak akan bisa mencatat transaksi tap gelang NFC.' : 'Merchant akan aktif kembali untuk tap.'}` : ''}
        confirmLabel={confirmToggleData?.isActive ? 'Nonaktifkan' : 'Aktifkan'}
      />
    </div>
  );
}
