'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/supabase';
import { Visitor, Merchant, Transaction, RFIDTag } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { formatRupiah, formatDatetime, normalizeUID } from '@/lib/utils';
import { Toaster, toast } from '@/components/ui/Toast';
import { Scan, CheckCircle2, AlertTriangle, History, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TapSimulatorProps {
  merchant: Merchant;
}

export const TapSimulator: React.FC<TapSimulatorProps> = ({ merchant }) => {
  const [rfidUID, setRfidUID] = useState('');
  const [amount, setAmount] = useState('25000');
  
  const [loading, setLoading] = useState(false);
  const [recentTxs, setRecentTxs] = useState<Transaction[]>([]);
  
  // List of visitors with their tag uid for quick testing
  const [testerVisitors, setTesterVisitors] = useState<{ visitor: Visitor; tag: RFIDTag }[]>([]);
  
  const [isTapping, setIsTapping] = useState(false);
  const [tapResult, setTapResult] = useState<{
    success: boolean;
    message: string;
    visitorName?: string;
    amount?: number;
    creditRemaining?: string;
  } | null>(null);

  const isEntryGate = merchant.merchant_type === 'loket';

  useEffect(() => {
    loadRecentTransactions();
    loadTesterVisitors();
  }, [merchant.id]);

  const loadRecentTransactions = async () => {
    const allTxs = await db.getTransactions();
    // filter for this merchant
    const filtered = allTxs.filter(tx => tx.merchant_id === merchant.id);
    setRecentTxs(filtered.slice(0, 10)); // show top 10
  };

  const loadTesterVisitors = async () => {
    const visitorsList = await db.getVisitors();
    const tagsList = await db.getRFIDTags();
    
    const combined = visitorsList.map(v => {
      const tag = tagsList.find(t => t.visitor_id === v.id && t.is_active);
      return tag ? { visitor: v, tag } : null;
    }).filter(item => item !== null) as { visitor: Visitor; tag: RFIDTag }[];
    
    setTesterVisitors(combined.slice(0, 5));
  };

  const handleTap = async (uidToUse?: string) => {
    const uid = normalizeUID(uidToUse || rfidUID);
    if (!uid) {
      toast.error('Masukkan UID RFID terlebih dahulu');
      return;
    }

    setLoading(true);
    setIsTapping(true);
    setTapResult(null);

    // Simulate scanning delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      const charge = isEntryGate ? 0 : Number(amount);
      const res = await db.createTransaction({
        rfid_uid: uid,
        merchant_id: merchant.id,
        amount: charge,
      });

      if (res.success && res.transaction) {
        // Retrieve remaining balance
        const vInfo = await db.getVisitorByUID(uid);
        const creditRemainingStr = vInfo
          ? (vInfo.visitor.credit_limit === 0 ? 'Unlimited' : formatRupiah(vInfo.visitor.credit_limit - vInfo.visitor.credit_used))
          : 'Rp0';

        setTapResult({
          success: true,
          message: isEntryGate ? 'Akses Masuk Diizinkan!' : 'Pembayaran Berhasil Dicatat!',
          visitorName: res.transaction.visitor_name,
          amount: charge,
          creditRemaining: creditRemainingStr,
        });

        toast.success(isEntryGate ? 'Akses Masuk Berhasil' : 'Transaksi Pembayaran Berhasil');
        setRfidUID('');
        loadRecentTransactions();
        loadTesterVisitors();
      } else {
        setTapResult({
          success: false,
          message: res.error || 'Transaksi gagal diproses',
        });
        toast.error(res.error || 'Transaksi gagal');
      }
    } catch {
      setTapResult({
        success: false,
        message: 'Koneksi error atau sistem sibuk.',
      });
      toast.error('Sistem error');
    } finally {
      setLoading(false);
      setIsTapping(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      <Toaster position="top-center" richColors />

      {/* Simulator Terminal Panel */}
      <div className="flex-1 bg-white border border-[#e5e3db] rounded-2xl p-6 md:p-8 flex flex-col gap-6 relative shadow-xs">
        {/* Terminal Header */}
        <div className="flex items-center justify-between border-b border-[#e5e3db] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#E8F6FD] flex items-center justify-center text-[#29ABE2]">
              <Scan className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1e293b]">Terminal RFID Simulator</h2>
              <p className="text-xs text-[#64748b]">
                Kategori: <span className="font-bold">{merchant.category}</span> • Tipe: {merchant.merchant_type}
              </p>
            </div>
          </div>
          <Badge variant="success">ONLINE</Badge>
        </div>

        {/* Form Tapping */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="flex flex-col gap-4">
            <Input
              label="KODE UID RFID (Hex 16 Karakter)"
              type="text"
              placeholder="Contoh: E280113C200078AC"
              value={rfidUID}
              onChange={(e) => setRfidUID(e.target.value)}
              disabled={loading}
              className="font-mono text-base uppercase tracking-wider font-semibold border-2 border-[#e5e3db] focus:border-[#29ABE2]"
            />

            {!isEntryGate && (
              <Input
                label="NOMINAL PEMBAYARAN (Rp)"
                type="number"
                placeholder="25000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={loading}
                className="text-base font-bold text-[#29ABE2]"
              />
            )}

            <Button
              onClick={() => handleTap()}
              loading={loading}
              className="w-full mt-2 font-bold py-3 text-base flex gap-2 items-center justify-center"
            >
              <Scan className="h-5 w-5" />
              {isEntryGate ? 'TAP MASUK LOKET (ENTRY)' : 'TAP & CATAT PEMBAYARAN'}
            </Button>
          </div>

          {/* Quick-select Test Wristbands */}
          <div className="bg-[#f7f7f5] border border-[#e5e3db] rounded-2xl p-5 flex flex-col gap-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748b] flex items-center gap-1.5">
              <HelpCircle className="h-4 w-4" /> Gelang Tester (Klik untuk Tap Instan)
            </span>
            <p className="text-[11px] text-[#64748b] leading-relaxed">
              Pilih salah satu gelang terdaftar di bawah untuk melakukan simulasi transaksi RFID secara instan:
            </p>
            <div className="flex flex-col gap-2.5">
              {testerVisitors.map(({ visitor: v, tag: t }) => {
                const isUnlimited = v.credit_limit === 0;
                const balanceLeft = isUnlimited ? Infinity : (v.credit_limit - v.credit_used);
                return (
                  <button
                    key={v.id}
                    onClick={() => {
                      setRfidUID(t.uid);
                      handleTap(t.uid);
                    }}
                    disabled={loading}
                    className="flex items-center justify-between p-2.5 bg-white border border-[#e5e3db] hover:border-[#29ABE2]/30 hover:bg-[#E8F6FD] rounded-xl text-left transition-all text-xs cursor-pointer disabled:opacity-50"
                  >
                    <div>
                      <p className="font-bold text-[#1e293b]">{v.name}</p>
                      <p className="text-[10px] text-gray-500 font-mono tracking-wider truncate max-w-[150px]">{t.uid} ({v.ticket_type})</p>
                    </div>
                    <span className="font-bold text-[#29ABE2]">
                      {isUnlimited ? 'Unlimited' : formatRupiah(balanceLeft)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Scan Status Animation Screen */}
        <AnimatePresence mode="wait">
          {isTapping && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-white/95 rounded-2xl flex flex-col items-center justify-center gap-4 z-30"
            >
              <div className="relative w-24 h-24 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-[#29ABE2]/20 animate-ping" />
                <div className="w-16 h-16 rounded-full bg-[#29ABE2] flex items-center justify-center text-white shadow-lg shadow-[#29ABE2]/20">
                  <Scan className="h-8 w-8 animate-spin" />
                </div>
              </div>
              <p className="text-sm font-bold text-[#1e293b] tracking-wide animate-pulse">
                MENEMPELKAN GELANG RFID PADA TERMINAL...
              </p>
            </motion.div>
          )}

          {tapResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`border rounded-2xl p-5 mt-4 flex items-start gap-4 ${
                tapResult.success 
                  ? 'bg-[#E8F6FD] border-[#29ABE2]/30 text-[#29ABE2]' 
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {tapResult.success ? (
                <CheckCircle2 className="h-6 w-6 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-6 w-6 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-sm">
                <p className="font-bold text-base">{tapResult.message}</p>
                {tapResult.success && (
                  <div className="mt-2 space-y-1 text-xs text-[#1e293b]/80">
                    <p>Nama Wisatawan: <span className="font-bold text-[#1e293b]">{tapResult.visitorName}</span></p>
                    {!isEntryGate && <p>Biaya Transaksi: <span className="font-bold text-red-600">{formatRupiah(tapResult.amount || 0)}</span></p>}
                    <p>Sisa Saldo Gelang: <span className="font-bold text-[#29ABE2]">{tapResult.creditRemaining}</span></p>
                  </div>
                )}
                <button
                  onClick={() => setTapResult(null)}
                  className="mt-3 text-xs underline font-semibold cursor-pointer block"
                >
                  Tutup Notifikasi
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Recent Transactions Trail */}
      <div className="w-full lg:w-96 bg-white border border-[#e5e3db] rounded-2xl p-6 shadow-xs flex flex-col gap-4">
        <h3 className="text-base font-bold text-[#1e293b] flex items-center gap-2">
          <History className="h-4.5 w-4.5 text-[#29ABE2]" /> Riwayat Tap Terminal
        </h3>
        <p className="text-xs text-[#64748b]">
          Menampilkan 10 tap terakhir dari merchant ini.
        </p>

        <div className="flex-1 overflow-y-auto max-h-[420px] flex flex-col gap-2.5 pr-1">
          {recentTxs.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-[#e5e3db] rounded-xl flex flex-col gap-2 justify-center items-center">
              <History className="h-6 w-6 text-gray-300" />
              <p className="text-xs text-gray-400">Belum ada aktivitas tap</p>
            </div>
          ) : (
            recentTxs.map(tx => (
              <div
                key={tx.id}
                className="p-3 bg-[#f7f7f5] border border-[#e5e3db] rounded-xl flex flex-col gap-1 text-xs"
              >
                <div className="flex items-center justify-between font-bold">
                  <span className="text-[#1e293b] truncate max-w-[150px]">{tx.visitor_name}</span>
                  <Badge variant={tx.type === 'entry' ? 'neutral' : 'success'}>
                    {tx.type === 'entry' ? 'Masuk' : 'Belanja'}
                  </Badge>
                </div>
                <p className="text-[10px] text-gray-500 font-medium">
                  {tx.type === 'entry' ? 'Tap Masuk Pintu Gerbang' : 'Belanja Souvenir Partner'}
                </p>
                <span className="text-[9px] text-gray-400 mt-1">{formatDatetime(tx.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
