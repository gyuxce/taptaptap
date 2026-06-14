import { supabase } from '@/lib/supabase';
import { Merchant } from '@/types';
export async function getMerchantByUserId(userId: string): Promise<Merchant | null> {
    try {
        const { data, error } = await supabase
            .from('merchants')
            .select('*')
            .eq('owner_user_id', userId)
            .maybeSingle();
        if (error) {
            console.error('[merchantService] error getMerchantByUserId:', error);
            return null;
        }
        return data as Merchant | null;
    }
    catch (err) {
        console.error('[merchantService] getMerchantByUserId caught error:', err);
        return null;
    }
}
export async function getAllMerchants(): Promise<Merchant[]> {
    try {
        const { data, error } = await supabase
            .from('merchants')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) {
            console.error('[merchantService] error getAllMerchants:', error);
            return [];
        }
        return data as Merchant[];
    }
    catch (err) {
        console.error('[merchantService] getAllMerchants caught error:', err);
        return [];
    }
}
export async function toggleMerchantStatus(id: string): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        // Get current merchant status first
        const { data: curr } = await supabase
            .from('merchants')
            .select('is_active')
            .eq('id', id)
            .single();
        if (!curr)
            return { success: false, error: 'Merchant tidak ditemukan' };
        const { error } = await supabase
            .from('merchants')
            .update({ is_active: !curr.is_active })
            .eq('id', id);
        if (error) {
            console.error('[merchantService] error toggleMerchantStatus:', error);
            return { success: false, error: 'Gagal merubah status merchant' };
        }
        return { success: true };
    }
    catch (err: unknown) {
        console.error('[merchantService] toggleMerchantStatus caught error:', err);
        return { success: false, error: 'Terjadi kesalahan sistem' };
    }
}

export async function updateMerchantLoyalty(
    id: string,
    config: { loyalty_enabled: boolean; loyalty_target: number; loyalty_reward: string }
) {
    const { error } = await supabase.from('merchants').update(config).eq('id', id);
    return { success: !error, error: error?.message };
}
