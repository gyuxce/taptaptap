'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'motion/react';
import { SmartphoneNfc, Mail, Lock, AlertTriangle } from 'lucide-react';

import { loginSchema, LoginInput } from '@/lib/validations';
import { signIn, getSession } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Toaster, toast } from '@/components/ui/Toast';

export default function LoginPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // 1. Session check on load
  useEffect(() => {
    const checkActiveSession = async () => {
      try {
        const sessionData = await getSession();
        if (sessionData && sessionData.profile) {
          const role = sessionData.profile.role;
          if (role === 'admin') {
            router.push('/dashboard');
          } else {
            router.push('/tap');
          }
          router.refresh();
        } else {
          setCheckingSession(false);
        }
      } catch (err) {
        setCheckingSession(false);
      }
    };
    checkActiveSession();
  }, [router]);

  // 2. Submit credentials
  const onSubmit = async (data: LoginInput) => {
    setLoading(true);
    setAuthError(null);
    try {
      const res = await signIn(data.email, data.password);
      if (res.error) {
        setAuthError(res.error);
        toast.error(res.error);
      } else if (res.profile) {
        toast.success(`Selamat datang kembali!`);
        setTimeout(() => {
          if (res.profile?.role === 'admin') {
            router.push('/dashboard');
          } else {
            router.push('/tap');
          }
          router.refresh();
        }, 800);
      }
    } catch (err) {
      setAuthError('Terjadi kesalahan sistem, silakan coba lagi.');
      toast.error('Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  };

  // 3. Demo autofill triggers
  const fillCredentials = (email: string) => {
    setValue('email', email, { shouldValidate: true });
    setValue('password', 'demo1234', { shouldValidate: true });
    setAuthError(null);
    toast.info(`Formulir terisi otomatis!`);
  };

  if (checkingSession) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f7f7f5] p-4 text-[#1e293b]">
      <Toaster position="top-center" richColors />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-[384px] bg-white rounded-3xl p-8 shadow-xl border border-[#e5e3db] flex flex-col gap-6"
      >
        {/* Logo and Intro */}
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#E8F6FD] flex items-center justify-center text-[#29ABE2] mb-4 shadow-xs">
            <SmartphoneNfc className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-[#1e293b]">
            WAVR
          </h1>
          <p className="text-xs text-[#64748b] mt-1 font-medium">
            One Wave, Endless Experience
          </p>
        </div>

        {/* Dynamic Error Message */}
        <AnimatePresence>
          {authError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold p-3.5 rounded-xl flex items-start gap-2.5 leading-relaxed">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Credentials Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Input
            label="Alamat Email"
            type="email"
            placeholder="nama@wavr.com"
            error={errors.email?.message}
            icon={<Mail className="h-4 w-4" />}
            disabled={loading}
            {...register('email')}
          />

          <Input
            label="Kata Sandi"
            type="password"
            placeholder="••••••••"
            error={errors.password?.message}
            icon={<Lock className="h-4 w-4" />}
            disabled={loading}
            {...register('password')}
          />

          <Button
            type="submit"
            loading={loading}
            disabled={loading}
            fullWidth
            className="mt-2 text-sm font-bold"
          >
            Masuk Sekarang
          </Button>
        </form>

        {/* Quick Demo Autofill helper */}
        {!isSupabaseConfigured && (
          <div className="bg-[#fcfbf9] border border-dashed border-[#e5e3db] rounded-2xl p-4 flex flex-col gap-3 mt-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#29ABE2] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#29ABE2] animate-pulse" />
              Demo Quick Fill (Offline Mode)
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => fillCredentials('admin@wavr.com')}
                disabled={loading}
                className="w-full flex items-center justify-between p-2.5 bg-white border border-[#e5e3db] hover:border-[#29ABE2]/30 hover:bg-[#E8F6FD] rounded-xl text-left transition-all text-xs cursor-pointer disabled:opacity-50"
              >
                <div>
                  <p className="font-bold text-[#1e293b]">Administrator</p>
                  <p className="text-[10px] text-gray-500 font-mono">admin@wavr.com</p>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                  Admin
                </span>
              </button>

              <button
                type="button"
                onClick={() => fillCredentials('zipline@wavr.com')}
                disabled={loading}
                className="w-full flex items-center justify-between p-2.5 bg-white border border-[#e5e3db] hover:border-[#29ABE2]/30 hover:bg-[#E8F6FD] rounded-xl text-left transition-all text-xs cursor-pointer disabled:opacity-50"
              >
                <div>
                  <p className="font-bold text-[#1e293b]">Merchant Loket</p>
                  <p className="text-[10px] text-gray-500 font-mono">zipline@wavr.com</p>
                </div>
                <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                  Loket
                </span>
              </button>

              <button
                type="button"
                onClick={() => fillCredentials('cafe@wavr.com')}
                disabled={loading}
                className="w-full flex items-center justify-between p-2.5 bg-white border border-[#e5e3db] hover:border-[#29ABE2]/30 hover:bg-[#E8F6FD] rounded-xl text-left transition-all text-xs cursor-pointer disabled:opacity-50"
              >
                <div>
                  <p className="font-bold text-[#1e293b]">Merchant Regular</p>
                  <p className="text-[10px] text-gray-500 font-mono">cafe@wavr.com</p>
                </div>
                <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                  Regular
                </span>
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
