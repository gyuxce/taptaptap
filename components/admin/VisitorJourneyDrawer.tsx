'use client';

import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { X, Calendar, MapPin, Clock, Compass, ShoppingBag } from 'lucide-react';
import { Visitor, JourneyItem, JourneyStats } from '@/types';
import { getVisitorJourney } from '@/lib/services/visitorService';
import { formatRupiah } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/components/ui/Toast';

interface VisitorJourneyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  visitor: Visitor | null;
}

export const VisitorJourneyDrawer: React.FC<VisitorJourneyDrawerProps> = ({
  isOpen,
  onClose,
  visitor,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [journey, setJourney] = useState<JourneyItem[]>([]);
  const [stats, setStats] = useState<JourneyStats | null>(null);
  const [loading, setLoading] = useState(false);

  // Set date to today when drawer opens
  useEffect(() => {
    if (isOpen && visitor) {
      setSelectedDate(new Date().toISOString().split('T')[0]);
    }
  }, [isOpen, visitor]);

  const loadJourneyData = useCallback(async () => {
    if (!visitor) return;
    setLoading(true);
    try {
      const res = await getVisitorJourney(visitor.id, selectedDate);
      if (res.error) {
        toast.error(res.error);
      } else {
        setJourney(res.journey || []);
        setStats(res.stats || null);
      }
    } catch {
      toast.error('Gagal mengambil data journey');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, visitor]);

  // Load journey data when date or visitor changes
  useEffect(() => {
    if (isOpen && visitor && selectedDate) {
      void loadJourneyData();
    }
  }, [isOpen, visitor, selectedDate, loadJourneyData]);

  // Category Color mapping for Timeline Dots
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Loket/Gerbang':
        return 'bg-gray-400';
      case 'Adventure':
        return 'bg-red-500';
      case 'F&B':
        return 'bg-amber-500';
      case 'Retail':
        return 'bg-blue-500';
      case 'Sightseeing':
        return 'bg-green-500';
      default:
        return 'bg-slate-400';
    }
  };

  // Compute spend list per merchant
  const merchantSpends = useMemo(() => {
    const spends: Record<string, { category: string; amount: number }> = {};
    journey.forEach(item => {
      if (item.type === 'payment') {
        if (!spends[item.merchant_name]) {
          spends[item.merchant_name] = { category: item.merchant_category, amount: 0 };
        }
        spends[item.merchant_name].amount += item.amount;
      }
    });

    return Object.entries(spends)
      .map(([name, { category, amount }]) => ({ name, category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [journey]);

  const maxSpend = useMemo(() => {
    return merchantSpends.length > 0 ? merchantSpends[0].amount : 0;
  }, [merchantSpends]);

  if (!isOpen) return null;

  return (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <button
            aria-label="Tutup detail perjalanan"
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/45 animate-overlay-in"
          />

          {/* Drawer Panel */}
          <div className="relative z-10 flex h-full w-full flex-col overflow-hidden border-l border-[#E2EEFF] bg-[#F8FAFF] shadow-xl animate-drawer-in transform-gpu will-change-transform sm:w-[400px]">
            {/* Header */}
            <div className="p-5 bg-white border-b border-[#E2EEFF] flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3 text-left">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 font-black flex items-center justify-center text-xs text-indigo-700">
                    {visitor ? visitor.name.substring(0, 2).toUpperCase() : 'WS'}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-[#1B2340] text-sm leading-tight">
                      {visitor?.name}
                    </h3>
                    <div className="mt-1">
                      <Badge variant={visitor?.ticket_type}>{visitor?.ticket_type}</Badge>
                    </div>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-[#1B2340] hover:bg-[#E8F6FD] transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Datepicker Selection */}
              <div className="flex items-center gap-2 bg-[#f7f7f5] px-3 py-2 border border-[#e5e3db] rounded-xl">
                <Calendar className="h-4 w-4 text-[#64748b] shrink-0" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full text-xs font-bold text-[#1e293b] bg-transparent outline-none cursor-pointer"
                />
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              
              {loading ? (
                /* Loading State */
                <div className="space-y-4 animate-pulse">
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-16 bg-white border border-[#e5e3db] rounded-xl" />
                    ))}
                  </div>
                  <div className="h-64 bg-white border border-[#e5e3db] rounded-3xl" />
                </div>
              ) : journey.length === 0 ? (
                /* Empty State */
                <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-gray-400">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-[#1e293b]">Belum ada aktivitas</p>
                    <p className="text-[11px] text-[#64748b]">Tidak ada aktivitas tap terdeteksi pada tanggal ini.</p>
                  </div>
                </div>
              ) : (
                /* Content display */
                <>
                  {/* Stats Grid */}
                  {stats && (
                    <div className="grid grid-cols-4 gap-2">
                      <div className="bg-white border border-[#e5e3db] p-2.5 rounded-xl text-center">
                        <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider block">Total Tap</span>
                        <span className="text-sm font-black text-[#1e293b] mt-0.5 block">{stats.total_taps}</span>
                      </div>
                      <div className="bg-white border border-[#e5e3db] p-2.5 rounded-xl text-center">
                        <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider block">Spend</span>
                        <span className="text-xs font-black text-green-600 mt-1 block truncate" title={formatRupiah(stats.total_spend)}>
                          {stats.total_spend >= 1000 ? `${(stats.total_spend / 1000)}k` : stats.total_spend}
                        </span>
                      </div>
                      <div className="bg-white border border-[#e5e3db] p-2.5 rounded-xl text-center">
                        <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider block">Durasi</span>
                        <span className="text-xs font-black text-[#1e293b] mt-1 block truncate">
                          {stats.duration_minutes > 0 ? `${stats.duration_minutes}m` : '-'}
                        </span>
                      </div>
                      <div className="bg-white border border-[#e5e3db] p-2.5 rounded-xl text-center">
                        <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider block">Merchant</span>
                        <span className="text-sm font-black text-[#1e293b] mt-0.5 block">{stats.merchants_visited.length}</span>
                      </div>
                    </div>
                  )}

                  {/* Vertical Timeline */}
                  <div className="bg-white border border-[#e5e3db] rounded-3xl p-5 shadow-xs">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-[#64748b] border-b border-[#e5e3db] pb-3 mb-5 flex items-center gap-1.5">
                      <Compass className="h-3.5 w-3.5 text-indigo-500" /> Rute Perjalanan Wisata
                    </h4>

                    <div className="relative pl-6 border-l border-slate-200/80 space-y-6 text-left">
                      {journey.map((item) => (
                        <div key={item.transaction_id} className="relative">
                          {/* Colored category dot */}
                          <span className={`absolute -left-[30px] top-1 w-3 h-3 rounded-full border-2 border-white ring-2 ring-transparent flex items-center justify-center ${getCategoryColor(item.merchant_category)}`} />
                          
                          {/* Details */}
                          <div>
                            <span className="text-[9px] font-bold text-gray-400 font-mono flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <h5 className="text-xs font-bold text-[#1e293b] mt-0.5">
                              {item.merchant_name}
                            </h5>
                            <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                              {item.merchant_category} • {item.type === 'entry' ? (
                                <span className="text-[#29ABE2] font-semibold">Tap Masuk</span>
                              ) : (
                                <span className="text-red-500 font-semibold">{formatRupiah(item.amount)}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Spend Summary per Merchant */}
                  {merchantSpends.length > 0 && (
                    <div className="bg-white border border-[#e5e3db] rounded-3xl p-5 shadow-xs text-left">
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-[#64748b] border-b border-[#e5e3db] pb-3 mb-4 flex items-center gap-1.5">
                        <ShoppingBag className="h-3.5 w-3.5 text-indigo-500" /> Ringkasan Spend
                      </h4>

                      <div className="space-y-3">
                        {merchantSpends.map(item => {
                          const widthPercent = maxSpend > 0 ? (item.amount / maxSpend) * 100 : 0;
                          return (
                            <div key={item.name} className="space-y-1">
                              <div className="flex justify-between text-[10px] font-bold text-[#1e293b]">
                                <span className="truncate max-w-[200px]">{item.name}</span>
                                <span>{formatRupiah(item.amount)}</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${getCategoryColor(item.category)}`}
                                  style={{ width: `${widthPercent}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

            </div>
          </div>
        </div>
  );
};
