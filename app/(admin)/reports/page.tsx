'use client';
import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { db, supabase } from '@/lib/supabase';
import { Merchant, Transaction } from '@/types';
import { formatRupiah, formatDatetime } from '@/lib/utils';
import { getRevenueReport, getDailyRevenue, generateMerchantCommissionReport, RevenueReportItem, DailyRevenueItem } from '@/lib/services/reportService';
import { toLocalDateRangeIso } from '@/lib/reportDate';
import { generateCSV, TRANSACTION_COLUMNS, COMMISSION_COLUMNS, CSVColumn } from '@/lib/utils/exportUtils';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { Toaster, toast } from '@/components/ui/Toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Calendar, Filter, Download, Store, Activity, TrendingUp, FileSpreadsheet, ChevronDown, Check, RefreshCw } from 'lucide-react';
const MERCHANT_SUMMARY_COLUMNS: CSVColumn[] = [
    { key: 'name', label: 'Nama Merchant' },
    { key: 'category', label: 'Kategori' },
    { key: 'location', label: 'Lokasi' },
    { key: 'total_taps', label: 'Total Tap' },
    { key: 'unique_visitors', label: 'Pengunjung Unik' },
    { key: 'total_revenue', label: 'Total Pendapatan' }
];
export default function ReportsPage() {
    const [merchants, setMerchants] = useState<Merchant[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtering, setFiltering] = useState(false);
    // Filter States
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selectedMerchantIds, setSelectedMerchantIds] = useState<string[]>([]);
    const [ticketType, setTicketType] = useState('all');
    // UI States
    const [merchantDropdownOpen, setMerchantDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    // Report Data
    const [revenueReport, setRevenueReport] = useState<RevenueReportItem[]>([]);
    const [chartData, setChartData] = useState<DailyRevenueItem[]>([]);
    // Initialize dates: last 30 days
    useEffect(() => {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        setDateFrom(thirtyDaysAgo.toISOString().split('T')[0]);
        setDateTo(today.toISOString().split('T')[0]);
    }, []);
    // Close dropdown on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setMerchantDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    // Fetch initial configuration (merchants list)
    useEffect(() => {
        async function initPage() {
            try {
                const mer = await db.getMerchants();
                // Sort active merchants first
                const sortedMerchants = [...mer].sort((a, b) => {
                    if (a.is_active && !b.is_active)
                        return -1;
                    if (!a.is_active && b.is_active)
                        return 1;
                    return a.name.localeCompare(b.name);
                });
                setMerchants(sortedMerchants);
            }
            catch {
                toast.error('Gagal memuat daftar merchant');
            }
        }
        initPage();
    }, []);
    const handleApplyFilters = useCallback(async (isSilent = false) => {
        if (!isSilent)
            setFiltering(true);
        try {
            const range = toLocalDateRangeIso(dateFrom, dateTo);
            // 1. Fetch grouped revenue report
            const rep = await getRevenueReport({
                dateFrom: range.dateFrom,
                dateTo: range.dateTo,
                merchantIds: selectedMerchantIds.length > 0 ? selectedMerchantIds : undefined,
                ticketType
            });
            setRevenueReport(rep);
            // 2. Fetch daily chart trends
            const chart = await getDailyRevenue(dateFrom, dateTo, selectedMerchantIds.length > 0 ? selectedMerchantIds : undefined);
            setChartData(chart);
            if (!isSilent) {
                toast.success('Laporan berhasil diperbarui');
            }
        }
        catch {
            toast.error('Gagal mengambil data laporan');
        }
        finally {
            setLoading(false);
            setFiltering(false);
        }
    }, [dateFrom, dateTo, selectedMerchantIds, ticketType]);
    // Run filters query when dates are set and merchants are ready
    useEffect(() => {
        if (dateFrom && dateTo && merchants.length > 0) {
            void handleApplyFilters(true);
        }
    }, [dateFrom, dateTo, merchants.length, handleApplyFilters]);
    // Metrics summary
    const summary = useMemo(() => {
        const totalRevenue = revenueReport.reduce((sum, item) => sum + item.total_revenue, 0);
        const totalTaps = revenueReport.reduce((sum, item) => sum + item.total_taps, 0);
        // Average Daily Revenue
        const start = new Date(dateFrom);
        const end = new Date(dateTo);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
        const avgDailyRevenue = totalRevenue / diffDays;
        // Best merchant
        const bestMerchant = revenueReport.length > 0 ? revenueReport[0] : null;
        return {
            totalRevenue,
            totalTaps,
            avgDailyRevenue,
            bestMerchantName: bestMerchant ? bestMerchant.name : '-',
            bestMerchantRevenue: bestMerchant ? bestMerchant.total_revenue : 0
        };
    }, [revenueReport, dateFrom, dateTo]);
    // Export commission sheet for a merchant
    const handleExportCommission = async (merchantId: string, merchantName: string) => {
        try {
            const rep = await generateMerchantCommissionReport(merchantId, dateFrom, dateTo);
            if (!rep) {
                toast.error('Gagal membuat laporan komisi');
                return;
            }
            if (rep.breakdown.length === 0) {
                toast.error('Tidak ada data komisi pada rentang tanggal terpilih');
                return;
            }
            const filename = `komisi_${merchantName.toLowerCase().replace(/\s+/g, '_')}_${dateFrom}_to_${dateTo}.csv`;
            generateCSV(rep.breakdown, COMMISSION_COLUMNS, filename);
            toast.success(`Laporan komisi ${merchantName} berhasil diunduh`);
        }
        catch {
            toast.error('Terjadi kesalahan ekspor komisi');
        }
    };
    // Export all transaction details matching filters
    const handleExportAllTransactions = async () => {
        try {
            let txs: Transaction[] = [];
            const range = toLocalDateRangeIso(dateFrom, dateTo);
            let query = supabase
                .from('transactions')
                .select('*, merchant:merchants(name)')
                .gte('created_at', range.dateFrom)
                .lte('created_at', range.dateTo);
            if (selectedMerchantIds.length > 0) {
                query = query.in('merchant_id', selectedMerchantIds);
            }
            const { data, error } = await query.order('created_at', { ascending: false });
            if (error)
                throw error;
            const rows = (data || []) as unknown as Array<{
                id: string;
                rfid_uid: string;
                merchant_id: string;
                type: Transaction['type'];
                amount: number | string;
                created_at: string;
                whatsapp_status: Transaction['whatsapp_status'];
                merchant?: { name?: string } | null;
            }>;
            const uniqueUids = [...new Set(rows.map(tx => tx.rfid_uid).filter(Boolean))];
            const visitorByUid = new Map<string, { name?: string; ticket_type?: string }>();
            if (uniqueUids.length > 0) {
                const { data: tagData, error: tagError } = await supabase
                    .from('rfid_tags')
                    .select('uid, visitor:visitors(name, ticket_type)')
                    .in('uid', uniqueUids);
                if (tagError)
                    throw tagError;
                (tagData || []).forEach(tag => {
                    const visitor = tag.visitor as unknown as { name?: string; ticket_type?: string } | null;
                    if (visitor)
                        visitorByUid.set(tag.uid, visitor);
                });
            }
            txs = rows.map(tx => {
                const vInfo = visitorByUid.get(tx.rfid_uid);
                return {
                    id: tx.id,
                    rfid_uid: tx.rfid_uid,
                    merchant_id: tx.merchant_id,
                    type: tx.type,
                    amount: Number(tx.amount),
                    created_at: tx.created_at,
                    whatsapp_status: tx.whatsapp_status,
                    visitor_name: vInfo?.name || 'Unknown',
                    ticket_type: vInfo?.ticket_type || 'Regular',
                    merchant_name: tx.merchant?.name || 'Unknown'
                };
            });
            // Filter by ticket type
            if (ticketType !== 'all') {
                txs = txs.filter(t => t.ticket_type === ticketType);
            }
            if (txs.length === 0) {
                toast.error('Tidak ada data transaksi ditemukan untuk filter ini');
                return;
            }
            // Format amounts to simple numbers without text/symbols
            const formattedTxs = txs.map(t => ({
                ...t,
                created_at: formatDatetime(t.created_at),
                amount: t.amount // keep numeric
            }));
            generateCSV(formattedTxs, TRANSACTION_COLUMNS, `laporan_transaksi_${dateFrom}_to_${dateTo}.csv`);
            toast.success('Daftar transaksi berhasil diexport');
        }
        catch {
            toast.error('Gagal mengekspor transaksi');
        }
    };
    // Export merchant summary overview
    const handleExportMerchantSummary = () => {
        if (revenueReport.length === 0) {
            toast.error('Tidak ada ringkasan merchant untuk diexport');
            return;
        }
        generateCSV(revenueReport, MERCHANT_SUMMARY_COLUMNS, `ringkasan_merchant_${dateFrom}_to_${dateTo}.csv`);
        toast.success('Ringkasan merchant berhasil diexport');
    };
    // Dynamic series mapping colors for Recharts Bar Chart
    const COLORS = ['#29ABE2', '#3B82F6', '#6366F1', '#EC4899', '#F59E0B', '#10B981', '#8B5CF6'];
    // Identify all keys in chart data that are dynamic merchant names
    const chartSeries = useMemo(() => {
        if (chartData.length === 0)
            return [];
        return Object.keys(chartData[0]).filter(k => k !== 'date');
    }, [chartData]);
    const hasNoChartRevenue = useMemo(() => {
        return chartData.every(item => {
            return Object.entries(item).every(([key, val]) => {
                if (key === 'date')
                    return true;
                return typeof val === 'number' ? val === 0 : true;
            });
        });
    }, [chartData]);
    // Dropdown merchant toggle logic
    const handleSelectMerchant = (id: string) => {
        setSelectedMerchantIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(mId => mId !== id);
            }
            else {
                return [...prev, id];
            }
        });
    };
    const selectAllMerchants = () => {
        setSelectedMerchantIds(merchants.map(m => m.id));
    };
    const clearSelectedMerchants = () => {
        setSelectedMerchantIds([]);
    };
    if (loading) {
        return (<div className="flex flex-col gap-6 w-full animate-pulse text-left">
        <div className="h-8 w-64 bg-slate-200 rounded"/>
        <div className="h-16 w-full bg-slate-200 rounded-2xl"/>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, idx) => (<div key={idx} className="h-28 bg-white border border-[#e5e3db] rounded-2xl"/>))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-80 bg-white border border-[#e5e3db] rounded-2xl lg:col-span-2"/>
          <div className="h-80 bg-white border border-[#e5e3db] rounded-2xl"/>
        </div>
      </div>);
    }
    return (<div className="flex flex-col gap-6 text-left w-full min-w-0">
      
      {/* Intro Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-[#29ABE2] uppercase tracking-wider block">
            Panel Administrator
          </span>
          <h1 className="text-xl md:text-2xl font-black text-[#1e293b] mt-0.5">
            Laporan Analisis & Rekap Komisi
          </h1>
        </div>
        
        {/* Batch Export Options */}
        <div className="flex flex-wrap gap-2">
          <button onClick={handleExportMerchantSummary} className="flex items-center gap-1.5 text-xs font-bold bg-white border border-[#e5e3db] px-3.5 py-2.5 rounded-xl text-slate-700 cursor-pointer hover:bg-slate-100 transition-all">
            <Download className="h-4 w-4 text-slate-500"/>
            <span>Unduh Ringkasan</span>
          </button>
          
          <button onClick={handleExportAllTransactions} className="flex items-center gap-1.5 text-xs font-bold bg-[#1e293b] hover:bg-[#0f172a] px-3.5 py-2.5 rounded-xl text-white cursor-pointer shadow-xs transition-all">
            <FileSpreadsheet className="h-4 w-4 text-[#29ABE2]"/>
            <span>Ekspor Semua Transaksi CSV</span>
          </button>
        </div>
      </div>

      {/* FILTER TOOLBAR */}
      <div className="bg-white border border-[#e5e3db] rounded-2xl p-4 shadow-sm relative">
        <div className="flex flex-wrap items-end gap-4">
          
          {/* Datepicker: From */}
          <div className="flex-1 min-w-[150px]">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5">
              Dari Tanggal
            </label>
            <div className="relative">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full text-xs font-bold border border-[#e5e3db] px-3.5 py-2 rounded-xl text-slate-700 bg-[#f7f7f5] focus:outline-none focus:border-[#29ABE2] transition-all"/>
            </div>
          </div>

          {/* Datepicker: To */}
          <div className="flex-1 min-w-[150px]">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5">
              Hingga Tanggal
            </label>
            <div className="relative">
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full text-xs font-bold border border-[#e5e3db] px-3.5 py-2 rounded-xl text-slate-700 bg-[#f7f7f5] focus:outline-none focus:border-[#29ABE2] transition-all"/>
            </div>
          </div>

          {/* Custom Multi-select Dropdown for Merchants */}
          <div className="flex-1 min-w-[200px]" ref={dropdownRef}>
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5">
              Merchant Partner
            </label>
            <div className="relative">
              <button type="button" onClick={() => setMerchantDropdownOpen(!merchantDropdownOpen)} className="w-full flex items-center justify-between text-xs font-bold border border-[#e5e3db] px-3.5 py-2 rounded-xl text-slate-700 bg-[#f7f7f5] hover:bg-slate-50 transition-all text-left">
                <span className="truncate">
                  {selectedMerchantIds.length === 0
            ? 'Semua Merchant'
            : `${selectedMerchantIds.length} Merchant Terpilih`}
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-1"/>
              </button>

              {/* Float Dropdown Options */}
              {merchantDropdownOpen && (<div className="absolute left-0 right-0 mt-1.5 bg-white border border-[#e5e3db] rounded-2xl shadow-xl z-30 max-h-60 overflow-y-auto p-2.5 flex flex-col gap-1">
                  
                  {/* Select Actions */}
                  <div className="flex justify-between border-b border-slate-100 pb-2 mb-1">
                    <button type="button" onClick={selectAllMerchants} className="text-[10px] font-extrabold text-[#29ABE2] hover:underline">
                      Pilih Semua
                    </button>
                    <button type="button" onClick={clearSelectedMerchants} className="text-[10px] font-extrabold text-red-500 hover:underline">
                      Bersihkan
                    </button>
                  </div>

                  {/* List */}
                  <div className="space-y-0.5 overflow-y-auto">
                    {merchants.map((m) => {
                const isSelected = selectedMerchantIds.includes(m.id);
                return (<button key={m.id} type="button" onClick={() => handleSelectMerchant(m.id)} className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all text-left ${isSelected
                        ? 'bg-[#E8F6FD] text-[#29ABE2]'
                        : 'text-slate-600 hover:bg-[#f7f7f5]'}`}>
                          <span className="truncate">{m.name}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-[#29ABE2]"/>}
                        </button>);
            })}
                  </div>
                </div>)}
            </div>
          </div>

          {/* Ticket Type dropdown */}
          <div className="flex-1 min-w-[150px]">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5">
              Tipe Tiket Wisatawan
            </label>
            <select value={ticketType} onChange={(e) => setTicketType(e.target.value)} className="w-full text-xs font-bold border border-[#e5e3db] px-3.5 py-2 rounded-xl text-slate-700 bg-[#f7f7f5] focus:outline-none focus:border-[#29ABE2] transition-all appearance-none cursor-pointer">
              <option value="all">Semua Tipe Tiket</option>
              <option value="Regular">Regular</option>
              <option value="VIP">VIP</option>
              <option value="Family">Family</option>
              <option value="Group">Group</option>
            </select>
          </div>

          {/* Apply Filter Button */}
          <button onClick={() => handleApplyFilters(false)} disabled={filtering} className="h-9 px-5 bg-[#29ABE2] hover:bg-[#1C95C6] disabled:bg-[#29ABE2]/50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer">
            <Filter className="h-4 w-4"/>
            <span>Terapkan</span>
          </button>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Pendapatan" value={formatRupiah(summary.totalRevenue)} subtext="Akumulasi souvenir digital" tone="green" icon={<TrendingUp className="h-5.5 w-5.5"/>}/>
        <StatCard label="Volume Tapping" value={`${summary.totalTaps} Taps`} subtext="Taps gerbang & bayar merchant" tone="blue" icon={<Activity className="h-5.5 w-5.5"/>}/>
        <StatCard label="Rata-rata Harian" value={formatRupiah(Math.round(summary.avgDailyRevenue))} subtext="Total / jumlah hari terfilter" tone="blue" icon={<Calendar className="h-5.5 w-5.5"/>}/>
        <StatCard label="Partner Terlaris" value={summary.bestMerchantName} subtext={`Omset: ${formatRupiah(summary.bestMerchantRevenue)}`} tone="amber" icon={<Store className="h-5.5 w-5.5"/>}/>
      </div>

      {/* CHART SECTION */}
      <div className="bg-white border border-[#e5e3db] rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-black text-slate-800">Tren Pendapatan Harian</h3>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">
              Grafik pendapatan harian terhitung dalam rupiah
            </p>
          </div>
          {filtering && <RefreshCw className="h-4 w-4 text-[#29ABE2] animate-spin"/>}
        </div>

        <div className="h-80 w-full">
          {chartData.length === 0 ? (<div className="h-full w-full flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-2xl gap-2 text-slate-400">
              <Activity className="h-8 w-8 text-slate-300"/>
              <span className="text-xs font-bold">Tidak ada data tren untuk filter ini</span>
            </div>) : (<ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} fontWeight="bold" tickLine={false}/>
                 <YAxis stroke="#94a3b8" fontSize={10} fontWeight="bold" tickLine={false} domain={hasNoChartRevenue ? [0, 10000] : [0, 'auto']} tickFormatter={(val) => val === 0 ? 'Rp 0' : val % 1000 === 0 ? `Rp ${val / 1000}k` : `Rp ${(val / 1000).toFixed(1)}k`}/>
                <Tooltip formatter={(value) => [formatRupiah(Number(value)), '']} labelStyle={{ fontWeight: 'black', color: '#1e293b', fontSize: '11px' }} contentStyle={{ borderRadius: '12px', border: '1px solid #e5e3db', fontSize: '11px', fontWeight: 'bold' }}/>
                {chartSeries.length > 1 && <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }}/>}
                
                {/* Dynamically draw bars */}
                {chartSeries.length === 0 ? (<Bar dataKey="Revenue" fill="#29ABE2" radius={[4, 4, 0, 0]}/>) : (chartSeries.map((key, idx) => (<Bar key={key} dataKey={key} name={key} stackId="merchant_stack" fill={COLORS[idx % COLORS.length]} radius={[0, 0, 0, 0]} // stacked bars don't need top rounding for middle items
            />)))}
              </BarChart>
            </ResponsiveContainer>)}
        </div>
      </div>

      {/* RECAP TABLE */}
      <div className="bg-white border border-[#e5e3db] rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-[#f7f7f5] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-800">Tabel Rekapitulasi & Komisi Merchant</h3>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">
              Akumulasi pendapatan dan penarikan berkas komisi 10% per partner
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#f7f7f5] text-slate-400 font-extrabold border-b border-[#e5e3db] tracking-wider text-[9px] uppercase">
                <th className="py-3.5 px-5">Nama Merchant</th>
                <th className="py-3.5 px-5">Kategori</th>
                <th className="py-3.5 px-5 text-center">Total Tap</th>
                <th className="py-3.5 px-5 text-center">Pengunjung Unik</th>
                <th className="py-3.5 px-5 text-right">Total Pendapatan</th>
                <th className="py-3.5 px-5 text-right">Potongan Komisi (10%)</th>
                <th className="py-3.5 px-5 text-right">Sisa Payout (90%)</th>
                <th className="py-3.5 px-5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f7f7f5]">
              {revenueReport.length === 0 ? (<tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                    Tidak ada data merchant dalam filter ini.
                  </td>
                </tr>) : (revenueReport.map((m) => {
            const comm = m.total_revenue * 0.10;
            const net = m.total_revenue - comm;
            return (<tr key={m.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-5">
                        <div className="font-extrabold text-slate-800">{m.name}</div>
                        <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{m.location}</div>
                      </td>
                      <td className="py-3 px-5">
                        <Badge variant="neutral" className={`text-[9px] font-bold ${m.category === 'Loket/Gerbang'
                    ? 'bg-blue-50 text-blue-600 border-blue-100'
                    : m.category === 'Adventure'
                        ? 'bg-purple-50 text-purple-600 border-purple-100'
                        : m.category === 'F&B'
                            ? 'bg-amber-50 text-amber-600 border-amber-100'
                            : 'bg-slate-50 text-slate-600 border-slate-100'}`}>
                          {m.category}
                        </Badge>
                      </td>
                      <td className="py-3 px-5 text-center font-bold text-slate-700">
                        {m.total_taps}
                      </td>
                      <td className="py-3 px-5 text-center font-bold text-slate-700">
                        {m.unique_visitors}
                      </td>
                      <td className="py-3 px-5 text-right font-extrabold text-slate-800">
                        {formatRupiah(m.total_revenue)}
                      </td>
                      <td className="py-3 px-5 text-right font-bold text-red-600 bg-red-50/30">
                        {formatRupiah(comm)}
                      </td>
                      <td className="py-3 px-5 text-right font-extrabold text-[#29ABE2] bg-[#E8F6FD]/20">
                        {formatRupiah(net)}
                      </td>
                      <td className="py-3 px-5 text-center">
                        <button onClick={() => handleExportCommission(m.id, m.name)} disabled={m.total_revenue === 0} className="px-2.5 py-1.5 text-[10px] font-bold border border-slate-200 hover:border-[#29ABE2] hover:bg-[#E8F6FD] text-slate-700 hover:text-[#29ABE2] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:border-slate-200 disabled:hover:text-slate-700 rounded-lg transition-all cursor-pointer">
                          Unduh Komisi
                        </button>
                      </td>
                    </tr>);
        }))}
            </tbody>
          </table>
        </div>
      </div>
      
      <Toaster />
    </div>);
}
