'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminNavbar } from '@/components/admin/AdminNavbar';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Auth Protection Guard
  useEffect(() => {
    if (!loading) {
      if (!user || !profile) {
        router.push('/');
        return;
      }
      if (profile.role !== 'admin') {
        router.push('/tap');
      }
    }
  }, [user, profile, loading, router]);

  useEffect(() => {
    if (!isMobileSidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileSidebarOpen]);

  if (loading || !user || !profile || profile.role !== 'admin') {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] flex flex-row relative font-sans text-[#1e293b]">
      {/* Desktop Sidebar */}
      <AdminSidebar className="hidden md:flex shrink-0" userEmail={user.email} />

      {/* Mobile Sidebar overlay */}
      {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-40 flex md:hidden isolate">
            {/* Backdrop */}
            <button
              aria-label="Tutup menu"
              onClick={() => setIsMobileSidebarOpen(false)}
              className="fixed inset-0 bg-black/45 animate-overlay-in"
            />
            {/* Slide menu */}
            <div className="relative z-10 flex h-full flex-col bg-slate-900 animate-sidebar-in transform-gpu will-change-transform">
              <AdminSidebar
                userEmail={user.email}
                onCloseMobile={() => setIsMobileSidebarOpen(false)}
              />
            </div>
          </div>
      )}

      {/* Main content frame */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <AdminNavbar onMenuClick={() => setIsMobileSidebarOpen(true)} />
        <main className="flex-grow p-4 md:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
