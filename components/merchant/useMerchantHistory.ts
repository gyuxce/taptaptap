'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchTransactions, fetchTransactionStats } from '@/lib/services/transactionService';
import { Transaction } from '@/types';
import { toast } from '@/components/ui/Toast';

export type HistoryFilter = 'hari' | 'minggu' | 'bulan' | 'custom';

function buildDateRange(filter: HistoryFilter, customDateFrom: string, customDateTo: string) {
  const dateRange: { dateFrom?: string; dateTo?: string } = {};
  const now = new Date();

  if (filter === 'hari') {
    dateRange.dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  } else if (filter === 'minggu') {
    const day = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
    startOfWeek.setHours(0, 0, 0, 0);
    dateRange.dateFrom = startOfWeek.toISOString();
  } else if (filter === 'bulan') {
    dateRange.dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  } else {
    if (customDateFrom) dateRange.dateFrom = new Date(customDateFrom).toISOString();
    if (customDateTo) {
      const toDate = new Date(customDateTo);
      toDate.setHours(23, 59, 59, 999);
      dateRange.dateTo = toDate.toISOString();
    }
  }

  return dateRange;
}

export function useMerchantHistory(merchantId: string | undefined, pollingEnabled: boolean) {
  const [filter, setFilter] = useState<HistoryFilter>('hari');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({
    today: { count: 0, total: 0 },
    thisWeek: { count: 0, total: 0 },
    thisMonth: { count: 0, total: 0 },
  });
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const dateRange = useMemo(
    () => buildDateRange(filter, customDateFrom, customDateTo),
    [filter, customDateFrom, customDateTo]
  );

  const refresh = useCallback(async (silent = false) => {
    if (!merchantId) return;
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const [nextStats, list] = await Promise.all([
        fetchTransactionStats(merchantId),
        fetchTransactions(merchantId, { ...dateRange, limit: 50, offset: 0 }),
      ]);
      setStats(nextStats);
      setTransactions(list.transactions);
      setTotalCount(list.total);
      setOffset(0);
    } catch {
      toast.error('Gagal mengambil riwayat transaksi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange, merchantId]);

  const loadMore = useCallback(async () => {
    if (!merchantId || loading) return;
    setLoading(true);
    try {
      const nextOffset = offset + 50;
      const list = await fetchTransactions(merchantId, {
        ...dateRange,
        limit: 50,
        offset: nextOffset,
      });
      setTransactions(current => [...current, ...list.transactions]);
      setOffset(nextOffset);
    } catch {
      toast.error('Gagal memuat transaksi berikutnya');
    } finally {
      setLoading(false);
    }
  }, [dateRange, loading, merchantId, offset]);

  useEffect(() => {
    if (merchantId) void refresh(true);
  }, [merchantId, refresh]);

  useEffect(() => {
    if (!merchantId || !pollingEnabled) return;
    void refresh(false);
    const timer = window.setInterval(() => void refresh(true), 30_000);
    return () => window.clearInterval(timer);
  }, [merchantId, pollingEnabled, refresh]);

  return {
    filter,
    setFilter,
    customDateFrom,
    setCustomDateFrom,
    customDateTo,
    setCustomDateTo,
    transactions,
    totalCount,
    stats,
    loading,
    refreshing,
    refresh,
    loadMore,
  };
}
