'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { db, isSupabaseConfigured } from '@/lib/supabase';
import { Visitor, RFIDTag, Transaction } from '@/types';
import { formatRupiah, formatDatetime } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Search, ChevronRight, History, ShieldAlert } from 'lucide-react';
import { toast } from '@/components/ui/Toast';
import { resetCredit } from '@/lib/services/visitorService';
import { EditVisitorModal } from '@/components/admin/EditVisitorModal';
import { TopUpModal } from '@/components/admin/TopUpModal';
import { VisitorJourneyDrawer } from '@/components/admin/VisitorJourneyDrawer';

export default function AdminVisitorsPage() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [tags, setTags] = useState<RFIDTag[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [ticketFilter, setTicketFilter] = useState<string>('all');
  
  // Expanded Rows state
  const [expandedRows, setExpandedRows] = useState<string[]>([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Reset Credit modal dialog
  const [confirmResetData, setConfirmResetData] = useState<{
    id: string;
    name: string;
    remaining: number;
  } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  // Edit & Top Up states
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [selectedTag, setSelectedTag] = useState<RFIDTag | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  // Visitor Journey Drawer states
  const [selectedJourneyVisitor, setSelectedJourneyVisitor] = useState<Visitor | null>(null);
  const [isJourneyOpen, setIsJourneyOpen] = useState(false);

  const handleEditClick = (vis: Visitor, tag: RFIDTag | null) => {
    setSelectedVisitor(vis);
    setSelectedTag(tag);
    setIsEditOpen(true);
  };

  const handleTopUpClick = (vis: Visitor, tag: RFIDTag | null) => {
    setSelectedVisitor(vis);
    setSelectedTag(tag);
    setIsTopUpOpen(true);
  };

  const handleJourneyClick = (vis: Visitor) => {
    setSelectedJourneyVisitor(vis);
    setIsJourneyOpen(true);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const vis = await db.getVisitors();
      const tg = await db.getRFIDTags();
      const tx = await db.getTransactions();
      
      setVisitors(vis);
      setTags(tg);
      setTransactions(tx);
    } catch (err) {
      toast.error('Gagal mengambil data wisatawan');
    } finally {
      setLoading(false);
    }
  };

  const handleResetClick = (vis: Visitor) => {
    const remaining = vis.credit_limit === 0 ? 0 : Math.max(0, vis.credit_limit - vis.credit_used);
    setConfirmResetData({
      id: vis.id,
      name: vis.name,
      remaining,
    });
  };

  const handleConfirmReset = async () => {
    if (!confirmResetData) return;
    setResetLoading(true);

    try {
      // Call service / endpoint
      if (isSupabaseConfigured) {
        const res = await fetch('/api/admin/reset-credit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitorId: confirmResetData.id, actorUserId: 'admin' }),
        });
        const resJson = await res.json();
        if (resJson.success) {
          toast.success(`Kredit ${confirmResetData.name} berhasil direset!`);
        } else {
          toast.error(resJson.error || 'Gagal reset kredit');
        }
      } else {
        // simulation
        await resetCredit(confirmResetData.id, 'admin');
        toast.success(`Kredit ${confirmResetData.name} berhasil direset!`);
      }
      
      // reload
      await loadData();
    } catch (err) {
      toast.error('Terjadi kendala saat reset');
    } finally {
      setResetLoading(false);
      setConfirmResetData(null);
    }
  };

  // Filter & Search computation
  const filteredVisitors = useMemo(() => {
    return visitors.filter(v => {
      const tag = tags.find(t => t.visitor_id === v.id);
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        v.name.toLowerCase().includes(query) ||
        (v.phone && v.phone.includes(query)) ||
        (tag && tag.uid.toLowerCase().includes(query));
      
      const matchesTicket = ticketFilter === 'all' || v.ticket_type === ticketFilter;

      return matchesSearch && matchesTicket;
    });
  }, [visitors, tags, searchQuery, ticketFilter]);

  // Paginated Slicing
  const paginatedVisitors = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredVisitors.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredVisitors, currentPage]);

  const totalPages = Math.ceil(filteredVisitors.length / itemsPerPage);

  if (loading) {
    return (
      <div className="flex flex-col gap-6 w-full animate-pulse">
        <div className="h-8 w-48 bg-slate-200 rounded" />
        <div className="flex gap-4">
          <div className="h-10 w-2/3 bg-slate-200 rounded" />
          <div className="h-10 w-1/3 bg-slate-200 rounded" />
        </div>
        <div className="h-96 bg-white border border-[#e5e3db] rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <div className="flex justify-between items-center">
        <div>
          <span className="text-xs font-bold text-[#1D9E75] uppercase tracking-wider block">
            Kelola Wisatawan
          </span>
          <h1 className="text-xl md:text-2xl font-black text-[#1e293b] mt-0.5">
            Pendaftaran & Limit Kredit Gelang RFID
          </h1>
        </div>
        <Badge variant="neutral">{filteredVisitors.length} Total</Badge>
      </div>

      {/* Filter and search bar */}
      <div className="bg-white border border-[#e5e3db] rounded-2xl p-4 flex flex-col md:flex-row gap-3 shadow-xs">
        <div className="flex-grow">
          <Input
            placeholder="Cari berdasarkan nama, nomor HP, atau UID gelang..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            icon={<Search className="h-4.5 w-4.5" />}
          />
        </div>
        <div className="min-w-[180px]">
          <select
            value={ticketFilter}
            onChange={(e) => {
              setTicketFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full px-4 py-2.5 text-sm bg-white text-[#1e293b] border border-[#e5e3db] rounded-xl outline-none focus:border-[#1D9E75]"
          >
            <option value="all">Semua Tipe Tiket</option>
            <option value="Regular">Regular</option>
            <option value="VIP">VIP</option>
            <option value="Family">Family</option>
            <option value="Group">Group</option>
          </select>
        </div>
      </div>

      {/* Table container */}
      <div className="bg-white border border-[#e5e3db] rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#e5e3db] text-[#64748b] font-bold uppercase tracking-wider bg-[#fbfbfa]">
                <th className="p-4 w-6"></th>
                <th className="py-4 px-2">Nama Wisatawan</th>
                <th className="py-4 px-2">No. HP</th>
                <th className="py-4 px-2">Tipe</th>
                <th className="py-4 px-2">RFID UID</th>
                <th className="py-4 px-2">Sisa Kredit</th>
                <th className="py-4 px-2">Tgl Daftar</th>
                <th className="py-4 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paginatedVisitors.map((vis) => {
                const tag = tags.find(t => t.visitor_id === vis.id);
                const remaining = vis.credit_limit === 0 ? Infinity : Math.max(0, vis.credit_limit - vis.credit_used);
                const progressWidth = vis.credit_limit === 0 ? 100 : ((vis.credit_limit - vis.credit_used) / vis.credit_limit) * 100;

                return (
                  <React.Fragment key={vis.id}>
                    <tr 
                      onClick={() => handleJourneyClick(vis)}
                      className="border-b border-[#f7f7f5] hover:bg-[#f7f7f5]/30 transition-colors cursor-pointer"
                    >
                      <td className="p-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleJourneyClick(vis);
                          }}
                          className="p-1 rounded hover:bg-slate-100 text-gray-400 cursor-pointer"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </td>
                      <td className="py-3 px-2 font-bold text-[#1e293b]">{vis.name}</td>
                      <td className="py-3 px-2 text-[#64748b] font-semibold">{vis.phone || '-'}</td>
                      <td className="py-3 px-2">
                        <Badge variant={vis.ticket_type}>{vis.ticket_type}</Badge>
                      </td>
                      <td className="py-3 px-2 font-mono font-bold tracking-wider text-slate-500">
                        {tag ? tag.uid : <span className="text-red-500 font-sans">No Tag</span>}
                      </td>
                      <td className="py-3 px-2">
                        {vis.credit_limit === 0 ? (
                          <span className="font-extrabold text-[#1D9E75]">Unlimited</span>
                        ) : (
                          <div className="flex flex-col gap-1 w-[130px]">
                            <span className="font-bold text-[#1e293b]">
                              {formatRupiah(remaining)}
                            </span>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  progressWidth > 50 ? 'bg-[#1D9E75]' : progressWidth > 20 ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${Math.max(0, Math.min(100, progressWidth))}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2 text-gray-500 font-medium">{new Date(vis.created_at).toLocaleDateString()}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex gap-1.5 justify-end">
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJourneyClick(vis);
                            }}
                            variant="ghost"
                            size="sm"
                            className="text-[10px] font-bold border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 rounded-lg cursor-pointer"
                          >
                            Journey
                          </Button>
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTopUpClick(vis, tag || null);
                            }}
                            disabled={!tag}
                            variant="ghost"
                            size="sm"
                            className="text-[10px] font-bold border border-green-200 text-[#1D9E75] bg-green-50 hover:bg-green-100 hover:text-green-700 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Top Up
                          </Button>
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditClick(vis, tag || null);
                            }}
                            variant="ghost"
                            size="sm"
                            className="text-[10px] font-bold border border-amber-200 text-amber-600 bg-amber-50 hover:bg-amber-100 hover:text-amber-700 rounded-lg cursor-pointer"
                          >
                            Edit
                          </Button>
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResetClick(vis);
                            }}
                            disabled={vis.credit_limit === 0 || vis.credit_used === 0}
                            variant="ghost"
                            size="sm"
                            className="text-[10px] font-bold border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 hover:text-red-600 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Reset
                          </Button>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
              {filteredVisitors.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-gray-400">
                    Tidak ada data wisatawan terdaftar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination buttons */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-[#e5e3db] flex items-center justify-between bg-[#fbfbfa] text-xs">
            <span className="text-[#64748b] font-medium">
              Menampilkan {Math.min(filteredVisitors.length, (currentPage - 1) * itemsPerPage + 1)}-
              {Math.min(filteredVisitors.length, currentPage * itemsPerPage)} dari {filteredVisitors.length} wisatawan
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="border border-[#e5e3db] cursor-pointer"
              >
                Sebelumnya
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="border border-[#e5e3db] cursor-pointer"
              >
                Selanjutnya
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Credit reset ConfirmDialog */}
      <ConfirmDialog
        isOpen={confirmResetData !== null}
        onClose={() => setConfirmResetData(null)}
        onConfirm={handleConfirmReset}
        loading={resetLoading}
        title="Reset Kredit Wisatawan"
        message={confirmResetData ? `Yakin reset kredit ${confirmResetData.name}? Sisa kredit sebesar ${formatRupiah(confirmResetData.remaining)} akan kembali menjadi 0.` : ''}
        confirmLabel="Reset Kredit"
      />

      {/* Edit Visitor Modal */}
      <EditVisitorModal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setSelectedVisitor(null);
          setSelectedTag(null);
        }}
        visitor={selectedVisitor}
        tag={selectedTag}
        onSuccess={loadData}
      />

      {/* Top Up Modal */}
      <TopUpModal
        isOpen={isTopUpOpen}
        onClose={() => {
          setIsTopUpOpen(false);
          setSelectedVisitor(null);
          setSelectedTag(null);
        }}
        visitor={selectedVisitor}
        tag={selectedTag}
        onSuccess={loadData}
      />

      {/* Visitor Journey Drawer */}
      <VisitorJourneyDrawer
        isOpen={isJourneyOpen}
        onClose={() => {
          setIsJourneyOpen(false);
          setSelectedJourneyVisitor(null);
        }}
        visitor={selectedJourneyVisitor}
      />
    </div>
  );
}
