'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, AlertTriangle } from 'lucide-react';

import { loginSchema, LoginInput } from '@/lib/validations';
import { signIn, getSession } from '@/lib/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Toaster, toast } from '@/components/ui/Toast';
import { WavrLogo } from '@/components/ui/WavrLogo';

export default function LoginPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
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
            router.replace('/dashboard');
          } else {
            router.replace('/tap');
          }
        } else {
          setCheckingSession(false);
        }
      } catch {
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
            router.replace('/dashboard');
          } else {
            router.replace('/tap');
          }
        }, 800);
      }
    } catch {
      setAuthError('Terjadi kesalahan sistem, silakan coba lagi.');
      toast.error('Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
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
          <div className="rounded-full bg-[#E8F6FD] p-5 flex items-center justify-center mb-4 shrink-0 shadow-xs">
            <WavrLogo variant="icon" size="lg" />
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

      </motion.div>
    </div>
  );
}
