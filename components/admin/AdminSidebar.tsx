'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth';
import { LayoutDashboard, Users, Store, History, LogOut, FileBarChart } from 'lucide-react';
import { WavrLogo } from '@/components/ui/WavrLogo';

interface SidebarProps {
  className?: string;
  onCloseMobile?: () => void;
  userEmail?: string | null;
}

export const AdminSidebar: React.FC<SidebarProps> = ({ className, onCloseMobile, userEmail }) => {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    router.push('/');
    router.refresh();
  };

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Wisatawan', href: '/visitors', icon: Users },
    { name: 'Merchant', href: '/merchants', icon: Store },
    { name: 'Transaksi', href: '/transactions', icon: History },
    { name: 'Laporan', href: '/reports', icon: FileBarChart },
  ];


  return (
    <aside className={`w-[240px] bg-[#1B2340] border-r border-[#24335c] flex flex-col justify-between h-screen sticky top-0 text-slate-200 shrink-0 ${className}`}>
      <div className="flex flex-col flex-1">
        {/* Header */}
        <div className="p-6 border-b border-[#24335c] flex items-center justify-start gap-2.5">
          <WavrLogo variant="white" size="md" />
        </div>

        {/* Navigation */}
        <nav className="flex-grow p-4 flex flex-col gap-1.5 mt-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                className={`flex items-center gap-3.5 px-4 py-3 rounded-xl text-xs font-bold transition-all duration-200 ${
                  isActive
                    ? 'bg-[#29ABE2] text-white shadow-lg shadow-[#29ABE2]/15'
                    : 'text-[#94A3B8] hover:text-white hover:bg-[rgba(41,171,226,0.15)]'
                }`}
              >
                <Icon className={`h-4.5 w-4.5 shrink-0 ${isActive ? 'text-white' : 'text-[#94A3B8]'}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User Info & Logout */}
      <div className="p-4 border-t border-[#24335c] bg-[#13192f] flex flex-col gap-3">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-[#24335c] flex items-center justify-center text-slate-300 font-extrabold text-xs">
            AD
          </div>
          <div className="text-left min-w-0">
            <p className="text-xs font-black text-white truncate">Administrator</p>
            <p className="text-[10px] text-[#94A3B8] font-medium truncate">
              {userEmail || 'admin@wavr.com'}
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-red-400 hover:bg-red-950/30 hover:text-red-500 border border-red-900/20 hover:border-red-900/40 transition-all duration-200 cursor-pointer"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Keluar Sesi</span>
        </button>
      </div>
    </aside>
  );
};
