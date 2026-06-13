'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Visitor, RFIDTag, CreditTopUp } from '@/types';
import { 
  updateVisitor, 
  toggleTagStatus, 
  getTopUpHistory 
} from '@/lib/services/visitorService';
import { registerVisitorSchema } from '@/lib/validations';
import { formatRupiah, formatDatetime } from '@/lib/utils';
import { toast } from '@/components/ui/Toast';
import { ShieldAlert, History, User, CreditCard } from 'lucide-react';

interface EditVisitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  visitor: Visitor | null;
  tag: RFIDTag | null;
  onSuccess: () => void;
}

export const EditVisitorModal: React.FC<EditVisitorModalProps> = ({
  isOpen,
  onClose,
  visitor,
  tag,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'data' | 'rfid'>('data');
  
  // Tab 1 Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [ticketType, setTicketType] = useState<Visitor['ticket_type']>('Regular');
  const [creditLimitStr, setCreditLimitStr] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveLoading, setSaveLoading] = useState(false);

  // Tab 2 states
  const [tagActive, setTagActive] = useState(true);
  const [topupHistory, setTopupHistory] = useState<CreditTopUp[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);

  // Sync state when visitor changes
  useEffect(() => {
    if (visitor) {
      setName(visitor.name);
      setPhone(visitor.phone || '');
      setTicketType(visitor.ticket_type);
      setCreditLimitStr(visitor.credit_limit.toLocaleString('id-ID'));
      setErrors({});
      setActiveTab('data');
    }
  }, [visitor, isOpen]);

  // Sync tag active status
  useEffect(() => {
    if (tag) {
      setTagActive(tag.is_active);
    }
  }, [tag, isOpen]);

  const loadTopupHistory = useCallback(async () => {
    if (!visitor) return;
    setHistoryLoading(true);
    try {
      const res = await getTopUpHistory(visitor.id);
      if (res.error) {
        toast.error(res.error);
      } else {
        setTopupHistory(res.topups || []);
      }
    } catch {
      toast.error('Gagal memuat riwayat top up');
    } finally {
      setHistoryLoading(false);
    }
  }, [visitor]);

  // Load history when RFID tab is selected
  useEffect(() => {
    if (isOpen && activeTab === 'rfid' && visitor) {
      void loadTopupHistory();
    }
  }, [isOpen, activeTab, visitor, loadTopupHistory]);

  // Format amount input on change (e.g. 50.000)
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, '');
    if (!rawVal) {
      setCreditLimitStr('');
      // Real-time onChange validation
      setErrors(prev => ({ ...prev, credit_limit: 'Batas kredit wajib diisi' }));
      return;
    }
    
    const parsedNum = parseInt(rawVal, 10);
    setCreditLimitStr(parsedNum.toLocaleString('id-ID'));

    // Real-time onChange validation for amount limits
    if (parsedNum < 0) {
      setErrors(prev => ({ ...prev, credit_limit: 'Batas kredit tidak boleh negatif' }));
    } else if (parsedNum > 10000000) {
      setErrors(prev => ({ ...prev, credit_limit: 'Batas kredit maksimal Rp 10.000.000' }));
    } else {
      setErrors(prev => {
        const newErrs = { ...prev };
        delete newErrs.credit_limit;
        return newErrs;
      });
    }
  };

  // Text field onBlur validations
  const validateField = (field: 'name' | 'phone') => {
    const res = field === 'name'
      ? registerVisitorSchema.shape.name.safeParse(name)
      : registerVisitorSchema.shape.phone.safeParse(phone);
    if (!res.success) {
      setErrors(prev => ({ ...prev, [field]: res.error.issues[0].message }));
    } else {
      setErrors(prev => {
        const newErrs = { ...prev };
        delete newErrs[field];
        return newErrs;
      });
    }
  };

  const handleSaveData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitor) return;

    // Final validation
    const rawLimit = parseInt(creditLimitStr.replace(/\./g, ''), 10) || 0;
    const dataToValidate = {
      name,
      phone: phone || undefined,
      ticket_type: ticketType,
      credit_limit: rawLimit
    };

    const validation = registerVisitorSchema.safeParse(dataToValidate);
    if (!validation.success) {
      const errMap: Record<string, string> = {};
      validation.error.issues.forEach(issue => {
        const path = issue.path[0] as string;
        errMap[path] = issue.message;
      });
      setErrors(errMap);
      toast.error('Periksa kembali data yang Anda masukkan');
      return;
    }

    setSaveLoading(true);
    try {
      const res = await updateVisitor(visitor.id, dataToValidate);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success('Data wisatawan berhasil diperbarui');
        onSuccess();
        onClose();
      }
    } catch {
      toast.error('Terjadi kesalahan saat menyimpan data');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleToggleRFID = async () => {
    if (!tag || !visitor) return;
    setToggleLoading(true);
    const targetStatus = !tagActive;
    try {
      // Hardcoded 'admin' actor as this is in Admin Panel
      const res = await toggleTagStatus(tag.id, targetStatus, 'admin');
      if (res.error) {
        toast.error(res.error);
      } else {
        setTagActive(targetStatus);
        toast.success(`Gelang RFID berhasil ${targetStatus ? 'diaktifkan' : 'dinonaktifkan'}`);
        onSuccess();
      }
    } catch {
      toast.error('Gagal memperbarui status RFID');
    } finally {
      setToggleLoading(false);
    }
  };

  return (
    <Modal deferContent isOpen={isOpen} onClose={onClose} title="Edit Wisatawan">
      {/* Tabs Selector */}
      <div className="flex border-b border-[#e5e3db] -mx-6 -mt-6 mb-6 bg-white px-6">
        <button
          onClick={() => setActiveTab('data')}
          className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition-all cursor-pointer ${
            activeTab === 'data'
              ? 'border-[#29ABE2] text-[#29ABE2]'
              : 'border-transparent text-gray-400 hover:text-[#1e293b]'
          }`}
        >
          Data Wisatawan
        </button>
        <button
          onClick={() => setActiveTab('rfid')}
          className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition-all cursor-pointer ${
            activeTab === 'rfid'
              ? 'border-[#29ABE2] text-[#29ABE2]'
              : 'border-transparent text-gray-400 hover:text-[#1e293b]'
          }`}
        >
          Status Tag RFID
        </button>
      </div>

      {activeTab === 'data' && (
        <form onSubmit={handleSaveData} className="space-y-4 text-left">
          <Input
            label="Nama Lengkap"
            placeholder="Masukkan nama wisatawan"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => validateField('name')}
            error={errors.name}
            icon={<User className="h-4 w-4" />}
          />

          <Input
            label="Nomor HP"
            placeholder="Contoh: 081234567890"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => validateField('phone')}
            error={errors.phone}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-[#64748b]">
              Tipe Tiket
            </label>
            <select
              value={ticketType}
              onChange={(e) => setTicketType(e.target.value as Visitor['ticket_type'])}
              className="w-full px-4 py-2.5 text-sm bg-white text-[#1e293b] border border-[#e5e3db] rounded-xl outline-none focus:border-[#29ABE2] focus:ring-2 focus:ring-[#E8F6FD]"
            >
              <option value="Regular">Regular</option>
              <option value="VIP">VIP</option>
              <option value="Family">Family</option>
              <option value="Group">Group</option>
            </select>
          </div>

          <div className="space-y-1">
            <Input
              label="Batas Kredit (Limit Rp)"
              placeholder="0"
              value={creditLimitStr}
              onChange={handleAmountChange}
              error={errors.credit_limit}
              icon={<CreditCard className="h-4 w-4" />}
            />
            <p className="text-[10px] text-gray-400 italic font-medium leading-relaxed pl-1">
              * Mengubah batas kredit tidak mereset kredit yang sudah terpakai
            </p>
          </div>

          <div className="flex gap-3 pt-4 border-t border-[#e5e3db]">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="flex-1"
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={saveLoading}
              className="flex-1"
            >
              Simpan Perubahan
            </Button>
          </div>
        </form>
      )}

      {activeTab === 'rfid' && (
        <div className="space-y-6 text-left">
          {/* RFID Tag Status Card */}
          <div className="bg-white border border-[#e5e3db] rounded-2xl p-4 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider block">
                  RFID UID Gelang
                </span>
                <span className="text-base font-mono font-black text-[#1e293b] tracking-widest mt-0.5 block">
                  {tag ? tag.uid : 'BELUM TERDAFTAR'}
                </span>
              </div>
              <Badge variant={tagActive ? 'active' : 'inactive'}>
                {tagActive ? 'Aktif' : 'Nonaktif'}
              </Badge>
            </div>

            {tag ? (
              <div className="flex items-center justify-between p-3 bg-[#fbfbfa] rounded-xl border border-[#e5e3db]/60">
                <span className="text-xs font-bold text-[#64748b]">
                  Status Keaktifan
                </span>
                <button
                  type="button"
                  disabled={toggleLoading}
                  onClick={handleToggleRFID}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    tagActive ? 'bg-[#29ABE2]' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      tagActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            ) : null}

            {!tagActive && (
              <div className="flex gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-medium leading-relaxed">
                <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
                <span>
                  <strong>Peringatan:</strong> Wisatawan tidak bisa tap di manapun selama gelang RFID dinonaktifkan.
                </span>
              </div>
            )}
          </div>

          {/* Top Up History list */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-[#1e293b] flex items-center gap-2">
              <History className="h-4 w-4 text-[#29ABE2]" /> Riwayat Top Up Kredit
            </h4>

            {historyLoading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-12 bg-white border border-[#e5e3db] rounded-xl" />
                <div className="h-12 bg-white border border-[#e5e3db] rounded-xl" />
                <div className="h-12 bg-white border border-[#e5e3db] rounded-xl" />
              </div>
            ) : topupHistory.length === 0 ? (
              <div className="bg-white border border-[#e5e3db] rounded-xl p-6 text-center text-xs text-gray-400 font-medium">
                Belum ada riwayat pengisian kredit untuk wisatawan ini.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {topupHistory.map((topup) => (
                  <div
                    key={topup.id}
                    className="flex justify-between items-center p-3 bg-white border border-[#e5e3db] rounded-xl shadow-xs"
                  >
                    <div>
                      <span className="text-xs font-black text-[#1e293b]">
                        +{formatRupiah(topup.amount)}
                      </span>
                      <span className="text-[10px] text-gray-400 block mt-0.5 font-medium">
                        Oleh: {topup.top_up_by_name || topup.top_up_by} • {formatDatetime(topup.created_at)}
                      </span>
                      {topup.note && (
                        <span className="text-[10px] text-[#29ABE2] block mt-1 bg-[#E8F6FD] px-2 py-0.5 rounded-md w-fit font-semibold">
                          Catatan: {topup.note}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-[#e5e3db] flex justify-end">
            <Button variant="ghost" onClick={onClose} className="w-full">
              Tutup
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
