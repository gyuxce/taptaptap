import { supabase, isSupabaseConfigured, getStorageItem, setStorageItem } from '@/lib/supabase';
import { Merchant } from '@/types';

export async function getMerchantByUserId(userId: string): Promise<Merchant | null> {
  try {
    if (isSupabaseConfigured) {
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
    } else {
      // Simulation mode
      const merchants = getStorageItem<Merchant[]>('ecotour_merchants', []);
      return merchants.find(m => m.owner_user_id === userId) || null;
    }
  } catch (err) {
    console.error('[merchantService] getMerchantByUserId caught error:', err);
    return null;
  }
}

export async function getAllMerchants(): Promise<Merchant[]> {
  try {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('merchants')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[merchantService] error getAllMerchants:', error);
        return [];
      }
      return data as Merchant[];
    } else {
      // Simulation mode
      return getStorageItem<Merchant[]>('ecotour_merchants', []);
    }
  } catch (err) {
    console.error('[merchantService] getAllMerchants caught error:', err);
    return [];
  }
}

export async function toggleMerchantStatus(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (isSupabaseConfigured) {
      // Get current merchant status first
      const { data: curr } = await supabase
        .from('merchants')
        .select('is_active')
        .eq('id', id)
        .single();
        
      if (!curr) return { success: false, error: 'Merchant tidak ditemukan' };

      const { error } = await supabase
        .from('merchants')
        .update({ is_active: !curr.is_active })
        .eq('id', id);

      if (error) {
        console.error('[merchantService] error toggleMerchantStatus:', error);
        return { success: false, error: 'Gagal merubah status merchant' };
      }
      return { success: true };
    } else {
      // Simulation mode
      const merchants = getStorageItem<Merchant[]>('ecotour_merchants', []);
      const idx = merchants.findIndex(m => m.id === id);
      if (idx !== -1) {
        merchants[idx].is_active = !merchants[idx].is_active;
        setStorageItem('ecotour_merchants', merchants);
        return { success: true };
      }
      return { success: false, error: 'Merchant tidak ditemukan' };
    }
  } catch (err: any) {
    console.error('[merchantService] toggleMerchantStatus caught error:', err);
    return { success: false, error: 'Terjadi kesalahan sistem' };
  }
}
