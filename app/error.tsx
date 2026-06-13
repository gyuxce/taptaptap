'use client';

import React, { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useRouter } from 'next/navigation';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    Sentry.captureException(error);
    console.error('Global Error Boundary caught:', error);
  }, [error]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f7f7f5] p-6 text-[#1e293b]">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl border border-[#e5e3db] flex flex-col items-center text-center gap-6">
        <div className="w-16 h-16 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-500 shadow-sm">
          <AlertCircle className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-extrabold tracking-tight text-[#1e293b]">
            Terjadi Kesalahan Sistem
          </h2>
          <p className="text-xs text-[#64748b] leading-relaxed max-w-sm">
            Kami memohon maaf atas ketidaknyamanan ini. Sistem mendeteksi kendala saat memuat halaman. Silakan coba memuat ulang halaman.
          </p>
          {error.message && (
            <p className="text-[11px] font-mono bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-red-600 mt-2 text-left break-all select-all">
              Detail: {error.message}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full mt-2">
          <Button
            onClick={() => reset()}
            variant="primary"
            className="w-full text-xs font-bold flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Coba Lagi
          </Button>
          <Button
            onClick={() => {
              router.push('/');
              router.refresh();
            }}
            variant="ghost"
            className="w-full text-xs font-bold flex items-center gap-2 border border-[#e5e3db] bg-[#f7f7f5] hover:bg-slate-100 text-[#1e293b]"
          >
            <Home className="h-4 w-4" />
            Kembali ke Home
          </Button>
        </div>
      </div>
    </div>
  );
}
