'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Shield, Bell, Menu } from 'lucide-react';

interface NavbarProps {
  onMenuClick: () => void;
}

export const AdminNavbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
  const pathname = usePathname();
  const { user } = useAuth();

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
        <button className="p-2 rounded-xl text-[#64748b] hover:text-[#1e293b] hover:bg-[#f7f7f5] transition-colors relative cursor-pointer">
          <Bell className="h-4.5 w-4.5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

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
