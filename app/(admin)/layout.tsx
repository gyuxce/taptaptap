'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminNavbar } from '@/components/admin/AdminNavbar';
import { motion, AnimatePresence } from 'motion/react';

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

  if (loading || !user || !profile || profile.role !== 'admin') {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] flex flex-row relative font-sans text-[#1e293b]">
      {/* Desktop Sidebar */}
      <AdminSidebar className="hidden md:flex shrink-0" />

      {/* Mobile Sidebar overlay */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-40 flex md:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileSidebarOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            />
            {/* Slide menu */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="relative z-10 flex flex-col h-full bg-slate-900"
            >
              <AdminSidebar onCloseMobile={() => setIsMobileSidebarOpen(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
