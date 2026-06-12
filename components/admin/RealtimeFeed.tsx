'use client';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SmartphoneNfc, Clock } from 'lucide-react';
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fetchTransactions, fetchTransactionStats } from '@/lib/services/transactionService';
import { formatRupiah } from '@/lib/utils';
export interface FeedItem {
    id: string;
    visitor_name: string;
    merchant_name: string;
    merchant_category: string;
    type: 'entry' | 'payment';
    amount: number;
    created_at: string;
    isNew: boolean; // Highlight background for first 3 seconds
}
interface RealtimeFeedProps {
    onNewTransaction?: (tx: FeedItem) => void;
}
export function useRealtimeFeed(onNewTransaction?: (tx: FeedItem) => void) {
    const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
    const [todayCount, setTodayCount] = useState(0);
    // 1. Initial Load of transactions and daily counts
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const stats = await fetchTransactionStats('all');
                setTodayCount(stats.today.count);
                const res = await fetchTransactions('all', { limit: 15 });
                const items: FeedItem[] = res.transactions.map(t => ({
                    id: t.id,
                    visitor_name: t.visitor_name || 'Wisatawan',
                    merchant_name: t.merchant_name || 'Merchant Partner',
                    merchant_category: t.merchant_category || 'General',
                    type: t.type as 'entry' | 'payment',
                    amount: Number(t.amount),
                    created_at: t.created_at,
                    isNew: false
                }));
                setFeedItems(items);
            }
            catch (err) {
                console.error('[useRealtimeFeed] initial load failed:', err);
            }
        };
        loadInitialData();
    }, []);
    // 2. Realtime listener subscription
    useEffect(() => {
        // Handler for live Supabase inserts
        const handleNewTransaction = async (
          payload: RealtimePostgresInsertPayload<{
            id: string;
            merchant_id: string;
            rfid_uid: string;
            type: 'entry' | 'payment';
            amount: number;
            created_at: string;
          }>
        ) => {
            const newTx = payload.new;
            try {
                // Fetch merchant details
                const { data: merch } = await supabase
                    .from('merchants')
                    .select('name, category')
                    .eq('id', newTx.merchant_id)
                    .single();
                // Fetch visitor name
                const { data: tag } = await supabase
                    .from('rfid_tags')
                    .select('visitor:visitors(name)')
                    .eq('uid', newTx.rfid_uid)
                    .single();
                const visitor = tag?.visitor as unknown as { name?: string } | null;
                const visitor_name = visitor?.name || 'Wisatawan';
                const merchant_name = merch?.name || 'Unknown Merchant';
                const merchant_category = merch?.category || 'General';
                const newItem: FeedItem = {
                    id: newTx.id,
                    visitor_name,
                    merchant_name,
                    merchant_category,
                    type: newTx.type as 'entry' | 'payment',
                    amount: Number(newTx.amount),
                    created_at: newTx.created_at,
                    isNew: true
                };
                addNewFeedItem(newItem);
            }
            catch (err) {
                console.error('[useRealtimeFeed] payload enrichment failed:', err);
            }
        };
        const addNewFeedItem = (item: FeedItem) => {
            setFeedItems(prev => {
                const updated = [item, ...prev];
                return updated.slice(0, 50); // cap at LIFO 50 items
            });
            setTodayCount(prev => prev + 1);
            // Trigger animation on dashboard KPIs
            if (onNewTransaction) {
                onNewTransaction(item);
            }
            // Clear yellow highlight after 3 seconds
            setTimeout(() => {
                setFeedItems(prev => prev.map(f => f.id === item.id ? { ...f, isNew: false } : f));
            }, 3000);
        };
        // Supabase Channel Subscription
        const channel = supabase
            .channel('transactions-feed')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, handleNewTransaction)
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [onNewTransaction]);
    return { feedItems, todayCount };
}
export const RealtimeFeed: React.FC<RealtimeFeedProps> = ({ onNewTransaction }) => {
    const { feedItems, todayCount } = useRealtimeFeed(onNewTransaction);
    const listContainerRef = useRef<HTMLDivElement>(null);
    // Auto scroll to top on new live items
    const firstFeedItemId = feedItems[0]?.id;
    useEffect(() => {
        if (feedItems.length > 0 && listContainerRef.current) {
            listContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [firstFeedItemId, feedItems.length]);
    // Color mapping by category for initials avatar
    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'Loket/Gerbang':
                return 'bg-gray-100 text-gray-700 border-gray-200';
            case 'Adventure':
                return 'bg-red-50 text-red-700 border-red-200';
            case 'F&B':
                return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'Retail':
                return 'bg-blue-50 text-blue-700 border-blue-200';
            case 'Sightseeing':
                return 'bg-green-50 text-green-700 border-green-200';
            default:
                return 'bg-slate-50 text-slate-700 border-slate-200';
        }
    };
    return (<div className="w-full lg:w-[320px] bg-white border border-[#e5e3db] rounded-3xl flex flex-col h-[700px] lg:h-[800px] shadow-xs shrink-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#e5e3db] flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <h3 className="text-xs font-black uppercase tracking-wider text-[#1e293b]">Aktivitas Live</h3>
        </div>
        <div className="flex items-center gap-1.5 bg-[#fbfbfa] border border-[#e5e3db] px-2.5 py-1 rounded-full">
          <SmartphoneNfc className="h-3 w-3 text-indigo-500"/>
          <span className="text-[10px] font-black text-[#1e293b]">{todayCount} Hari Ini</span>
        </div>
      </div>

      {/* Feed list */}
      <div ref={listContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
        <AnimatePresence initial={false}>
          {feedItems.length === 0 ? (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex items-center justify-center text-xs text-gray-400 font-medium py-20">
              Menunggu transaksi...
            </motion.div>) : (feedItems.map((item) => (<motion.div key={item.id} initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', damping: 20, stiffness: 300 }} className={`flex gap-3 p-3 border rounded-2xl text-left transition-all duration-500 ${item.isNew
                ? 'bg-amber-50 border-amber-300 shadow-md ring-2 ring-amber-300/20'
                : 'bg-white border-[#e5e3db] hover:border-slate-300 shadow-2xs'}`}>
                {/* Initials Avatar */}
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold text-[11px] shrink-0 ${getCategoryColor(item.merchant_category)}`}>
                  {item.merchant_name.substring(0, 2).toUpperCase()}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-[#1e293b] leading-snug truncate">
                    <span className="text-indigo-600 font-extrabold">{item.visitor_name}</span> tap di {item.merchant_name}
                  </p>
                  <p className="text-[9px] text-[#64748b] font-semibold flex items-center gap-1.5 mt-1">
                    <Clock className="h-3 w-3 shrink-0 text-slate-400"/>
                    {new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    <span>·</span>
                    {item.type === 'entry' ? (<span className="text-[#29ABE2] font-black uppercase tracking-wider text-[8px] bg-[#E8F6FD] border border-[#E2EEFF] px-1.5 py-0.5 rounded">
                        Tap Masuk
                      </span>) : (<span className="text-red-600 font-black">
                        {formatRupiah(item.amount)}
                      </span>)}
                  </p>
                </div>
              </motion.div>)))}
        </AnimatePresence>
      </div>
    </div>);
};
