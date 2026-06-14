'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion, AnimatePresence } from 'motion/react';
import { 
  SmartphoneNfc, Scan, History, Settings, Plus,
  LogOut, Activity, AlertTriangle, Zap, CheckCircle2, 
  XCircle, RefreshCw, Download, Store
} from 'lucide-react';

import { useAuth } from '@/lib/auth';
import { registerVisitorSchema, RegisterVisitorInput } from '@/lib/validations';
import { fetchVisitorByUID, registerVisitor, checkCredit, topUpCredit } from '@/lib/services/visitorService';
import { logTransaction } from '@/lib/services/transactionService';
import { getMerchantByUserId } from '@/lib/services/merchantService';
import { Visitor, Merchant, RFIDTag } from '@/types';
import { formatRupiah, formatDatetime, normalizeUID } from '@/lib/utils';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { WavrLogo } from '@/components/ui/WavrLogo';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Toaster, toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatCard } from '@/components/ui/StatCard';
import { Modal } from '@/components/ui/Modal';
import { useMerchantHistory } from '@/components/merchant/useMerchantHistory';
import { LoyaltyCard } from '@/components/merchant/LoyaltyCard';
import { MerchantNav } from '@/components/merchant/MerchantNav';
import { fetchLoyaltyInfo, redeemLoyaltyReward } from '@/lib/services/loyaltyService';
import type { LoyaltyInfo } from '@/types';

const RevenueChart = dynamic(() => import('@/components/merchant/RevenueChart'), {
  ssr: false,
  loading: () => <div className="h-full w-full rounded-xl bg-slate-100 animate-pulse" />,
});

