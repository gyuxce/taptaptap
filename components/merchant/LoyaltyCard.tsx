'use client';

import { Gift, Check } from 'lucide-react';
import type { LoyaltyInfo } from '@/types';

export function LoyaltyCard({
  info,
  loading,
  onRedeem,
}: {
  info: LoyaltyInfo | null;
  loading?: boolean;
  onRedeem?: () => void;
}) {
  if (loading) return <div className="h-28 animate-pulse rounded-2xl bg-emerald-50" />;
  if (!info?.enabled) return null;
  const ready = info.available_rewards > 0;
  return (
    <div className={`rounded-2xl border p-4 ${ready ? 'border-amber-300 bg-amber-50' : 'border-emerald-100 bg-emerald-50'}`}>
      {ready ? (
        <div className="text-center">
          <Gift className="mx-auto h-7 w-7 text-amber-600" />
          <p className="mt-1 text-xs font-black text-amber-800">REWARD TERSEDIA</p>
          <p className="text-sm font-bold text-amber-700">{info.reward}</p>
          <p className="mt-1 text-[10px] text-amber-700">{info.stamp_count} kunjungan tercatat</p>
          {onRedeem && (
            <button onClick={onRedeem} className="mt-3 min-h-11 w-full rounded-xl bg-amber-500 px-4 text-xs font-black text-white">
              Gunakan Reward Sekarang
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: Math.min(info.target, 10) }).map((_, index) => (
              <span key={index} className={`flex h-7 w-7 items-center justify-center rounded-full ${
                index < info.cycle_progress ? 'bg-emerald-600 text-white' : 'border border-dashed border-slate-400 bg-white'
              }`}>
                {index < info.cycle_progress && <Check className="h-4 w-4" />}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs font-bold text-slate-600">
            {info.stamp_count} kunjungan tercatat
          </p>
          <p className="text-[11px] font-semibold text-emerald-700">{info.remaining} lagi untuk {info.reward}</p>
        </>
      )}
    </div>
  );
}
