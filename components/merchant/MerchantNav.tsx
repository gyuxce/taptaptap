'use client';

import Link from 'next/link';
import { History, ScanLine, ShoppingCart } from 'lucide-react';

export function MerchantNav({
  active,
  merchantType,
  onHistory,
}: {
  active: 'tap' | 'pos';
  merchantType: 'loket' | 'regular';
  onHistory?: () => void;
}) {
  const item = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-bold';
  return (
    <nav className="z-30 flex shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <Link href="/tap" className={`${item} ${active === 'tap' ? 'text-[#29ABE2]' : 'text-slate-400'}`}>
        <ScanLine className="h-5 w-5" /> {merchantType === 'loket' ? 'Tap Masuk' : 'Tap Cepat'}
      </Link>
      {merchantType === 'regular' && (
        <Link href="/pos" className={`${item} ${active === 'pos' ? 'text-[#29ABE2]' : 'text-slate-400'}`}>
          <ShoppingCart className="h-5 w-5" /> POS
        </Link>
      )}
      <button onClick={onHistory} className={`${item} text-slate-400`}>
        <History className="h-5 w-5" /> Riwayat
      </button>
    </nav>
  );
}
