'use client';

import { useEffect, useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaSupport() {
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const updateOnline = () => setOnline(navigator.onLine);
    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };

    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    window.addEventListener('beforeinstallprompt', captureInstall);

    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      void navigator.serviceWorker.register('/sw.js');
    }

    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      window.removeEventListener('beforeinstallprompt', captureInstall);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <>
      {!online && (
        <div className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-md">
          <WifiOff className="h-4 w-4" />
          Koneksi terputus. Transaksi baru dinonaktifkan sampai internet kembali.
        </div>
      )}

      {installPrompt && !installDismissed && online && (
        <div className="fixed bottom-4 left-4 right-4 z-[90] mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-sky-100 bg-white p-3 shadow-xl">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#29ABE2]">
            <Download className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">Instal WAVR</p>
            <p className="text-xs text-slate-500">Akses terminal lebih cepat dari layar utama.</p>
          </div>
          <button onClick={install} className="rounded-lg bg-[#29ABE2] px-3 py-2 text-xs font-bold text-white">
            Instal
          </button>
          <button onClick={() => setInstallDismissed(true)} aria-label="Tutup ajakan instal" className="text-slate-400">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
