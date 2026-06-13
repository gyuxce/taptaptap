'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="id">
      <body>
        <main className="min-h-screen bg-[#f7f7f5] p-6 flex items-center justify-center text-center">
          <div className="w-full max-w-sm rounded-3xl border border-[#e5e3db] bg-white p-8 shadow-xl">
            <h1 className="text-xl font-black text-[#1e293b]">Aplikasi mengalami kendala</h1>
            <p className="mt-2 text-sm text-[#64748b]">
              Error sudah dicatat. Silakan coba memuat ulang aplikasi.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 w-full rounded-xl bg-[#29ABE2] px-4 py-3 text-sm font-bold text-white"
            >
              Coba Lagi
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