export default function MerchantTerminalPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading, signOut } = useAuth();
  
  // Terminal State
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [terminalLoading, setTerminalLoading] = useState(true);
  const [activeDrawer, setActiveDrawer] = useState<'visitor' | 'error_unregistered' | 'double_tap' | 'credit_error' | 'register' | 'topup' | 'settings' | 'history' | null>(null);

  // NFC Abort Controllers Refs
  const mainAbortControllerRef = useRef<AbortController | null>(null);
  const topUpAbortControllerRef = useRef<AbortController | null>(null);

  // Settings Nominal Preset State
  const [defaultNominal, setDefaultNominal] = useState<number>(25000);

  // Scanning State
  const [isScanning, setIsScanning] = useState(false);
  const [nfcError, setNfcError] = useState<string | null>(null);
  const [tapScenarioLoading, setTapScenarioLoading] = useState(false);

  // Double Tap Prevention Ref
  const lastScansRef = useRef<{ [uid: string]: number }>({});
  const isSubmittingRef = useRef(false);
  const idempotencyKeyRef = useRef<{ uid: string; key: string } | null>(null);

  // Drawers and Overlays state
  const [scannedUID, setScannedUID] = useState<string>('');
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [selectedTag, setSelectedTag] = useState<RFIDTag | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('25000');
  const [showManualAmount, setShowManualAmount] = useState(false);
  const [confirmTapLoading, setConfirmTapLoading] = useState(false);
  
  // State 3: Double Tap info
  const [doubleTapInfo, setDoubleTapInfo] = useState<{ uid: string; lastTime: string } | null>(null);

  // Success Flash Overlay
  const [showSuccessFlash, setShowSuccessFlash] = useState(false);
  const [successVisitorName, setSuccessVisitorName] = useState('');
  const [successTitle, setSuccessTitle] = useState('Tap Berhasil Dicatat');
  const [successSubtitle, setSuccessSubtitle] = useState('');
  const [loyaltyInfo, setLoyaltyInfo] = useState<LoyaltyInfo | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);

  // Credit Error Drawer Details
  const [creditErrorDetails, setCreditErrorDetails] = useState<{
    requested: number;
    remaining: number;
    limit: number;
  } | null>(null);

  // Top Up Tab States
  const [, setTopUpScannedUID] = useState('');
  const [topUpVisitor, setTopUpVisitor] = useState<Visitor | null>(null);
  const [topUpTag, setTopUpTag] = useState<RFIDTag | null>(null);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpNote, setTopUpNote] = useState('');
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpSuccessFlash, setTopUpSuccessFlash] = useState(false);
  const [topUpSuccessAmount, setTopUpSuccessAmount] = useState(0);
  const [topUpSuccessVisitorName, setTopUpSuccessVisitorName] = useState('');
  const [topUpScanLoading, setTopUpScanLoading] = useState(false);
  const [isTopUpScanning, setIsTopUpScanning] = useState(false);
  const [, setTopUpNfcError] = useState<string | null>(null);

  // Registration state
  const [newTagUID, setNewTagUID] = useState('');

  const {
    filter: historyFilter,
    setFilter: setHistoryFilter,
    customDateFrom,
    setCustomDateFrom,
    customDateTo,
    setCustomDateTo,
    transactions: historyTxs,
    latestTransactions,
    totalCount: historyTotalCount,
    stats: historyStats,
    loading: historyFetchLoading,
    refreshing: historyRefreshing,
    refresh: loadHistoryData,
    loadMore: loadMoreHistory,
  } = useMerchantHistory(merchant?.id, activeDrawer === 'history');

  // Dialog Confirmations
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    if (!showSuccessFlash) return;
    const timeoutId = window.setTimeout(() => setShowSuccessFlash(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [showSuccessFlash]);

  useEffect(() => {
    if (!topUpSuccessFlash) return;
    const timeoutId = window.setTimeout(() => setTopUpSuccessFlash(false), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [topUpSuccessFlash]);

  // 1. Auth check
  useEffect(() => {
    if (!authLoading) {
      if (!user || !profile) {
        router.push('/');
        return;
      }
      if (profile.role === 'admin') {
        router.push('/dashboard');
        return;
      }
      loadMerchantAndConfig(profile.id);
    }
  }, [user, profile, authLoading, router]);

  // 2. Load nominal defaults from localstorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedNominal = window.localStorage.getItem('ecotour_default_nominal');
      if (storedNominal) {
        const parsed = Number(storedNominal);
        setDefaultNominal(parsed);
        setPaymentAmount(parsed.toString());
      }
    }
  }, []);

  // Cleanup scanning when activeDrawer changes
  useEffect(() => {
    setIsScanning(false);
    setIsTopUpScanning(false);

    // Abort active NFC scans immediately to prevent conflicts
    if (mainAbortControllerRef.current) {
      try {
        mainAbortControllerRef.current.abort();
      } catch {
        // ignore abort error
      }
      mainAbortControllerRef.current = null;
    }
    if (topUpAbortControllerRef.current) {
      try {
        topUpAbortControllerRef.current.abort();
      } catch {
        // ignore abort error
      }
      topUpAbortControllerRef.current = null;
    }
  }, [activeDrawer]);

  // Cleanup scanning on unmount
  useEffect(() => {
    return () => {
      if (mainAbortControllerRef.current) {
        try {
          mainAbortControllerRef.current.abort();
        } catch {}
      }
      if (topUpAbortControllerRef.current) {
        try {
          topUpAbortControllerRef.current.abort();
        } catch {}
      }
    };
  }, []);

  const loadMerchantAndConfig = async (userId: string) => {
    setTerminalLoading(true);
    try {
      const mData = await getMerchantByUserId(userId);
      setMerchant(mData);
      


    } catch {
      toast.error('Gagal memuat profil merchant');
    } finally {
      setTerminalLoading(false);
    }
  };

  // 4. processScannedRFID Handler
  const processScannedRFID = useCallback(async (uid: string) => {
    if (!uid) return;
    setNfcError(null);
    setIsScanning(false);
    setScannedUID(uid);

    if (navigator.vibrate) {
      navigator.vibrate(50); // satu ketukan pendek
    }

    // Double Tap Prevention Check
    const nowTimestamp = Date.now();
    const lastScanTime = lastScansRef.current[uid];
    if (lastScanTime && nowTimestamp - lastScanTime < 10000) {
      // Trigger Double Tap Warning
      setDoubleTapInfo({ uid, lastTime: new Date(lastScanTime).toLocaleTimeString('id-ID') });
      setActiveDrawer('double_tap');
      return;
    }

    setTapScenarioLoading(true);
    try {
      const res = await fetchVisitorByUID(uid);
      if ('error' in res) {
        if (res.error === 'TAG_NOT_FOUND') {
          setActiveDrawer('error_unregistered');
        } else if (res.error === 'TAG_INACTIVE') {
          toast.error('Gelang RFID ini dinonaktifkan.');
        } else {
          toast.error('Pembacaan gagal: ' + res.error);
        }
      } else {
        // Tag valid
        setSelectedVisitor(res.visitor);
        setSelectedTag(res.tag);
        // Default defaultNominal preset
        setPaymentAmount(defaultNominal.toString());
        if (merchant?.loyalty_enabled) {
          setLoyaltyLoading(true);
          void fetchLoyaltyInfo(uid, merchant.id)
            .then(setLoyaltyInfo)
            .finally(() => setLoyaltyLoading(false));
        } else {
          setLoyaltyInfo(null);
        }
        setActiveDrawer('visitor');
      }
    } catch {
      toast.error('Koneksi terganggu.');
    } finally {
      setTapScenarioLoading(false);
    }
  }, [defaultNominal, merchant]);

  const triggerNFCScan = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!('NDEFReader' in window)) {
      setNfcError('Browser tidak mendukung Web NFC. Gunakan Google Chrome di Android.');
      return;
    }

    if (isScanning) {
      if (mainAbortControllerRef.current) {
        try {
          mainAbortControllerRef.current.abort();
        } catch {}
        mainAbortControllerRef.current = null;
      }
      setIsScanning(false);
      return;
    }

    setIsScanning(true);
    setNfcError(null);
    try {
      if (mainAbortControllerRef.current) {
        try {
          mainAbortControllerRef.current.abort();
        } catch {}
      }
      const controller = new AbortController();
      mainAbortControllerRef.current = controller;

      const ndef = new NDEFReader();
      await ndef.scan({ signal: controller.signal });
      ndef.onreading = (event: NDEFReadingEvent) => {
        const normalized = normalizeUID(event.serialNumber);
        setNfcError(null);
        setIsScanning(false);
        void processScannedRFID(normalized);
      };
      ndef.onreadingerror = () => {
        toast.error('Gagal membaca tag NFC. Silakan coba lagi.');
      };
    } catch (err: unknown) {
      console.error(err);
      setNfcError('Gagal mendeteksi sensor: ' + (err instanceof Error ? err.message : String(err)));
      setIsScanning(false);
      mainAbortControllerRef.current = null;
    }
  }, [isScanning, processScannedRFID]);

  // Top Up RFID Scan process
  const processTopUpRFID = useCallback(async (uid: string) => {
    if (!uid) return;
    setTopUpScannedUID(uid);
    setTopUpScanLoading(true);

    if (navigator.vibrate) {
      navigator.vibrate(50); // satu ketukan pendek
    }

    try {
      const res = await fetchVisitorByUID(uid);
      if ('error' in res) {
        if (res.error === 'TAG_NOT_FOUND') {
          toast.error('Gelang RFID belum terdaftar. Daftarkan di Tab Daftar.');
        } else if (res.error === 'TAG_INACTIVE') {
          toast.error('Gelang RFID ini dinonaktifkan.');
        } else {
          toast.error('Pembacaan gagal: ' + res.error);
        }
        setTopUpScannedUID('');
      } else {
        setTopUpVisitor(res.visitor);
        setTopUpTag(res.tag);
        setTopUpAmount('');
        setTopUpNote('');
      }
    } catch {
      toast.error('Koneksi terganggu.');
      setTopUpScannedUID('');
    } finally {
      setTopUpScanLoading(false);
    }
  }, []);

  const triggerTopUpNFCScan = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!('NDEFReader' in window)) {
      setTopUpNfcError('Browser tidak mendukung Web NFC. Gunakan Google Chrome di Android.');
      return;
    }

    if (isTopUpScanning) {
      if (topUpAbortControllerRef.current) {
        try {
          topUpAbortControllerRef.current.abort();
        } catch {}
        topUpAbortControllerRef.current = null;
      }
      setIsTopUpScanning(false);
      return;
    }

    setIsTopUpScanning(true);
    setTopUpNfcError(null);
    try {
      if (topUpAbortControllerRef.current) {
        try {
          topUpAbortControllerRef.current.abort();
        } catch {}
      }
      const controller = new AbortController();
      topUpAbortControllerRef.current = controller;

      const ndef = new NDEFReader();
      await ndef.scan({ signal: controller.signal });
      ndef.onreading = (event: NDEFReadingEvent) => {
        const normalized = normalizeUID(event.serialNumber);
        processTopUpRFID(normalized);
      };
      ndef.onreadingerror = () => {
        toast.error('Gagal membaca tag NFC. Silakan coba lagi.');
      };
    } catch (err: unknown) {
      console.error(err);
      setTopUpNfcError('Gagal mendeteksi sensor: ' + (err instanceof Error ? err.message : String(err)));
      setIsTopUpScanning(false);
      topUpAbortControllerRef.current = null;
    }
  }, [isTopUpScanning, processTopUpRFID]);

  const handleConfirmTopUp = async () => {
    if (!topUpVisitor || !topUpTag || !merchant) return;
    if (!navigator.onLine) {
      toast.error('Top up memerlukan koneksi internet');
      return;
    }

    const cleanAmount = parseInt(topUpAmount.replace(/\./g, ''), 10) || 0;
    if (cleanAmount <= 0) {
      toast.error('Nominal top up harus lebih besar dari Rp 0');
      return;
    }

    setTopUpLoading(true);
    try {
      const res = await topUpCredit(topUpTag.uid, cleanAmount, merchant.id, topUpNote || undefined);

      if (res.success) {
        setTopUpSuccessAmount(cleanAmount);
        setTopUpSuccessVisitorName(topUpVisitor.name);

        setTopUpVisitor(null);
        setTopUpTag(null);
        setTopUpScannedUID('');
        setTopUpAmount('');
        setTopUpNote('');

        setActiveDrawer(null);
        setTopUpSuccessFlash(true);
        loadHistoryData(true);

        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 100]); // dua ketukan
        }
      } else {
        toast.error(res.error || 'Top Up gagal');
      }
    } catch {
      toast.error('Terjadi kesalahan, coba lagi');
    } finally {
      setTopUpLoading(false);
    }
  };

  // 6. Confirm Tap Payment (Deduct credit and Log transaction)
  const handleConfirmTap = useCallback(async (bypassDoubleTap = false) => {
    if (!merchant || !scannedUID || isSubmittingRef.current) return;
    if (!navigator.onLine) {
      toast.error('Transaksi memerlukan koneksi internet');
      return;
    }
    isSubmittingRef.current = true;
    setConfirmTapLoading(true);

    const chargeAmount = merchant.merchant_type === 'loket' ? 0 : Number(paymentAmount);

    try {
      // A. Check Credit first if payments are required
      if (chargeAmount > 0 && selectedVisitor) {
        const checkRes = await checkCredit(scannedUID, chargeAmount);
        if (!checkRes.allowed) {
          // Closed drawer, show credit error drawer
          setActiveDrawer(null);
          setCreditErrorDetails({
            requested: chargeAmount,
            remaining: checkRes.credit_remaining,
            limit: checkRes.credit_limit
          });
          setTimeout(() => {
            setActiveDrawer('credit_error');
          }, 200);
          isSubmittingRef.current = false;
          setConfirmTapLoading(false);
          return;
        }
      }

      // B. Save timestamp for double tap prevention
      if (!bypassDoubleTap) {
        lastScansRef.current[scannedUID] = Date.now();
      }

      // C. Process the balance update and ledger insert in one database transaction.
      if (!idempotencyKeyRef.current || idempotencyKeyRef.current.uid !== scannedUID) {
        idempotencyKeyRef.current = { uid: scannedUID, key: crypto.randomUUID() };
      }
      const logRes = await logTransaction({
        rfid_uid: scannedUID,
        merchant_id: merchant.id,
        type: merchant.merchant_type === 'loket' ? 'entry' : 'payment',
        amount: chargeAmount,
        merchant_name: merchant.name,
        idempotency_key: idempotencyKeyRef.current.key,
        allow_rapid_repeat: bypassDoubleTap,
      });

      if ('error' in logRes) {
        if (logRes.error === 'DOUBLE_TAP') {
          setDoubleTapInfo({ uid: scannedUID, lastTime: new Date().toLocaleTimeString('id-ID') });
          setActiveDrawer('double_tap');
        } else {
          toast.error(logRes.error);
        }
      } else {
        idempotencyKeyRef.current = null;
        // D. Success Overlay
        setSuccessVisitorName(selectedVisitor?.name || 'Wisatawan');
        setSuccessTitle(merchant.merchant_type === 'loket' ? 'Tap Masuk Berhasil' : 'Pembayaran Berhasil');
        if (logRes.loyalty?.enabled) {
          setLoyaltyInfo(logRes.loyalty);
          setSuccessSubtitle(logRes.loyalty.available_rewards > 0
            ? 'Reward siap digunakan!'
            : `${logRes.loyalty.remaining} kunjungan lagi untuk ${logRes.loyalty.reward}`);
        } else {
          setSuccessSubtitle('');
        }
        setActiveDrawer(null);
        setShowSuccessFlash(true);

        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 100]); // dua ketukan
        }

        // Reset
        setSelectedVisitor(null);
        setSelectedTag(null);
        setScannedUID('');

        // Reload data
        loadHistoryData(true);
      }
    } catch {
      toast.error('Pencatatan gagal');
    } finally {
      setConfirmTapLoading(false);
      isSubmittingRef.current = false;
    }
  }, [loadHistoryData, merchant, scannedUID, paymentAmount, selectedVisitor]);


  // 7. (Simulator removed — real NFC only)

  // 8. Register Tab State hooks
  const {
    register: regForm,
    handleSubmit: handleRegSubmit,
    reset: resetRegForm,
    formState: { errors: regErrors },
  } = useForm<RegisterVisitorInput>({
    resolver: zodResolver(registerVisitorSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      phone: '',
      ticket_type: 'Regular',
      credit_limit: 150000,
    }
  });

  const onRegisterSubmit = async (data: RegisterVisitorInput) => {
    if (!merchant || !newTagUID) return;
    setConfirmTapLoading(true);

    try {
      const res = await registerVisitor(data, newTagUID, merchant.id);
      if ('error' in res) {
        toast.error(res.error);
      } else {
        setSuccessVisitorName(res.visitor.name);
        setSuccessTitle('Pendaftaran Berhasil');
        setSuccessSubtitle('');
        setNewTagUID('');
        resetRegForm();

        // Close the registration sheet before showing success feedback.
        setActiveDrawer(null);
        setShowSuccessFlash(true);
      }
    } catch {
      toast.error('Registrasi gagal');
    } finally {
      setConfirmTapLoading(false);
    }
  };



  // 9. Export to CSV file
  const handleExportCSV = () => {
    if (historyTxs.length === 0) return;
    
    // CSV Header
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Waktu,Nama Wisatawan,Tipe Tiket,Nominal,Status WA\r\n';

    historyTxs.forEach(tx => {
      const nominal = tx.amount === 0 ? 'Entry' : tx.amount;
      const cleanName = (tx.visitor_name || 'Unknown').replace(/,/g, '');
      const cleanTicketType = tx.ticket_type || 'Regular';
      csvContent += `${tx.created_at},${cleanName},${cleanTicketType},${nominal},${tx.whatsapp_status}\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    const todayStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `laporan_${merchant?.id || 'terminal'}_${historyFilter}_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Laporan CSV diunduh!');
  };

  // 10. Settings Configuration handlers
  const handleUpdateDefaultNominal = (val: string) => {
    const num = Number(val);
    if (!isNaN(num) && num >= 0) {
      setDefaultNominal(num);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('ecotour_default_nominal', num.toString());
      }
    }
  };

  // Render Recharts volume data
  const chartData = useMemo(() => {
    const revenueByDay: { [date: string]: number } = {};
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    last7Days.forEach(day => {
      revenueByDay[day] = 0;
    });

    historyTxs.forEach(tx => {
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
        date: `${parts[2]}/${parts[1]}`,
        revenue
      };
    });
  }, [historyTxs]);

  if (authLoading || terminalLoading) {
    return (
      <div className="min-h-screen bg-[#f7f7f5] flex items-center justify-center flex-col gap-3">
        <LoadingSpinner size="lg" />
        <span className="text-xs font-bold text-[#64748b] tracking-wider uppercase">
          Memuat terminal...
        </span>
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="min-h-screen bg-[#f7f7f5] flex items-center justify-center flex-col p-6 text-center">
        <Store className="h-16 w-16 text-red-500 mb-4" />
        <h1 className="text-lg font-bold text-[#1e293b]">Terminal Tidak Terdaftar</h1>
        <p className="text-xs text-gray-500 max-w-xs mt-1">
          Akun ini belum dipasangkan dengan Merchant mana pun. Silakan hubungi administrator.
        </p>
        <Button onClick={() => signOut()} className="mt-4" size="sm">
          Keluar
        </Button>
      </div>
    );
  }

  const isEntryGate = merchant.merchant_type === 'loket';

  const getContainerBg = () => {
    if (nfcError || activeDrawer === 'error_unregistered' || activeDrawer === 'double_tap' || activeDrawer === 'credit_error') {
      return 'bg-[#fff1f2]'; // error state
    }
    if (activeDrawer === 'register') {
      return 'bg-[#E8F6FD]'; // registration mode
    }
    if (activeDrawer === 'topup') {
      return 'bg-[#E8F6FD]'; // top up mode
    }
    if (isScanning) {
      return 'bg-[#f0fdf4]'; // scanning active
    }
    return 'bg-[#f7f7f5]'; // normal/idle
  };

  const registeredByLabel = selectedTag?.registered_by
    ? `Pos ${selectedTag.registered_by.replace(/-/g, '').slice(0, 8).toUpperCase()}`
    : 'Loket';
  const terminalDisplayId = `${merchant.merchant_type === 'loket' ? 'POS' : 'TRM'}-${merchant.id
    .replace(/-/g, '')
    .slice(0, 8)
    .toUpperCase()}`;

  const handleRedeemReward = async () => {
    if (!merchant || !scannedUID) return;
    setConfirmTapLoading(true);
    try {
      const result = await redeemLoyaltyReward(scannedUID, merchant.id);
      setSuccessTitle('Reward Digunakan!');
      setSuccessVisitorName(selectedVisitor?.name || 'Wisatawan');
      setSuccessSubtitle(result.reward);
      setActiveDrawer(null);
      setShowSuccessFlash(true);
      setLoyaltyInfo(await fetchLoyaltyInfo(scannedUID, merchant.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reward gagal digunakan');
    } finally {
      setConfirmTapLoading(false);
    }
  };

  const closeVisitorDrawer = () => {
    setActiveDrawer(null);
    setSelectedVisitor(null);
    setSelectedTag(null);
    setScannedUID('');
    setPaymentAmount('');
    setShowManualAmount(false);
  };

  const resetTopUpSelection = () => {
    setTopUpVisitor(null);
    setTopUpTag(null);
    setTopUpScannedUID('');
    setTopUpAmount('');
    setTopUpNote('');
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#f7f7f5] lg:bg-slate-900 lg:py-8 flex items-center justify-center font-sans overflow-hidden">
      <Toaster position="top-center" richColors />
      
      {/* Emulated Mobile Frame container */}
      <div 
        className={`w-full h-[100dvh] max-h-[100dvh] lg:max-w-[448px] lg:h-[860px] lg:max-h-[calc(100dvh-4rem)] lg:rounded-[40px] lg:border-[10px] lg:border-slate-800 lg:shadow-2xl lg:overflow-hidden flex flex-col relative select-none ${getContainerBg()}`}
        style={{ transition: 'background-color 0.3s ease' }}
      >
        
        {/* Success Flash overlay portal */}
        <AnimatePresence>
          {showSuccessFlash && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 text-center p-6 ${successTitle === 'Reward Digunakan!' ? 'bg-amber-50' : 'bg-[#E8F6FD]'}`}
            >
              <motion.div
                initial={{ scale: 0.3, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 12 }}
                className={`w-24 h-24 rounded-full flex items-center justify-center text-white shadow-lg ${successTitle === 'Reward Digunakan!' ? 'bg-amber-500' : 'bg-[#29ABE2]'}`}
              >
                <CheckCircle2 className="h-12 w-12" />
              </motion.div>
              <div className="space-y-1">
                <h3 className={`text-lg font-black uppercase tracking-wide ${successTitle === 'Reward Digunakan!' ? 'text-amber-700' : 'text-[#29ABE2]'}`}>
                  {successTitle}
                </h3>
                <p className="text-sm font-bold text-[#1e293b]">{successVisitorName}</p>
                {successSubtitle && <p className="text-xs font-semibold text-[#64748b]">{successSubtitle}</p>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSuccessFlash(false)}
                className="mt-6 text-xs font-bold underline"
              >
                Selesai
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top Up Success Flash overlay portal */}
        <AnimatePresence>
          {topUpSuccessFlash && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#E8F6FD] z-50 flex flex-col items-center justify-center gap-4 text-center p-6"
            >
              <motion.div
                initial={{ scale: 0.3, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 12 }}
                className="w-24 h-24 rounded-full bg-[#29ABE2] flex items-center justify-center text-white shadow-lg"
              >
                <CheckCircle2 className="h-12 w-12" />
              </motion.div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-[#29ABE2] uppercase tracking-wide">
                  Top Up Berhasil!
                </h3>
                <p className="text-sm font-bold text-[#1e293b]">
                  {formatRupiah(topUpSuccessAmount)} ditambahkan ke {topUpSuccessVisitorName}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTopUpSuccessFlash(false)}
                className="mt-6 text-xs font-bold text-[#29ABE2] underline cursor-pointer"
              >
                Selesai
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 1. TopBar sticky */}
        <div className="bg-white border-b border-[#e5e3db] px-5 py-3.5 flex items-center justify-between shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-2.5 min-w-0">
            {isEntryGate && (
              <button
                onClick={() => setActiveDrawer('topup')}
                className={`p-2 rounded-xl border transition-colors cursor-pointer mr-1.5 ${
                  activeDrawer === 'topup'
                    ? 'bg-[#E8F6FD] text-[#29ABE2] border-[#cce8f5]'
                    : 'bg-white text-gray-400 hover:text-[#1e293b] border-[#e5e3db]'
                }`}
                title="Top Up Saldo"
                aria-label="Buka layanan top up saldo"
              >
                <Plus className="h-4.5 w-4.5" />
              </button>
            )}
            <WavrLogo variant="full" size="sm" className="mr-1.5 shrink-0" />
            <div className="text-left min-w-0">
              <h2 className="text-sm font-extrabold text-[#1e293b] truncate">
                {merchant.name}
              </h2>
              <span className="text-[9px] text-[#64748b] font-semibold tracking-wider uppercase truncate block">
                {merchant.location}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Online
            </span>
            <button
              onClick={() => setActiveDrawer('settings')}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                activeDrawer === 'settings'
                  ? 'bg-slate-100 text-[#1e293b] border-slate-300'
                  : 'text-gray-400 hover:text-[#1e293b] hover:bg-gray-100 border-[#e5e3db]'
              }`}
            >
              <Settings className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>



        {/* 3. Main Content Area */}
        <div className="flex-1 flex flex-col justify-between p-4 overflow-hidden">
          
          {/* NFC PULSE CONTAINER (60% height layout) */}
          <div className="flex-grow flex flex-col items-center justify-center text-center gap-6">
            
            {/* NFC Rings & Pulser */}
            <div className="relative w-44 h-44 flex items-center justify-center">
              
              {/* Concentric rings */}
              <div className="absolute inset-0 rounded-full border border-[#29ABE2]/20 animate-ping" />
              <div className="absolute inset-6 rounded-full border border-[#29ABE2]/35 animate-ping" style={{ animationDelay: '0.4s' }} />

              <button
                onClick={triggerNFCScan}
                disabled={isScanning || tapScenarioLoading}
                className="w-32 h-32 rounded-full bg-[#29ABE2] hover:bg-[#1C95C6] active:scale-95 transition-all text-white flex flex-col items-center justify-center gap-2.5 shadow-lg shadow-[#29ABE2]/25 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed z-10"
              >
                <SmartphoneNfc className={`h-11 w-11 ${isScanning ? 'animate-bounce' : ''}`} />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {isScanning ? 'PULSE ON' : isEntryGate ? 'SCAN' : 'TAP'}
                </span>
              </button>
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-black text-[#1e293b]">
                {isEntryGate ? 'Pendaftaran & Tap Masuk' : 'Tempelkan Souvenir'}
              </h3>
              <p className="text-xs text-[#64748b] font-semibold">
                {isEntryGate
                  ? 'Scan gelang baru untuk pendaftaran, atau gelang terdaftar untuk tap masuk'
                  : 'Dekatkan gelang atau kalung wisatawan ke HP'}
              </p>
            </div>

            {/* Compatibility Warnings */}
            {nfcError && !activeDrawer && (
              <div className="bg-red-50 border border-red-200 text-[#DC2626] text-[10px] font-bold px-3.5 py-2.5 rounded-2xl flex items-start gap-2 max-w-xs mx-auto text-left leading-normal">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                <div>
                  <p className="font-extrabold">Web NFC Tidak Tersedia</p>
                  <p className="text-[9px] font-medium text-red-600 mt-0.5">NFC Reader hanya didukung pada Chrome Android melalui koneksi HTTPS.</p>
                </div>
              </div>
            )}
          </div>



          {/* STATS OVERVIEW CARD */}
          <div className="bg-white border border-[#e5e3db] rounded-2xl p-3 flex items-center justify-between shadow-2xs my-1 text-left shrink-0">
            <div>
              <p className="text-[9px] font-bold text-[#64748b] uppercase tracking-wider">Tapping Hari Ini</p>
              <h4 className="text-xs font-black text-[#1e293b] mt-0.5">{historyStats.today.count} Taps</h4>
            </div>
            {!isEntryGate && (
              <div className="text-right">
                <p className="text-[9px] font-bold text-[#64748b] uppercase tracking-wider">Revenue Hari Ini</p>
                <h4 className="text-xs font-black text-[#29ABE2] mt-0.5">{formatRupiah(historyStats.today.total)}</h4>
              </div>
            )}
          </div>

          {/* COLLAPSIBLE 5 LAST TRANSACTIONS */}
          <div 
            onClick={() => setActiveDrawer('history')}
            className="bg-white border border-[#e5e3db] rounded-2xl p-3.5 shadow-2xs hover:shadow-xs transition-shadow cursor-pointer text-left shrink-0 select-none mt-1"
          >
            <div className="flex items-center justify-between border-b border-[#e5e3db] pb-2 mb-2">
              <span className="text-[10px] font-black text-[#1e293b] uppercase tracking-wider flex items-center gap-1">
                <History className="h-3.5 w-3.5 text-slate-400" /> Riwayat 5 Terakhir
              </span>
              <span className="text-[9px] font-bold text-[#29ABE2] uppercase tracking-wider bg-[#E8F6FD] px-2 py-0.5 rounded-full">
                Lihat Semua
              </span>
            </div>
            
            <div className="space-y-1.5">
              {latestTransactions.map((tx) => (
                <div key={tx.id} className="flex justify-between items-center text-[10px] text-[#1e293b]">
                  <span className="font-bold flex items-center gap-1.5 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                    {tx.visitor_name || 'Wisatawan'}
                  </span>
                  <span className="font-semibold text-gray-400 font-mono text-[9px] shrink-0 ml-2">
                    {tx.type === 'entry' ? 'Masuk' : tx.source === 'reward' ? 'Reward' : tx.source === 'pos' ? `POS ${formatRupiah(tx.amount)}` : formatRupiah(tx.amount)} | {new Date(tx.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
              {latestTransactions.length === 0 && (
                <p className="text-[10px] text-gray-400 font-medium py-1 text-center">Belum ada transaksi</p>
              )}
            </div>
          </div>

        </div>

        <MerchantNav active="tap" onHistory={() => setActiveDrawer('history')} />

        {/* ===================================================================
            MODALS & DRAWERS (SLIDE-UP SHEETS)
            =================================================================== */}

        {/* A. VISITOR CARD DRAWER */}
        <Modal
          isOpen={activeDrawer === 'visitor'}
          onClose={closeVisitorDrawer}
          title="Data Kartu Wisatawan"
          footer={selectedVisitor && selectedTag ? (
            <div className="flex flex-col gap-1.5">
              {(() => {
                const isValidAmount = Number(paymentAmount) > 0;
                const isHighlighted = !isEntryGate && isValidAmount;

                return (
                  <button
                    type="button"
                    onClick={() => handleConfirmTap(false)}
                    disabled={confirmTapLoading || !selectedTag.is_active || (!isEntryGate && !isValidAmount)}
                    className={`w-full rounded-xl py-3 text-xs font-black uppercase tracking-wider transition-colors ${
                      isEntryGate
                        ? 'bg-[#29ABE2] text-white hover:bg-[#1C95C6]'
                        : isHighlighted
                        ? 'bg-[#29ABE2] text-white hover:bg-[#1C95C6] shadow-md shadow-[#29ABE2]/25'
                        : 'cursor-not-allowed border border-slate-300 bg-slate-200 text-slate-400'
                    }`}
                  >
                    {confirmTapLoading
                      ? 'Memproses...'
                      : isEntryGate
                      ? 'Konfirmasi Tap Masuk'
                      : `Konfirmasi Pembayaran ${formatRupiah(Number(paymentAmount || 0))}`}
                  </button>
                );
              })()}
              <button
                type="button"
                onClick={closeVisitorDrawer}
                disabled={confirmTapLoading}
                className="py-1.5 text-xs font-bold text-[#64748b]"
              >
                Tutup
              </button>
            </div>
          ) : undefined}
        >
          {selectedVisitor && selectedTag && (
            <div className="flex flex-col gap-3 text-left">
              
              {/* Header Visitor Profile */}
              <div className="flex items-center gap-3 bg-white p-3 border border-[#e5e3db] rounded-2xl">
                <div className="w-12 h-12 rounded-2xl bg-[#E8F6FD] text-[#29ABE2] font-black flex items-center justify-center text-sm border border-[#29ABE2]/20">
                  {selectedVisitor.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-extrabold text-[#1e293b] leading-tight">
                    {selectedVisitor.name}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant={selectedVisitor.ticket_type}>
                      {selectedVisitor.ticket_type}
                    </Badge>
                    <span className="text-[9px] font-mono text-gray-400 tracking-wider">
                      {selectedTag.uid}
                    </span>
                  </div>
                </div>
              </div>

              {/* Info Rows */}
              <div className="bg-white p-3 border border-[#e5e3db] rounded-2xl text-[11px] space-y-2 text-gray-500">
                <div className="flex justify-between">
                  <span>No. HP WhatsApp</span>
                  <span className="font-bold text-[#1e293b]">{selectedVisitor.phone || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Terdaftar Oleh Pos</span>
                  <span
                    className="font-bold text-[#1e293b]"
                    title={selectedTag.registered_by || 'Loket'}
                  >
                    {registeredByLabel}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Tanggal Masuk</span>
                  <span className="font-bold text-[#1e293b]">{new Date(selectedTag.registered_at).toLocaleDateString()}</span>
                </div>
              </div>

              {!isEntryGate && (
                <LoyaltyCard
                  info={loyaltyInfo}
                  loading={loyaltyLoading}
                  onRedeem={loyaltyInfo?.available_rewards ? handleRedeemReward : undefined}
                />
              )}

              {/* Credit details progress bar */}
              {selectedVisitor.credit_limit > 0 && (
                <div className="bg-white p-4 border border-[#e5e3db] rounded-2xl space-y-2">
                  <div className="flex justify-between text-xs font-bold text-[#1e293b]">
                    <span>Sisa Kredit NFC</span>
                    <span className={
                      (selectedVisitor.credit_limit - selectedVisitor.credit_used) / selectedVisitor.credit_limit > 0.5
                        ? 'text-[#29ABE2]'
                        : (selectedVisitor.credit_limit - selectedVisitor.credit_used) / selectedVisitor.credit_limit > 0.2
                        ? 'text-amber-600'
                        : 'text-red-600'
                    }>
                      Sisa: {formatRupiah(selectedVisitor.credit_limit - selectedVisitor.credit_used)}
                    </span>
                  </div>
                  
                  {/* Progress Line */}
                  <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden relative">
                    <div
                      className={`h-full transition-all duration-300 ${
                        (selectedVisitor.credit_limit - selectedVisitor.credit_used) / selectedVisitor.credit_limit > 0.5
                          ? 'bg-[#29ABE2]'
                          : (selectedVisitor.credit_limit - selectedVisitor.credit_used) / selectedVisitor.credit_limit > 0.2
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.max(0, Math.min(100, ((selectedVisitor.credit_limit - selectedVisitor.credit_used) / selectedVisitor.credit_limit) * 100))}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                    <span>Terpakai: {formatRupiah(selectedVisitor.credit_used)}</span>
                    <span>Total Limit: {formatRupiah(selectedVisitor.credit_limit)}</span>
                  </div>
                </div>
              )}

              {/* Quick Preset Grid Nominal (Regular merchant payment only) */}
              {!isEntryGate && (
                <div className="bg-white p-4 border border-[#e5e3db] rounded-2xl flex flex-col gap-3">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#64748b]">
                    Nominal Belanja (Rp)
                  </label>

                  {!showManualAmount ? (
                    <>
                      {/* Grid 2x3 */}
                      <div className="grid grid-cols-2 gap-2.5">
                        {[25000, 50000, 75000, 100000, 150000, 200000].map((val) => {
                          const isSelected = Number(paymentAmount) === val;
                          return (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setPaymentAmount(val.toString())}
                              className={`py-3 text-center text-xs font-black rounded-xl transition-all cursor-pointer border active:scale-98 ${
                                isSelected
                                  ? 'bg-[#29ABE2] text-white border-transparent shadow-xs'
                                  : 'bg-[#f7f7f5] text-[#1e293b] border-[#e5e3db] hover:bg-slate-100'
                              }`}
                            >
                              {formatRupiah(val)}
                            </button>
                          );
                        })}
                      </div>

                      {/* Manual Trigger */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowManualAmount(true);
                          setPaymentAmount('');
                        }}
                        className="w-full py-2.5 text-center text-xs font-bold text-slate-500 bg-slate-50 border border-[#e5e3db] border-dashed rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        Jumlah lain...
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          disabled={confirmTapLoading}
                          autoFocus
                          placeholder="Masukkan nominal"
                          className="flex-1 px-4 py-2.5 text-sm bg-[#f7f7f5] text-[#29ABE2] font-black border border-[#e5e3db] rounded-xl outline-none focus:border-[#29ABE2]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setShowManualAmount(false);
                            setPaymentAmount('');
                          }}
                          className="px-3.5 bg-slate-100 border border-[#e5e3db] text-[#1e293b] font-bold rounded-xl text-xs hover:bg-slate-200 cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                      {paymentAmount && !isNaN(Number(paymentAmount)) && (
                        <span className="text-[10px] font-bold text-gray-400 text-left mt-0.5">
                          Preview: {formatRupiah(Number(paymentAmount))}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </Modal>

        {/* B. LAYANAN LOKET DRAWER */}
        <Modal
          deferContent
          isOpen={activeDrawer === 'register' || activeDrawer === 'topup'}
          onClose={() => {
            setActiveDrawer(null);
            setTopUpVisitor(null);
            setTopUpTag(null);
            setTopUpScannedUID('');
            setNewTagUID('');
          }}
          title={activeDrawer === 'register' ? 'Pendaftaran Gelang Baru' : 'Top Up Saldo'}
          footer={activeDrawer === 'topup' && topUpVisitor && topUpTag ? (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={handleConfirmTopUp}
                disabled={topUpLoading || !(parseInt(topUpAmount.replace(/\./g, ''), 10) > 0)}
                className="w-full rounded-xl bg-[#29ABE2] py-3 text-xs font-black text-white shadow-sm transition-colors hover:bg-[#1C95C6] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                {topUpLoading ? 'Memproses...' : 'Konfirmasi Top Up'}
              </button>
              <button
                type="button"
                onClick={resetTopUpSelection}
                disabled={topUpLoading}
                className="py-1.5 text-xs font-bold text-[#64748b]"
              >
                Batal & Scan Ulang
              </button>
            </div>
          ) : undefined}
        >
          <div className="flex flex-col gap-5 text-left">
            {/* Registration is entered only after the main scanner reads an unknown UID. */}
            {activeDrawer === 'register' && (
              <div className="flex flex-col gap-4 text-left">
                  <form onSubmit={handleRegSubmit(onRegisterSubmit)} className="flex flex-col gap-4 text-left">
                    <div className="border-b border-[#e5e3db] pb-3 mb-1">
                      <span className="text-[10px] font-bold text-[#29ABE2] uppercase tracking-widest block">
                        RFID Terpaut
                      </span>
                      <span className="text-xs font-mono font-bold text-[#1e293b] tracking-wider block truncate select-all">
                        {newTagUID}
                      </span>
                    </div>

                    <Input
                      label="Nama Lengkap Wisatawan *"
                      placeholder="Masukkan nama"
                      error={regErrors.name?.message}
                      icon={<Scan className="h-4 w-4 text-[#29ABE2]" />}
                      disabled={confirmTapLoading}
                      {...regForm('name')}
                    />

                    <Input
                      label="Nomor HP WhatsApp"
                      placeholder="Contoh: 08123456789"
                      error={regErrors.phone?.message}
                      icon={<Activity className="h-4 w-4" />}
                      disabled={confirmTapLoading}
                      {...regForm('phone')}
                    />

                    <div className="flex flex-col gap-1.5 text-left">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#64748b]">
                        Jenis Tiket
                      </label>
                      <select
                        disabled={confirmTapLoading}
                        className="w-full px-4 py-2.5 text-sm bg-white text-[#1e293b] border border-[#e5e3db] rounded-xl outline-none focus:border-[#29ABE2] focus:ring-2 focus:ring-[#E8F6FD] transition-colors duration-150"
                        {...regForm('ticket_type')}
                      >
                        <option value="Regular">Regular</option>
                        <option value="VIP">VIP</option>
                        <option value="Family">Family</option>
                        <option value="Group">Group</option>
                      </select>
                    </div>

                    <Input
                      label="Batas Kredit Awal (Rp)"
                      type="number"
                      placeholder="150000"
                      error={regErrors.credit_limit?.message}
                      disabled={confirmTapLoading}
                      {...regForm('credit_limit', { valueAsNumber: true })}
                    />

                    <div className="flex gap-2.5 mt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setNewTagUID('');
                          resetRegForm();
                          setActiveDrawer(null);
                        }}
                        disabled={confirmTapLoading}
                        className="w-1/3 text-xs border border-[#e5e3db] font-bold"
                      >
                        Batal
                      </Button>
                      <button
                        type="submit"
                        disabled={confirmTapLoading}
                        className="w-2/3 text-xs font-black bg-[#29ABE2] hover:bg-[#1C95C6] focus:ring-[#29ABE2] text-white py-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        {confirmTapLoading ? 'Memproses...' : 'Daftarkan Gelang'}
                      </button>
                    </div>
                  </form>
              </div>
            )}

            {/* TAB TOP UP CONTENT */}
            {activeDrawer === 'topup' && (
              <div className="flex flex-col gap-4 text-left animate-fadeIn">
                {!topUpVisitor || !topUpTag ? (
                  /* Scanner Screen */
                  <div className="flex flex-col items-center text-center gap-6 py-4">
                    <div className="relative w-32 h-32 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border border-[#29ABE2]/20 animate-ping" />
                      <div className="absolute inset-4 rounded-full border border-[#29ABE2]/35 animate-ping" style={{ animationDelay: '0.4s' }} />

                      <button
                        type="button"
                        onClick={triggerTopUpNFCScan}
                        disabled={isTopUpScanning || topUpScanLoading}
                        className="w-24 h-24 rounded-full bg-[#29ABE2] hover:bg-[#1C95C6] active:scale-95 transition-all text-white flex flex-col items-center justify-center gap-1.5 shadow-lg shadow-[#29ABE2]/20 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed z-10"
                      >
                        <SmartphoneNfc className={`h-8 w-8 ${isTopUpScanning ? 'animate-bounce' : ''}`} />
                        <span className="text-[9px] font-black uppercase tracking-widest">
                          {isTopUpScanning ? 'ON' : 'TAP'}
                        </span>
                      </button>
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-sm font-black text-[#1e293b]">Tempelkan Gelang</h3>
                      <p className="text-xs text-[#64748b] font-medium">Scan gelang terdaftar untuk melakukan top up</p>
                    </div>

                    {topUpScanLoading ? (
                      <div className="w-full py-3 px-4 border border-[#cce8f5] bg-[#E8F6FD] rounded-xl text-xs font-bold text-[#29ABE2] text-center animate-pulse">
                        Memproses...
                      </div>
                    ) : (
                      <div className="w-full py-3 px-4 border border-[#cce8f5] bg-[#E8F6FD] rounded-xl text-xs font-bold text-[#29ABE2] text-center">
                        Menunggu tap NFC gelang...
                      </div>
                    )}
                  </div>
                ) : (
                  /* Form Input Top Up */
                  <div className="flex flex-col gap-4">
                    {/* Profile Header */}
                    <div className="flex items-center gap-3 bg-white p-3 border border-[#e5e3db] rounded-2xl">
                      <div className="w-11 h-11 rounded-2xl bg-[#E8F6FD] text-[#29ABE2] font-black flex items-center justify-center text-sm border border-[#cce8f5]">
                        {topUpVisitor.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-extrabold text-[#1e293b] leading-tight">{topUpVisitor.name}</h4>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant={topUpVisitor.ticket_type}>{topUpVisitor.ticket_type}</Badge>
                          <span className="text-[9px] font-mono text-gray-400 tracking-wider">{topUpTag.uid}</span>
                        </div>
                      </div>
                    </div>

                    {/* Limit status */}
                    <div className="bg-white p-4 border border-[#e5e3db] rounded-2xl space-y-2">
                      <div className="flex justify-between text-xs font-bold text-[#1e293b]">
                        <span>Kredit Saat Ini</span>
                        <span className="text-[#29ABE2]">
                          Sisa: {topUpVisitor.credit_limit === 0 ? 'Unlimited' : formatRupiah(topUpVisitor.credit_limit - topUpVisitor.credit_used)}
                        </span>
                      </div>
                      
                      {/* Progress Line */}
                      <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden relative">
                        <div
                          className="h-full bg-[#29ABE2] transition-all duration-300"
                          style={{ width: `${topUpVisitor.credit_limit === 0 ? 0 : Math.max(0, Math.min(100, (topUpVisitor.credit_used / topUpVisitor.credit_limit) * 100))}%` }}
                        />
                      </div>
                      
                      <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                        <span>Terpakai: {formatRupiah(topUpVisitor.credit_used)}</span>
                        <span>Total Limit: {topUpVisitor.credit_limit === 0 ? 'Unlimited' : formatRupiah(topUpVisitor.credit_limit)}</span>
                      </div>
                    </div>

                    {/* Inputs */}
                    <div className="bg-white p-4 border border-[#e5e3db] rounded-2xl flex flex-col gap-3">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#64748b]">
                        Nominal Top Up
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[50000, 100000, 200000, 500000].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setTopUpAmount(val.toLocaleString('id-ID'))}
                            className="py-2.5 text-center text-xs font-bold text-[#29ABE2] bg-[#E8F6FD] border border-transparent rounded-xl hover:bg-[#D5EEFC] transition-colors cursor-pointer active:scale-95"
                          >
                            {formatRupiah(val)}
                          </button>
                        ))}
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-gray-400 block font-semibold mt-1">atau masukkan nominal lain:</span>
                        <Input
                          placeholder="Masukkan nominal"
                          value={topUpAmount}
                          onChange={(e) => {
                            const cleaned = e.target.value.replace(/\D/g, '');
                            if (!cleaned) {
                              setTopUpAmount('');
                            } else {
                              setTopUpAmount(parseInt(cleaned, 10).toLocaleString('id-ID'));
                            }
                          }}
                          icon={<span className="text-xs font-bold text-gray-500 select-none">Rp</span>}
                        />
                      </div>
                    </div>

                    {/* Preview limit */}
                    {(() => {
                      const cleanAmt = parseInt(topUpAmount.replace(/\./g, ''), 10) || 0;
                      const newLimit = Number(topUpVisitor.credit_limit) + cleanAmt;
                      const isValid = cleanAmt > 0;

                      return (
                        <div className={`p-3.5 rounded-xl border text-xs font-bold flex justify-between items-center transition-all ${
                          isValid
                            ? 'bg-green-50 border-green-200 text-green-700'
                            : 'bg-[#f1efe9]/50 border-[#e5e3db] text-gray-400'
                        }`}>
                          <span>Batas kredit setelah top up:</span>
                          <span>{topUpVisitor.credit_limit === 0 ? 'Unlimited' : formatRupiah(newLimit)}</span>
                        </div>
                      );
                    })()}

                    <Input
                      label="Catatan (Opsional)"
                      placeholder="Pembelian paket..."
                      value={topUpNote}
                      onChange={(e) => setTopUpNote(e.target.value)}
                    />

                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>

        {/* C. TAG NOT REGISTERED WARNING */}
        <Modal
          isOpen={activeDrawer === 'error_unregistered'}
          onClose={() => {
            setActiveDrawer(null);
            setScannedUID('');
          }}
          title="Chip Tidak Dikenal"
        >
          <div className="flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-[#DC2626] shadow-sm shrink-0">
              <AlertTriangle className="h-8 w-8" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-black text-[#1e293b]">Pass Tidak Terdaftar</h3>
              <p className="text-xs text-[#64748b] leading-relaxed">
                Gelang NFC dengan serial code UID di bawah belum didaftarkan pada database loket utama.
              </p>
              <span className="inline-block font-mono font-bold text-xs bg-slate-100 px-3 py-1.5 rounded-lg text-slate-700 tracking-wider mt-2">
                {scannedUID}
              </span>
            </div>

            <div className="flex flex-col gap-2.5 w-full pt-2">
              {isEntryGate && (
                <button
                  type="button"
                  onClick={() => {
                    setNewTagUID(scannedUID);
                    setActiveDrawer('register');
                  }}
                  className="w-full text-xs font-black bg-[#29ABE2] hover:bg-[#1C95C6] focus:ring-[#29ABE2] text-white py-3 rounded-xl transition-colors cursor-pointer text-center"
                >
                  Daftarkan Sekarang
                </button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveDrawer(null);
                  setScannedUID('');
                }}
                className="w-full text-xs font-bold border border-[#e5e3db] bg-[#f7f7f5] text-[#1e293b]"
              >
                Tutup Notifikasi
              </Button>
            </div>
          </div>
        </Modal>

        {/* D. DOUBLE TAP WARNING DRAWER */}
        <Modal
          isOpen={activeDrawer === 'double_tap'}
          onClose={() => {
            setActiveDrawer(null);
            setScannedUID('');
            setDoubleTapInfo(null);
          }}
          title="Proteksi Tap Ganda"
        >
          <div className="flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-[#D97706] shadow-sm shrink-0">
              <Zap className="h-8 w-8" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-black text-amber-600">Double Tap Terdeteksi</h3>
              <p className="text-xs text-[#64748b] leading-relaxed max-w-xs">
                Sistem mencegah transaksi ganda tidak disengaja. Gelang yang sama baru saja dipindai pada jam:
              </p>
              <div className="bg-slate-100 font-bold text-xs p-3 rounded-xl text-slate-700 font-mono inline-block tracking-wider">
                UID: {doubleTapInfo?.uid} <br />
                <span className="text-[10px] text-gray-400 font-medium font-sans">Tap Terakhir: {doubleTapInfo?.lastTime}</span>
              </div>
            </div>

            <div className="flex gap-2.5 w-full pt-3">
              <button
                type="button"
                onClick={() => handleConfirmTap(true)}
                className="w-1/2 text-xs font-black bg-amber-500 hover:bg-amber-600 focus:ring-amber-450 text-white py-3 rounded-xl transition-all cursor-pointer text-center"
              >
                Lanjutkan Tetap
              </button>
              <Button
                variant="ghost"
                onClick={() => {
                  setActiveDrawer(null);
                  setScannedUID('');
                  setDoubleTapInfo(null);
                }}
                className="w-1/2 text-xs font-bold border border-[#e5e3db]"
              >
                Batal
              </Button>
            </div>
          </div>
        </Modal>

        {/* E. CREDIT EXHAUSTED / ERROR DRAWER */}
        <Modal
          isOpen={activeDrawer === 'credit_error'}
          onClose={() => {
            setActiveDrawer(null);
            setCreditErrorDetails(null);
          }}
          title="Potongan Kredit Gagal"
        >
          {creditErrorDetails && (
            <div className="flex flex-col items-center text-center gap-5">
              <div className="w-16 h-16 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-500 shadow-sm shrink-0 animate-bounce">
                <XCircle className="h-8 w-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-black text-red-600">Kredit Tidak Cukup</h3>
                <p className="text-xs text-[#64748b] leading-relaxed max-w-xs">
                  Transaksi tap souvenir ditolak karena sisa saldo wisatawan berada di bawah nominal yang diminta.
                </p>
              </div>

              <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Nominal Diminta</span>
                  <span className="font-extrabold text-red-600">{formatRupiah(creditErrorDetails.requested)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="text-gray-400">Sisa Kredit Aktif</span>
                  <span className="font-extrabold text-amber-600">{formatRupiah(creditErrorDetails.remaining)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="text-gray-400">Batas Kredit Awal</span>
                  <span className="font-extrabold text-slate-800">{formatRupiah(creditErrorDetails.limit)}</span>
                </div>
              </div>

              <Button
                variant="primary"
                onClick={() => {
                  setActiveDrawer(null);
                  setCreditErrorDetails(null);
                }}
                className="w-full text-xs font-bold mt-2"
              >
                Tutup
              </Button>
            </div>
          )}
        </Modal>

        {/* F. SETTINGS CONFIGURATION DRAWER */}
        <Modal
          isOpen={activeDrawer === 'settings'}
          onClose={() => setActiveDrawer(null)}
          title="Setelan Terminal"
        >
          <div className="flex flex-col gap-5 text-left">
            {/* Card Preset Nominal */}
            {!isEntryGate && (
              <div className="bg-white border border-[#e5e3db] rounded-3xl p-5 shadow-xs flex flex-col gap-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-[#1e293b] border-b border-[#e5e3db] pb-2">
                  Preset Belanja Souvenir
                </h3>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#64748b]">
                    Nominal Default Tap (Rp)
                  </label>
                  <input
                    type="number"
                    value={defaultNominal}
                    onChange={(e) => handleUpdateDefaultNominal(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm bg-white text-[#29ABE2] font-bold border border-[#e5e3db] rounded-xl outline-none focus:border-[#29ABE2]"
                  />
                </div>
              </div>
            )}

            {/* Card Informasi Terminal */}
            <div className="bg-white border border-[#e5e3db] rounded-3xl p-5 shadow-xs flex flex-col gap-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-[#1e293b] border-b border-[#e5e3db] pb-2">
                Informasi Terminal
              </h3>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Terminal ID</span>
                  <span className="font-mono font-bold text-[#1e293b]" title={merchant.id}>
                    {terminalDisplayId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Nama Partner</span>
                  <span className="font-bold text-[#1e293b]">{merchant.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Lokasi Pos</span>
                  <span className="font-bold text-[#1e293b]">{merchant.location}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Kategori Merchant</span>
                  <span className="font-bold text-[#1e293b]">{merchant.category}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Tipe Terminal</span>
                  <Badge variant={merchant.merchant_type === 'loket' ? 'VIP' : 'Family'}>
                    {merchant.merchant_type === 'loket' ? 'Loket Entry' : 'Regular Merchant'}
                  </Badge>
                </div>
              </div>
            </div>


            {/* Card Akun */}
            <div className="bg-white border border-[#e5e3db] rounded-3xl p-5 shadow-xs flex flex-col gap-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-[#1e293b] border-b border-[#e5e3db] pb-2">
                Akun Petugas
              </h3>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">Email</span>
                <span className="font-bold text-[#1e293b] truncate max-w-[150px]">{user?.email}</span>
              </div>
              <Button
                onClick={() => setShowLogoutConfirm(true)}
                variant="danger"
                size="sm"
                className="w-full mt-2 font-bold flex items-center justify-center gap-2"
              >
                <LogOut className="h-4 w-4" /> Keluar Sesi
              </Button>
            </div>
          </div>
        </Modal>

        {/* G. HISTORY LIST DRAWER */}
        <Modal
          isOpen={activeDrawer === 'history'}
          onClose={() => setActiveDrawer(null)}
          title="Riwayat Transaksi"
        >
          <div className="flex flex-col gap-5 text-left">
            
            {/* Summary metrics cards */}
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3.5">
              <div className="col-span-2">
                <StatCard
                  label="Belanja Hari Ini"
                  value={formatRupiah(historyStats.today.total)}
                  subtext={`${historyStats.today.count} transaksi tap`}
                  tone="green"
                  icon={<Activity className="h-5 w-5" />}
                />
              </div>
              <StatCard
                label="Minggu Ini"
                value={formatRupiah(historyStats.thisWeek.total)}
                subtext={`${historyStats.thisWeek.count} taps`}
                tone="blue"
              />
              <StatCard
                label="Bulan Ini"
                value={formatRupiah(historyStats.thisMonth.total)}
                subtext={`${historyStats.thisMonth.count} taps`}
                tone="amber"
              />
            </div>

            {/* Filters Bar */}
            <div className="bg-white border border-[#e5e3db] rounded-3xl p-4 flex flex-col gap-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#e5e3db] pb-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-[#1e293b]">
                  Filter & Unduh
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadHistoryData(false)}
                    disabled={historyFetchLoading || historyRefreshing}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-[#1e293b] hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`h-4 w-4 ${historyRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={handleExportCSV}
                    disabled={historyTxs.length === 0 || historyFetchLoading}
                    className="flex items-center gap-1.5 text-[10px] font-bold bg-[#E8F6FD] text-[#29ABE2] hover:bg-[#D5EEFC] px-2.5 py-1 rounded-full cursor-pointer disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </button>
                </div>
              </div>

              {/* Filter selections */}
              <div className="grid grid-cols-4 gap-1.5 text-[10px] font-bold">
                {(['hari', 'minggu', 'bulan', 'custom'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setHistoryFilter(f)}
                    className={`py-1.5 rounded-lg border text-center transition-all cursor-pointer ${
                      historyFilter === f
                        ? 'bg-[#29ABE2] border-[#29ABE2] text-white'
                        : 'bg-[#f7f7f5] border-[#e5e3db] text-[#64748b] hover:bg-slate-100'
                    }`}
                  >
                    {f === 'hari' ? 'Hari Ini' : f === 'minggu' ? '7 Hari' : f === 'bulan' ? '30 Hari' : 'Custom'}
                  </button>
                ))}
              </div>

              {/* Custom Date pickers */}
              {historyFilter === 'custom' && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-[#64748b] font-bold">DARI</span>
                    <input
                      type="date"
                      value={customDateFrom}
                      onChange={(e) => setCustomDateFrom(e.target.value)}
                      className="p-2 border border-[#e5e3db] rounded-lg bg-[#f7f7f5] text-[#1e293b]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-[#64748b] font-bold">SAMPAI</span>
                    <input
                      type="date"
                      value={customDateTo}
                      onChange={(e) => setCustomDateTo(e.target.value)}
                      className="p-2 border border-[#e5e3db] rounded-lg bg-[#f7f7f5] text-[#1e293b]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Recharts chart trend (not shown for 'hari' filter) */}
            {historyFilter !== 'hari' && historyTxs.length > 0 && (
              <div className="bg-white border border-[#e5e3db] rounded-3xl p-4 shadow-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748b] block mb-3">
                  Tren Belanja Souvenir (Harian)
                </span>
                <div className="h-44 w-full">
                  <RevenueChart data={chartData} />
                </div>
              </div>
            )}

            {/* Log lists */}
            <div className="bg-white border border-[#e5e3db] rounded-3xl p-5 shadow-xs flex flex-col gap-3">
              <span className="text-xs font-black uppercase tracking-wider text-[#1e293b]">
                Daftar Transaksi
              </span>

              <div className="flex flex-col gap-3">
                {historyFetchLoading && historyTxs.length === 0 ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b border-[#f7f7f5] animate-pulse">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-slate-200" />
                        <div className="space-y-1">
                          <div className="h-3 w-24 bg-slate-200 rounded" />
                          <div className="h-2.5 w-16 bg-slate-200 rounded" />
                        </div>
                      </div>
                      <div className="h-3 w-16 bg-slate-200 rounded" />
                    </div>
                  ))
                ) : historyTxs.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-[#e5e3db] rounded-2xl flex flex-col items-center justify-center gap-2">
                    <History className="h-6 w-6 text-gray-300" />
                    <p className="text-xs text-gray-400">Tidak ada riwayat tap ditemukan</p>
                  </div>
                ) : (
                  historyTxs.map(tx => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between py-2 border-b border-[#f7f7f5] text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8.5 h-8.5 rounded-full bg-slate-100 flex items-center justify-center font-extrabold text-[#1e293b] shrink-0 border border-slate-200">
                          {(tx.visitor_name || 'Unknown').substring(0, 2).toUpperCase()}
                        </div>
                        <div className="text-left min-w-0">
                          <p className="font-bold text-[#1e293b] truncate">{tx.visitor_name}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {formatDatetime(tx.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`font-black ${tx.type === 'entry' ? 'text-[#29ABE2]' : 'text-red-600'}`}>
                          {tx.type === 'entry' ? 'Entry' : tx.source === 'reward' ? 'GRATIS' : tx.source === 'pos' ? `POS ${formatRupiah(tx.amount)}` : `-${formatRupiah(tx.amount)}`}
                        </span>
                        <span className="text-[9px] font-bold text-green-600 block mt-0.5 bg-green-50 px-1 rounded-full border border-green-100 text-center">
                          Synced
                        </span>
                      </div>
                    </div>
                  ))
                )}

                {/* Load more */}
                {historyTxs.length < historyTotalCount && (
                  <button
                    onClick={loadMoreHistory}
                    disabled={historyFetchLoading}
                    className="w-full text-center py-2.5 text-xs text-[#29ABE2] hover:text-[#1C95C6] hover:bg-[#E8F6FD] rounded-xl border border-dashed border-[#29ABE2]/30 mt-2 font-bold cursor-pointer transition-colors"
                  >
                    {historyFetchLoading ? 'Memuat...' : `Tampilkan Lebih Banyak (${historyTxs.length} dari ${historyTotalCount})`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </Modal>

        {/* H. CONFIRM LOGOUT */}
        <ConfirmDialog
          isOpen={showLogoutConfirm}
          onClose={() => setShowLogoutConfirm(false)}
          onConfirm={() => {
            signOut();
            setShowLogoutConfirm(false);
          }}
          title="Konfirmasi Logout"
          message="Yakin ingin keluar? Sesi terminal aktif Anda akan berakhir."
          confirmLabel="Keluar"
        />
      </div>
    </div>
  );
}


