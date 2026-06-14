import { supabase } from '@/lib/supabase';
import type { LoyaltyInfo } from '@/types';

export async function fetchLoyaltyInfo(rfidUid: string, merchantId: string): Promise<LoyaltyInfo | null> {
  const { data, error } = await supabase.rpc('get_loyalty_info', {
    p_rfid_uid: rfidUid,
    p_merchant_id: merchantId,
  });
  if (error) return null;
  return data as LoyaltyInfo;
}

export async function awardLoyaltyStamp(transactionId: string, rfidUid: string, merchantId: string) {
  const { data, error } = await supabase.rpc('award_loyalty_stamp', {
    p_transaction_id: transactionId,
    p_rfid_uid: rfidUid,
    p_merchant_id: merchantId,
  });
  if (error) return null;
  return data as LoyaltyInfo;
}

export async function redeemLoyaltyReward(rfidUid: string, merchantId: string) {
  const { data, error } = await supabase.rpc('redeem_loyalty_reward', {
    p_rfid_uid: rfidUid,
    p_merchant_id: merchantId,
  });
  if (error) throw new Error(error.message.includes('REWARD_NOT_READY') ? 'Reward belum tersedia' : 'Reward gagal digunakan');
  return data as { reward: string };
}
