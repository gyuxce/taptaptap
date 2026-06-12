'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { db } from '@/lib/supabase';
import { Transaction, Merchant } from '@/types';
import { formatRupiah, formatDatetime } from '@/lib/utils';
import { fetchTransactions } from '@/lib/services/transactionService';
import { getAllMerchants } from '@/lib/services/merchantService';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { Toaster, toast } from '@/components/ui/Toast';
import { Download, RefreshCw, Calendar, Store, Filter } from 'lucide-react';

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchingList, setFetchingList] = useState(false);

  // Filters State
  const [merchantFilter, setMerchantFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'entry' | 'payment'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    loadInitData();
  }, []);

  useEffect(() => {
    loadTransactionData();
  }, [merchantFilter, typeFilter, dateFrom, dateTo, currentPage]);

  const loadInitData = async () => {
    setLoading(true);
    try {
      const mList = await getAllMerchants();
      setMerchants(mList);
    } catch (err) {
      toast.error('Gagal memuat filter merchant');
    } finally {
      setLoading(false);
    }
  };

  const loadTransactionData = async (isSilent = false) => {
    if (!isSilent) setFetchingList(true);
    
    try {
      const filters: any = {
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage,
      };

      if (typeFilter !== 'all') {
        filters.type = typeFilter;
      }
      if (dateFrom) {
        filters.dateFrom = new Date(dateFrom).toISOString();
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        filters.dateTo = toDate.toISOString();
      }

      const res = await fetchTransactions(merchantFilter, filters);
      setTransactions(res.transactions);
      setTotalCount(res.total);
    } catch (err) {
      toast.error('Gagal mengambil daftar transaksi');
    } finally {
      setFetchingList(false);
    }
  };

  // Summary Metrics calculations (Calculated across currently filtered local list page)
  const summaryMetrics = useMemo(() => {
    const totalTaps = transactions.length;
    const paymentTxs = transactions.filter(t => t.type === 'payment');
    const totalRevenue = paymentTxs.reduce((acc, t) => acc + t.amount, 0);
    const avgAmount = paymentTxs.length > 0 ? (totalRevenue / paymentTxs.length) : 0;

    return {
      totalTaps,
      totalRevenue,
      avgAmount,
    };
  }, [transactions]);

  // Export to CSV
  const handleExportCSV = () => {
    if (transactions.length === 0) return;

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Waktu,Nama Wisatawan,Tipe Tiket,Merchant Partner,Jenis Tap,Nominal,WhatsApp Status\r\n';

    transactions.forEach(tx => {
      const nominal = tx.amount === 0 ? 'Entry' : tx.amount;
      const cleanVisitorName = (tx.visitor_name || 'Unknown').replace(/,/g, '');
      const cleanMerchantName = (tx.merchant_name || 'Unknown').replace(/,/g, '');
      const cleanTicketType = tx.ticket_type || 'Regular';
      csvContent += `${tx.created_at},${cleanVisitorName},${cleanTicketType},${cleanMerchantName},${tx.type},${nominal},${tx.whatsapp_status}\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    const todayStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `laporan_transaksi_admin_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Laporan CSV transaksi diunduh!');
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 w-full animate-pulse">
        <div className="h-8 w-48 bg-slate-200 rounded" />
        <div className="h-28 bg-white border border-[#e5e3db] rounded-2xl" />
        <div className="h-96 bg-white border border-[#e5e3db] rounded-2xl" />
      </div>
    );
  }

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  return (
    <div className="flex flex-col gap-6 text-left">
      <Toaster position="top-center" richColors />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <span className="text-xs font-bold text-[#29ABE2] uppercase tracking-wider block">
            Audit Trail Keuangan
          </span>
          <h1 className="text-xl md:text-2xl font-black text-[#1e293b] mt-0.5">
            Log Aktivitas Pintu & Belanja Souvenir
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadTransactionData(false)}
            disabled={fetchingList}
            className="flex items-center gap-1.5 text-xs font-bold bg-white border border-[#e5e3db] px-3.5 py-2 rounded-xl text-[#1e293b] cursor-pointer hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${fetchingList ? 'animate-spin' : ''}`} />
            Sync
          </button>
          <Button
            onClick={handleExportCSV}
            disabled={transactions.length === 0 || fetchingList}
            className="flex items-center gap-2 text-xs font-bold cursor-pointer"
          >
            <Download className="h-4 w-4" /> Unduh Laporan CSV
          </Button>
        </div>
      </div>

      {/* Summary metrics bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          label="Total Tap Terhitung"
          value={`${summaryMetrics.totalTaps} Transaksi`}
          subtext="Volume pemindaian gelang NFC"
          tone="blue"
        />
        <StatCard
          label="Total Pendapatan Terfilter"
          value={formatRupiah(summaryMetrics.totalRevenue)}
          subtext="Akumulasi dana belanja partner"
          tone="green"
        />
        <StatCard
          label="Rata-rata Per Transaksi"
          value={formatRupiah(summaryMetrics.avgAmount)}
          subtext="Nilai transaksi belanja regular"
          tone="amber"
        />
      </div>

      {/* Filters box */}
      <div className="bg-white border border-[#e5e3db] rounded-2xl p-5 shadow-xs grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Merchant Filter */}
        <div className="flex flex-col gap-1 text-left">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#64748b] flex items-center gap-1">
            <Store className="h-3.5 w-3.5" /> Merchant Partner
          </label>
          <select
            value={merchantFilter}
            onChange={(e) => {
              setMerchantFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3.5 py-2.5 text-xs bg-[#f7f7f5] text-[#1e293b] border border-[#e5e3db] rounded-xl outline-none focus:border-[#29ABE2]"
          >
            <option value="all">Semua Merchant ({merchants.length})</option>
            {merchants.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Transaction Type Filter */}
        <div className="flex flex-col gap-1 text-left">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#64748b] flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" /> Jenis Transaksi
          </label>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="w-full px-3.5 py-2.5 text-xs bg-[#f7f7f5] text-[#1e293b] border border-[#e5e3db] rounded-xl outline-none focus:border-[#29ABE2]"
          >
            <option value="all">Semua Jenis Tap</option>
            <option value="entry">Entry (Tap Pintu Masuk)</option>
            <option value="payment">Payment (Belanja Souvenir)</option>
          </select>
        </div>

        {/* Date From Filter */}
        <div className="flex flex-col gap-1 text-left">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#64748b] flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> Dari Tanggal
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3.5 py-2 text-xs bg-[#f7f7f5] text-[#1e293b] border border-[#e5e3db] rounded-xl outline-none focus:border-[#29ABE2]"
          />
        </div>

        {/* Date To Filter */}
        <div className="flex flex-col gap-1 text-left">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#64748b] flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> Sampai Tanggal
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-3.5 py-2 text-xs bg-[#f7f7f5] text-[#1e293b] border border-[#e5e3db] rounded-xl outline-none focus:border-[#29ABE2]"
          />
        </div>

      </div>

      {/* Transactions table listing */}
      <div className="bg-white border border-[#e5e3db] rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          {fetchingList ? (
            /* Simple skeletons loading rows */
            <div className="p-8 flex flex-col gap-4 animate-pulse">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div key={idx} className="h-9 w-full bg-slate-100 rounded" />
              ))}
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#e5e3db] text-[#64748b] font-bold uppercase tracking-wider bg-[#fbfbfa]">
                  <th className="p-4">Waktu</th>
                  <th className="py-4 px-2">Wisatawan</th>
                  <th className="py-4 px-2">Tipe Tiket</th>
                  <th className="py-4 px-2">Merchant Partner</th>
                  <th className="py-4 px-2">Tipe</th>
                  <th className="py-4 px-2 text-right">Nominal</th>
                  <th className="py-4 px-4 text-center">Status WA</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-[#f7f7f5] hover:bg-[#f7f7f5]/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-gray-500">{formatDatetime(tx.created_at)}</td>
                    <td className="py-3 px-2 font-bold text-[#1e293b]">{tx.visitor_name}</td>
                    <td className="py-3 px-2">
                      <Badge variant={tx.ticket_type as any}>{tx.ticket_type}</Badge>
                    </td>
                    <td className="py-3 px-2 text-[#64748b] font-semibold">{tx.merchant_name}</td>
                    <td className="py-3 px-2">
                      <Badge variant={tx.type === 'entry' ? 'VIP' : 'Regular'}>
                        {tx.type === 'entry' ? 'Entry' : 'Belanja'}
                      </Badge>
                    </td>
                    <td className={`py-3 px-2 text-right font-black ${tx.type === 'entry' ? 'text-gray-400' : 'text-red-600'}`}>
                      {tx.type === 'entry' ? 'Entry' : `-${formatRupiah(tx.amount)}`}
                    </td>
                    <td className="py-3 px-4 text-center">
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
                    <td colSpan={7} className="text-center py-16 text-gray-400">
                      Tidak ada data aktivitas tap transaksi ditemukan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination bar */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-[#e5e3db] flex items-center justify-between bg-[#fbfbfa] text-xs">
            <span className="text-[#64748b] font-medium">
              Menampilkan {Math.min(totalCount, (currentPage - 1) * itemsPerPage + 1)}-
              {Math.min(totalCount, currentPage * itemsPerPage)} dari {totalCount} transaksi
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1 || fetchingList}
                className="border border-[#e5e3db] cursor-pointer"
              >
                Sebelumnya
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages || fetchingList}
                className="border border-[#e5e3db] cursor-pointer"
              >
                Selanjutnya
              </Button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
