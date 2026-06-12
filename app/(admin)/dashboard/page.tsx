'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { db } from '@/lib/supabase';
import { Visitor, Merchant, Transaction } from '@/types';
import { formatRupiah, formatDatetime } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line } from 'recharts';
import { Users, Store, CreditCard, Activity, TrendingUp, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import { checkMerchantActivity, SilentMerchant } from '@/lib/services/alertService';
import { RealtimeFeed, FeedItem } from '@/components/admin/RealtimeFeed';
import { motion } from 'motion/react';

export default function AdminDashboardPage() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Live KPI counters
  const [liveRevenue, setLiveRevenue] = useState(0);
  const [liveTapsCount, setLiveTapsCount] = useState(0);
  const [silentMerchants, setSilentMerchants] = useState<SilentMerchant[]>([]);

  useEffect(() => {
    loadDashboardData(false);
    
    // Fallback: auto-refresh stats every 5 minutes
    const timer = setInterval(() => {
      loadDashboardData(true);
    }, 300000);

    return () => clearInterval(timer);
  }, []);

  const checkAlerts = async () => {
    try {
      const activeAlerts = await checkMerchantActivity();
      setSilentMerchants(activeAlerts);
    } catch (err) {
      console.warn('[Dashboard] failed to load silent merchant alerts:', err);
    }
  };

  useEffect(() => {
    checkAlerts();
    const alertTimer = setInterval(() => {
      checkAlerts();
    }, 15 * 60 * 1000); // scan every 15 mins

    return () => clearInterval(alertTimer);
  }, []);

  const loadDashboardData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const vis = await db.getVisitors();
      const mer = await db.getMerchants();
      const txs = await db.getTransactions();
      
      setVisitors(vis);
      setMerchants(mer);
      setTransactions(txs);

      // Set initial live counters
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayTimestamp = todayStart.getTime();

      const todayTxs = txs.filter(t => new Date(t.created_at).getTime() >= todayTimestamp);
      setLiveTapsCount(todayTxs.length);
      setLiveRevenue(todayTxs.filter(t => t.type === 'payment').reduce((sum, tx) => sum + tx.amount, 0));
    } catch (err) {
      toast.error('Gagal memuat statistik dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleNewRealtimeTransaction = (tx: FeedItem) => {
    // 1. Prepend to local transaction logs
    setTransactions(prev => {
      if (prev.some(t => t.id === tx.id)) return prev;
      const newTx: Transaction = {
        id: tx.id,
        rfid_uid: '',
        merchant_id: '',
        type: tx.type,
        amount: tx.amount,
        created_at: tx.created_at,
        whatsapp_status: 'sent',
        visitor_name: tx.visitor_name,
        merchant_name: tx.merchant_name,
        ticket_type: 'Regular'
      };
      return [newTx, ...prev];
    });

    // 2. Increment counters
    if (tx.type === 'payment') {
      setLiveRevenue(prev => prev + tx.amount);
    }
    setLiveTapsCount(prev => prev + 1);

    // 3. Re-evaluate alerts
    checkAlerts();
  };

  // Metrics Calculations
  const totalVisitors = visitors.length;
  const activeMerchants = merchants.filter(m => m.is_active).length;
  
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTimestamp = todayStart.getTime();

  const todayTxs = useMemo(() => {
    return transactions.filter(t => new Date(t.created_at).getTime() >= todayTimestamp);
  }, [transactions, todayTimestamp]);

  const todayTapsCount = todayTxs.length;

  const todayRevenue = useMemo(() => {
    return todayTxs
      .filter(t => t.type === 'payment')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [todayTxs]);

  // Hourly Line Chart Data today
  const hourlyChartData = useMemo(() => {
    const hours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'];
    const hourlyCounts: { [label: string]: number } = {};
    hours.forEach(h => {
      hourlyCounts[h] = 0;
    });

    todayTxs.forEach(tx => {
      const txHour = new Date(tx.created_at).getHours();
      let matchedLabel = '18:00';
      if (txHour < 9) matchedLabel = '08:00';
      else if (txHour < 11) matchedLabel = '10:00';
      else if (txHour < 13) matchedLabel = '12:00';
      else if (txHour < 15) matchedLabel = '14:00';
      else if (txHour < 17) matchedLabel = '16:00';

      if (hourlyCounts[matchedLabel] !== undefined) {
        hourlyCounts[matchedLabel]++;
      }
    });

    return Object.entries(hourlyCounts).map(([hour, count]) => ({
      name: hour,
      count
    }));
  }, [todayTxs]);

  // Weekly Revenue Bar Chart data (7 days)
  const weeklyRevenueChartData = useMemo(() => {
    const revenueByDay: { [date: string]: number } = {};
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    last7Days.forEach(day => {
      revenueByDay[day] = 0;
    });

    transactions.forEach(tx => {
      if (tx.type === 'payment') {
        const day = tx.created_at.split('T')[0];
        if (revenueByDay[day] !== undefined) {
          revenueByDay[day] += tx.amount;
        }
      }
    });

    return Object.entries(revenueByDay).map(([date, revenue]) => {
      const parts = date.split('-');
      return {
        date: `${parts[2]}/${parts[1]}`, // DD/MM format
        revenue
      };
    });
  }, [transactions]);

  const hasNoWeeklyRevenue = useMemo(() => {
    return weeklyRevenueChartData.every(item => item.revenue === 0);
  }, [weeklyRevenueChartData]);


  if (loading) {
    return (
      <div className="flex flex-col gap-6 w-full animate-pulse">
        <div className="h-8 w-48 bg-slate-200 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-28 bg-white border border-[#e5e3db] rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-72 bg-white border border-[#e5e3db] rounded-2xl lg:col-span-2" />
          <div className="h-72 bg-white border border-[#e5e3db] rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 text-left items-start w-full">
      
      {/* Left Area - Dashboard main controls (2/3 width) */}
      <div className="flex-grow flex flex-col gap-6 w-full min-w-0">
        
        {/* Alert Banner System for Silent Merchants */}
        {silentMerchants.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-3xl p-4 flex flex-col items-start gap-3 text-amber-800 text-xs font-bold leading-normal w-full">
            <div className="flex items-start gap-2.5 w-full">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 text-left">
                <span>
                  {silentMerchants.length}{' '}merchant belum ada aktivitas &gt; 2 jam:
                </span>
                <span className="font-black ml-1 text-slate-800 break-words block mt-0.5">
                  {silentMerchants.slice(0, 5).map(m => m.name).join(', ')}
                  {silentMerchants.length > 5 && ` dan ${silentMerchants.length - 5} lainnya`}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 w-full items-center mt-1">
              {silentMerchants.slice(0, 5).map(m => (
                <a
                  key={m.id}
                  href={`https://wa.me/6281234567890?text=Halo%20${encodeURIComponent(m.name)}%20Partner%20EcoTour.%20Sistem%20mendeteksi%20belum%20ada%20aktivitas%20tap%20selama%202%20jam%20terakhir.%20Apakah%20ada%20kendala%20alat%20tap%3F`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[9px] font-extrabold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                >
                  Hubungi {m.name} via WA
                </a>
              ))}
              {silentMerchants.length > 5 && (
                <span className="text-[10px] text-amber-700 font-extrabold bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-xl shrink-0">
                  + {silentMerchants.length - 5} lainnya
                </span>
              )}
            </div>
          </div>
        )}

        {/* Intro Header */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-[#1D9E75] uppercase tracking-wider block">
              Dashboard Real-time
            </span>
            <h1 className="text-xl md:text-2xl font-black text-[#1e293b] mt-0.5">
              Analisis Pendapatan & Gelang RFID
            </h1>
          </div>
          <button
            onClick={() => loadDashboardData(false)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-bold bg-white border border-[#e5e3db] px-3.5 py-2 rounded-xl text-[#1e293b] cursor-pointer hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            label="Total Wisatawan"
            value={totalVisitors}
            subtext="Gelang RFID Terdaftar"
            tone="blue"
            icon={<Users className="h-5.5 w-5.5" />}
          />
          <StatCard
            label="Merchant Terintegrasi"
            value={`${activeMerchants} Aktif`}
            subtext="Dari total 50+ merchant partner"
            tone="amber"
            icon={<Store className="h-5.5 w-5.5" />}
          />
          <StatCard
            label="Transaksi Hari Ini"
            value={
              <motion.span
                key={liveTapsCount}
                initial={{ scale: 0.8, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                className="inline-block"
              >
                {liveTapsCount} Taps
              </motion.span>
            }
            subtext="Volume tapping masuk & belanja"
            tone="green"
            icon={<Activity className="h-5.5 w-5.5" />}
          />
          <StatCard
            label="Revenue Hari Ini"
            value={
              <motion.span
                key={liveRevenue}
                initial={{ scale: 0.8, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                className="inline-block"
              >
                {formatRupiah(liveRevenue)}
              </motion.span>
            }
            subtext="Total pendapatan souvenir digital"
            tone="green"
            icon={<CreditCard className="h-5.5 w-5.5" />}
          />
        </div>

        {/* Charts Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Weekly Revenue Bar Chart */}
          <div className="bg-white border border-[#e5e3db] rounded-2xl p-6 shadow-xs lg:col-span-2 flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-black text-[#1e293b] uppercase tracking-wide">
                Volume Belanja Souvenir (7 Hari)
              </h3>
              <p className="text-xs text-[#64748b] mt-0.5">
                Kontribusi harian transaksi tap dari wisatawan
              </p>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyRevenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e3db" />
                  <XAxis dataKey="date" fontSize={10} stroke="#64748b" />
                  <YAxis 
                    fontSize={10} 
                    stroke="#64748b" 
                    domain={hasNoWeeklyRevenue ? [0, 10000] : [0, 'auto']} 
                    tickFormatter={(v) => v === 0 ? 'Rp0' : v % 1000 === 0 ? `Rp${v/1000}k` : `Rp${(v/1000).toFixed(1)}k`} 
                  />
                  <Tooltip formatter={(v) => formatRupiah(Number(v))} contentStyle={{ fontSize: 11, borderRadius: 12 }} />
                  <Bar dataKey="revenue" fill="#1D9E75" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Hourly Transaction Line Chart */}
          <div className="bg-white border border-[#e5e3db] rounded-2xl p-6 shadow-xs flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-black text-[#1e293b] uppercase tracking-wide">
                Aktivitas Tap Hari Ini
              </h3>
              <p className="text-xs text-[#64748b] mt-0.5">
                Frekuensi pemindaian gelang RFID per jam
              </p>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hourlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e3db" />
                  <XAxis dataKey="name" fontSize={10} stroke="#64748b" />
                  <YAxis fontSize={10} stroke="#64748b" />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 12 }} />
                  <Line type="monotone" dataKey="count" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Recent Activity Table */}
        <div className="bg-white border border-[#e5e3db] rounded-2xl p-6 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[#e5e3db] pb-4">
            <div>
              <h3 className="text-sm font-black text-[#1e293b] uppercase tracking-wide">
                Aktivitas Tap Terbaru
              </h3>
              <p className="text-xs text-[#64748b] mt-0.5">
                Daftar 10 riwayat transaksi tap terupdate masuk pintu & lokasi belanja
              </p>
            </div>
            <Badge variant="success">LIVE UPDATE</Badge>
          </div>

          <div className="overflow-x-auto min-w-0">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#e5e3db] text-[#64748b] font-bold uppercase tracking-wider">
                  <th className="pb-3.5">Waktu</th>
                  <th className="pb-3.5">Wisatawan</th>
                  <th className="pb-3.5">Merchant / Loket</th>
                  <th className="pb-3.5">Tipe</th>
                  <th className="pb-3.5 text-right">Nominal</th>
                  <th className="pb-3.5 text-center">WA Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 10).map((tx) => (
                  <tr key={tx.id} className="border-b border-[#f7f7f5] hover:bg-[#f7f7f5]/45 transition-colors">
                    <td className="py-3 font-medium text-gray-500">{formatDatetime(tx.created_at)}</td>
                    <td className="py-3 font-bold text-[#1e293b]">{tx.visitor_name}</td>
                    <td className="py-3 text-[#64748b] font-semibold">{tx.merchant_name}</td>
                    <td className="py-3">
                      <Badge variant={tx.type === 'entry' ? 'VIP' : 'Regular'}>
                        {tx.type === 'entry' ? 'Entry' : 'Belanja'}
                      </Badge>
                    </td>
                    <td className={`py-3 text-right font-black ${tx.type === 'entry' ? 'text-gray-400' : 'text-red-600'}`}>
                      {tx.type === 'entry' ? 'Entry' : `-${formatRupiah(tx.amount)}`}
                    </td>
                    <td className="py-3 text-center">
                      <Badge variant={
                        tx.whatsapp_status === 'sent' 
                          ? 'success' 
                          : tx.whatsapp_status === 'pending'
                          ? 'pending'
                          : tx.whatsapp_status === 'failed'
                          ? 'error'
                          : 'neutral'
                      }>
                        {tx.whatsapp_status === 'sent' 
                          ? 'Sent' 
                          : tx.whatsapp_status === 'pending'
                          ? 'Pending'
                          : tx.whatsapp_status === 'failed'
                          ? 'Failed'
                          : 'N/A'}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-400">
                      Belum ada data transaksi
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Right Area - Live feed sidebar (1/3 width) */}
      <RealtimeFeed onNewTransaction={handleNewRealtimeTransaction} />

    </div>
  );
}
