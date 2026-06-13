'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Visitor, RFIDTag, CreditTopUp } from '@/types';
import { topUpCredit, getTopUpHistory } from '@/lib/services/visitorService';
import { formatRupiah, formatDatetime } from '@/lib/utils';
import { toast } from '@/components/ui/Toast';
import { CheckCircle2, Coins, Plus, History } from 'lucide-react';

interface TopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  visitor: Visitor | null;
  tag: RFIDTag | null;
  onSuccess: () => void;
}

export const TopUpModal: React.FC<TopUpModalProps> = ({
  isOpen,
  onClose,
  visitor,
  tag,
  onSuccess,
}) => {
  const [amountStr, setAmountStr] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<CreditTopUp[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [successAmount, setSuccessAmount] = useState<number | null>(null);

  const loadRecentTopups = useCallback(async () => {
    if (!visitor) return;
    setHistoryLoading(true);
    try {
      const res = await getTopUpHistory(visitor.id);
      if (!res.error) {
        setHistory(res.topups.slice(0, 3));
      }
    } catch {
      // ignore silently
    } finally {
      setHistoryLoading(false);
    }
  }, [visitor]);

  useEffect(() => {
    if (isOpen) {
      setAmountStr('');
      setNote('');
      setErrors({});
      setSuccessAmount(null);
      const timer = window.setTimeout(() => void loadRecentTopups(), 180);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, loadRecentTopups]);

  const handleAmountChange = (val: string) => {
    const rawVal = val.replace(/\D/g, '');
    if (!rawVal) {
      setAmountStr('');
      setErrors(prev => ({ ...prev, amount: 'Nominal top up wajib diisi' }));
      return;
    }

    const parsedNum = parseInt(rawVal, 10);
    setAmountStr(parsedNum.toLocaleString('id-ID'));

    // Real-time onChange validation
    if (parsedNum <= 0) {
      setErrors(prev => ({ ...prev, amount: 'Nominal harus lebih besar dari Rp 0' }));
    } else if (parsedNum > 5000000) {
      setErrors(prev => ({ ...prev, amount: 'Maksimal sekali top up adalah Rp 5.000.000' }));
    } else {
      setErrors(prev => {
        const newErrs = { ...prev };
        delete newErrs.amount;
        return newErrs;
      });
    }
  };

  const applyPreset = (amount: number) => {
    setAmountStr(amount.toLocaleString('id-ID'));
    setErrors(prev => {
      const newErrs = { ...prev };
      delete newErrs.amount;
      return newErrs;
    });
  };

  const handleConfirm = async () => {
    if (!visitor || !tag) {
      toast.error('Data wisatawan atau gelang RFID tidak valid');
      return;
    }

    const cleanAmount = parseInt(amountStr.replace(/\./g, ''), 10) || 0;
    if (cleanAmount <= 0) {
      setErrors(prev => ({ ...prev, amount: 'Nominal harus lebih besar dari Rp 0' }));
      return;
    }
    if (cleanAmount > 5000000) {
      setErrors(prev => ({ ...prev, amount: 'Maksimal sekali top up adalah Rp 5.000.000' }));
      return;
    }

    setLoading(true);
    try {
      // Admin top-up bypasses merchant, so actor is 'admin'
      const res = await topUpCredit(tag.uid, cleanAmount, 'admin', note || undefined);
      if (res.success) {
        setSuccessAmount(cleanAmount);
        setAmountStr('');
        setNote('');
      } else {
        toast.error(res.error || 'Gagal melakukan top up');
      }
    } catch {
      toast.error('Terjadi kesalahan pada sistem');
    } finally {
      setLoading(false);
    }
  };

  const currentLimit = visitor ? visitor.credit_limit : 0;
  const typedAmount = parseInt(amountStr.replace(/\./g, ''), 10) || 0;
  const newLimit = currentLimit + typedAmount;
  const handleFinish = () => {
    onClose();
    onSuccess();
  };

  return (
    <Modal
      deferContent
      isOpen={isOpen}
      onClose={loading ? () => undefined : successAmount ? handleFinish : onClose}
      title={successAmount ? 'Top Up Berhasil' : 'Top Up Kredit Wisatawan'}
      footer={!successAmount && visitor && tag ? (
        <div className="flex gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
            className="flex-1"
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleConfirm}
            loading={loading}
            className="flex-1 bg-[#29ABE2] hover:bg-[#1C95C6]"
          >
            Konfirmasi Top Up
          </Button>
        </div>
      ) : successAmount ? (
        <Button type="button" onClick={handleFinish} className="w-full">
          Selesai
        </Button>
      ) : undefined}
    >
      {successAmount ? (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#E8F6FD] text-[#29ABE2]">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <div>
            <h3 className="text-lg font-black text-[#1e293b]">Saldo berhasil ditambahkan</h3>
            <p className="mt-1 text-sm font-bold text-[#29ABE2]">{formatRupiah(successAmount)}</p>
            <p className="mt-1 text-xs text-[#64748b]">Untuk {visitor?.name}</p>
          </div>
        </div>
      ) : (
      <div className="space-y-5 text-left">
        {/* Info Card */}
        <div className="bg-white border border-[#e5e3db] rounded-2xl p-4 flex gap-3.5 items-center">
          <div className="h-10 w-10 bg-[#E8F6FD] text-[#29ABE2] rounded-xl flex items-center justify-center shrink-0">
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
              Nama Wisatawan
            </span>
            <span className="text-sm font-bold text-[#1e293b] mt-0.5 block">
              {visitor?.name}
            </span>
            <span className="text-[11px] text-[#64748b] font-medium block mt-0.5">
              Batas Kredit Saat Ini: <strong className="text-[#1e293b]">{visitor?.credit_limit === 0 ? 'Unlimited' : formatRupiah(visitor?.credit_limit || 0)}</strong>
            </span>
          </div>
        </div>

        {/* Amount Input */}
        <div className="space-y-2.5">
          <Input
            label="Nominal Top Up (Rp)"
            placeholder="Contoh: 50.000"
            value={amountStr}
            onChange={(e) => handleAmountChange(e.target.value)}
            error={errors.amount}
            icon={<Plus className="h-4.5 w-4.5" />}
          />

          {/* Quick presets */}
          <div className="grid grid-cols-4 gap-2">
            {[50000, 100000, 200000, 500000].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyPreset(preset)}
                className="py-2 px-1 text-center text-xs font-bold text-[#29ABE2] bg-[#E8F6FD] border border-transparent rounded-xl hover:bg-[#D5EEFC] transition-colors cursor-pointer active:scale-95"
              >
                +{preset >= 1000 ? `${preset / 1000}k` : preset}
              </button>
            ))}
          </div>
        </div>

        {/* Note Input */}
        <Input
          label="Catatan (Opsional)"
          placeholder="Tulis alasan top up atau info pembayaran..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {/* New Limit Preview */}
        {typedAmount > 0 && !errors.amount && (
          <div className="p-3 bg-[#fbfbfa] border border-[#e5e3db] rounded-xl flex justify-between items-center text-xs">
            <span className="text-[#64748b] font-bold">Batas Kredit Baru:</span>
            <span className="font-black text-[#29ABE2] text-sm">
              {visitor?.credit_limit === 0 ? 'Unlimited' : formatRupiah(newLimit)}
            </span>
          </div>
        )}

        {/* Last 3 Top Ups */}
        <div className="space-y-2.5">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-[#64748b] flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" /> 3 Top Up Terakhir
          </h4>

          {historyLoading ? (
            <div className="h-14 bg-white border border-[#e5e3db] rounded-xl animate-pulse" />
          ) : history.length === 0 ? (
            <div className="bg-white border border-[#e5e3db] rounded-xl p-4 text-center text-xs text-gray-400 font-medium">
              Belum ada riwayat top up sebelumnya.
            </div>
          ) : (
            <div className="space-y-1.5">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex justify-between items-center p-2.5 bg-white border border-[#e5e3db] rounded-xl text-[10px] shadow-2xs"
                >
                  <div>
                    <span className="font-bold text-[#1e293b]">+{formatRupiah(h.amount)}</span>
                    <span className="text-gray-400 block font-medium">
                      {formatDatetime(h.created_at)}
                    </span>
                  </div>
                  {h.note && (
                    <span className="text-[9px] text-[#29ABE2] bg-[#E8F6FD] px-1.5 py-0.5 rounded font-semibold max-w-[120px] truncate">
                      {h.note}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
      )}
    </Modal>
  );
};
