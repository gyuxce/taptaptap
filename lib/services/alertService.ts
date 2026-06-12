import { supabase } from '@/lib/supabase';
import { Merchant, Transaction } from '@/types';
export interface SilentMerchant {
    id: string;
    name: string;
    location: string;
    category: string;
    phone?: string | null;
    hours_since_last_activity: number;
}
export async function checkMerchantActivity(): Promise<SilentMerchant[]> {
    const now = new Date();
    const currentHour = now.getHours();
    // Jam operasional: 08.00 - 18.00
    if (currentHour < 8 || currentHour >= 18) {
        return [];
    }
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startOfToday.setHours(8, 0, 0, 0); // Mulai jam 08:00 pagi
    try {
        let activeMerchants: Merchant[] = [];
        let todayTxs: Transaction[] = [];
        // 1. Fetch active merchants
        const { data: merchants } = await supabase
            .from('merchants')
            .select('*')
            .eq('is_active', true);
        activeMerchants = (merchants || []) as Merchant[];
        // 2. Fetch transactions recorded today (since 8:00 AM)
        const { data: txs } = await supabase
            .from('transactions')
            .select('merchant_id, created_at')
            .gte('created_at', startOfToday.toISOString());
        todayTxs = (txs || []) as Transaction[];
        const silentMerchants: SilentMerchant[] = [];
        const twoHoursInMs = 2 * 60 * 60 * 1000;
        activeMerchants.forEach(merch => {
            // Find transactions today for this merchant
            const merchTxs = todayTxs
                .filter(t => t.merchant_id === merch.id)
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            // Jika belum ada transaksi hari ini, asumsikan aktivitas terakhir adalah jam buka (08.00)
            let lastActivityTime = startOfToday.getTime();
            if (merchTxs.length > 0) {
                lastActivityTime = new Date(merchTxs[0].created_at).getTime();
            }
            const diffMs = now.getTime() - lastActivityTime;
            if (diffMs > twoHoursInMs) {
                silentMerchants.push({
                    id: merch.id,
                    name: merch.name,
                    location: merch.location,
                    category: merch.category,
                    phone: merch.phone || null,
                    hours_since_last_activity: parseFloat((diffMs / (60 * 60 * 1000)).toFixed(1))
                });
            }
        });
        return silentMerchants;
    }
    catch (err) {
        console.error('[alertService] checkMerchantActivity caught error:', err);
        return [];
    }
}
