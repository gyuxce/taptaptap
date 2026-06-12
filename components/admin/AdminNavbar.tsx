'use client';

import React, { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Shield, Bell, Menu } from 'lucide-react';
import { checkMerchantActivity, SilentMerchant } from '@/lib/services/alertService';
import { formatPhoneForWA } from '@/lib/utils';

interface NavbarProps {
  onMenuClick: () => void;
}

export const AdminNavbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
  const pathname = usePathname();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState<SilentMerchant[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getSectionTitle = () => {
    switch (pathname) {
      case '/dashboard':
        return 'Overview Dashboard';
      case '/visitors':
        return 'Pendaftaran Wisatawan';
      case '/merchants':
        return 'Daftar Merchant Aktif';
      case '/transactions':
        return 'Audit Log Transaksi NFC';
      default:
        return 'EcoTour Admin';
    }
  };

  useEffect(() => {
    const fetchAlerts = async () => {
      const activeAlerts = await checkMerchantActivity();
      setAlerts(activeAlerts);
    };
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <header className="h-16 border-b border-[#e5e3db] bg-white flex items-center justify-between px-6 md:px-8 sticky top-0 z-20 shrink-0">
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger menu */}
        <button
          onClick={onMenuClick}
          className="p-2 -ml-2 rounded-xl text-[#64748b] hover:text-[#1e293b] hover:bg-[#f7f7f5] transition-colors md:hidden cursor-pointer"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div>
          <h2 className="text-sm md:text-base font-black text-[#1e293b] leading-tight">
            {getSectionTitle()}
          </h2>
          <p className="text-[10px] text-[#64748b] hidden sm:block font-semibold mt-0.5">
            Skala Sistem: 50+ Merchant aktif terintegrasi
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Alerts count badge */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 rounded-xl text-[#64748b] hover:text-[#1e293b] hover:bg-[#f7f7f5] transition-colors relative cursor-pointer"
          >
            <Bell className="h-4.5 w-4.5" />
            {alerts.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>

          {isOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-[#e5e3db] rounded-2xl shadow-xl z-30 p-4 text-left flex flex-col gap-2.5">
              <div className="flex items-center justify-between pb-2 border-b border-[#f7f7f5]">
                <span className="text-xs font-black text-[#1e293b] uppercase tracking-wider">
                  Notifikasi Sistem ({alerts.length})
                </span>
                {alerts.length > 0 && (
                  <span className="text-[9px] bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded-full">
                    Merchant Inaktif
                  </span>
                )}
              </div>

              <div className="max-h-60 overflow-y-auto flex flex-col gap-2.5 pr-0.5">
                {alerts.length === 0 ? (
                  <div className="py-6 flex flex-col items-center justify-center gap-1.5 text-[#64748b] text-center">
                    <Bell className="h-6 w-6 text-[#cbd5e1]" />
                    <p className="text-xs font-bold">Semua merchant aktif berjalan normal</p>
                    <p className="text-[10px] text-gray-400">Tidak ada notifikasi baru saat ini.</p>
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <div key={alert.id} className="p-2.5 bg-[#fcfbf9] border border-[#e5e3db] rounded-xl flex flex-col gap-2 text-xs">
                      <div className="flex justify-between items-start gap-1">
                        <span className="font-extrabold text-slate-800 line-clamp-1">{alert.name}</span>
                        <span className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md shrink-0">
                          {alert.hours_since_last_activity} jam pasif
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium leading-normal">
                        Belum ada aktivitas transaksi terdeteksi di {alert.location}.
                      </p>
                      <a
                        href={`https://wa.me/${formatPhoneForWA(alert.phone) || '6281234567890'}?text=Halo%20${encodeURIComponent(alert.name)}%20Partner%20EcoTour.%20Sistem%20mendeteksi%20belum%20ada%20aktivitas%20tap%20selama%20${alert.hours_since_last_activity}%20jam%20terakhir.%20Apakah%20ada%20kendala%20alat%20tap%3F`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-1.5 bg-[#1D9E75] hover:bg-[#157959] text-white text-[10px] font-extrabold rounded-lg text-center transition-colors shadow-xs"
                      >
                        Hubungi via WhatsApp
                      </a>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-6 w-[1px] bg-[#e5e3db]" />

        {/* User profile details */}
        <div className="flex items-center gap-2 bg-[#f7f7f5] border border-[#e5e3db] px-3 py-1.5 rounded-xl">
          <div className="w-5.5 h-5.5 rounded-full bg-[#1D9E75]/10 flex items-center justify-center text-[#1D9E75]">
            <Shield className="h-3.5 w-3.5" />
          </div>
          <div className="text-left hidden xs:block">
            <p className="text-[10px] font-bold text-[#1e293b] leading-tight">Administrator</p>
            <p className="text-[9px] text-[#64748b] font-semibold truncate max-w-[100px] mt-0.5">
              {user?.email || 'admin@ecotour.com'}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
