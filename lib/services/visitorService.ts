import { supabase, isSupabaseConfigured, getStorageItem, setStorageItem } from '@/lib/supabase';
import { Visitor, RFIDTag, CreditCheckResult, CreditTopUp, JourneyItem, JourneyStats, Merchant, Transaction } from '@/types';
import { registerVisitorSchema, RegisterVisitorInput } from '@/lib/validations';
import { normalizeUID } from '../utils';

export async function fetchVisitorByUID(uid: string): Promise<
  { visitor: Visitor; tag: RFIDTag } | { error: 'TAG_NOT_FOUND' | 'VISITOR_NOT_FOUND' | 'TAG_INACTIVE' | string }
> {
  const normalized = normalizeUID(uid);
  try {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('rfid_tags')
        .select('*, visitor:visitors(*)')
        .eq('uid', normalized)
        .maybeSingle();

      if (error) {
        console.error('[visitorService] error fetching tag by uid:', error);
        return { error: 'Terjadi kesalahan, coba lagi' };
      }
      if (!data) {
        return { error: 'TAG_NOT_FOUND' };
      }
      if (!data.is_active) {
        return { error: 'TAG_INACTIVE' };
      }
      if (!data.visitor) {
        return { error: 'VISITOR_NOT_FOUND' };
      }
      
      // format nested select to target shape
      const { visitor, ...tagOnly } = data;
      return { visitor: visitor as Visitor, tag: tagOnly as RFIDTag };
    } else {
      // Simulation mode
      const tags = getStorageItem<RFIDTag[]>('ecotour_rfid_tags', []);
      const visitors = getStorageItem<Visitor[]>('ecotour_visitors', []);

      const tag = tags.find(t => t.uid === normalized);
      if (!tag) {
        return { error: 'TAG_NOT_FOUND' };
      }
      if (!tag.is_active) {
        return { error: 'TAG_INACTIVE' };
      }

      const visitor = visitors.find(v => v.id === tag.visitor_id);
      if (!visitor) {
        return { error: 'VISITOR_NOT_FOUND' };
      }

      return { visitor, tag };
    }
  } catch (err: any) {
    console.error('[visitorService] fetchVisitorByUID caught error:', err);
    return { error: 'Terjadi kesalahan, coba lagi' };
  }
}

export async function registerVisitor(
  data: RegisterVisitorInput, 
  uid: string, 
  merchantId: string
): Promise<{ visitor: Visitor } | { error: string }> {
  const validation = registerVisitorSchema.safeParse(data);
  if (!validation.success) {
    return { error: validation.error.issues[0]?.message || 'Validasi formulir gagal' };
  }

  const normalized = normalizeUID(uid);
  if (!normalized) {
    return { error: 'RFID UID tidak valid' };
  }

  try {
    // Check if UID is already registered
    const existing = await fetchVisitorByUID(normalized);
    if (existing && !('error' in existing)) {
      return { error: 'Kode RFID UID sudah terdaftar dan aktif' };
    }

    const photoUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.name)}`;

    if (isSupabaseConfigured) {
      // 1. Insert visitor
      const { data: newVisitor, error: vErr } = await supabase
        .from('visitors')
        .insert({
          name: data.name,
          phone: data.phone || null,
          photo_url: photoUrl,
          ticket_type: data.ticket_type,
          credit_limit: data.credit_limit,
          credit_used: 0
        })
        .select()
        .single();

      if (vErr || !newVisitor) {
        console.error('[visitorService] error registering visitor:', vErr);
        return { error: 'Gagal menyimpan data wisatawan' };
      }

      // 2. Insert RFID tag mapping
      const { error: tErr } = await supabase
        .from('rfid_tags')
        .insert({
          uid: normalized,
          visitor_id: newVisitor.id,
          is_active: true,
          registered_by: merchantId
        });

      if (tErr) {
        console.error('[visitorService] error mapping RFID tag:', tErr);
        // Rollback visitor insertion to keep db sync integrity
        await supabase.from('visitors').delete().eq('id', newVisitor.id);
        return { error: 'Gagal mendaftarkan gelang RFID' };
      }

      // Note: audit_log table trigger on visitor insert takes care of logging automatically!
      return { visitor: newVisitor as Visitor };
    } else {
      // Simulation mode
      const visitors = getStorageItem<Visitor[]>('ecotour_visitors', []);
      const tags = getStorageItem<RFIDTag[]>('ecotour_rfid_tags', []);

      const newVisitor: Visitor = {
        id: `v-${Date.now()}`,
        name: data.name,
        phone: data.phone || null,
        photo_url: photoUrl,
        ticket_type: data.ticket_type,
        credit_limit: data.credit_limit,
        credit_used: 0,
        created_at: new Date().toISOString()
      };

      const newTag: RFIDTag = {
        id: `tag-${Date.now()}`,
        uid: normalized,
        visitor_id: newVisitor.id,
        is_active: true,
        registered_by: merchantId,
        registered_at: new Date().toISOString()
      };

      visitors.unshift(newVisitor);
      tags.unshift(newTag);

      setStorageItem('ecotour_visitors', visitors);
      setStorageItem('ecotour_rfid_tags', tags);

      // Log audit locally
      const auditLog = getStorageItem<any[]>('ecotour_audit_log', []);
      auditLog.unshift({
        id: Date.now(),
        action: 'register_visitor',
        actor_user_id: merchantId,
        merchant_id: merchantId,
        target_id: newVisitor.id,
        metadata: { name: newVisitor.name, ticket_type: newVisitor.ticket_type },
        created_at: new Date().toISOString()
      });
      setStorageItem('ecotour_audit_log', auditLog);

      return { visitor: newVisitor };
    }
  } catch (err: any) {
    console.error('[visitorService] registerVisitor caught error:', err);
    return { error: 'Terjadi kesalahan, coba lagi' };
  }
}

export async function checkCredit(uid: string, amount: number): Promise<CreditCheckResult> {
  const result = await fetchVisitorByUID(uid);
  if ('error' in result) {
    return {
      allowed: false,
      credit_limit: 0,
      credit_used: 0,
      credit_remaining: 0,
      reason: result.error === 'TAG_INACTIVE' ? 'Gelang RFID tidak aktif' : 'Gelang RFID tidak terdaftar'
    };
  }

  const { visitor } = result;
  
  if (visitor.credit_limit === 0) {
    // Unlimited credit
    return {
      allowed: true,
      credit_limit: 0,
      credit_used: visitor.credit_used,
      credit_remaining: Infinity,
      reason: null
    };
  }

  const remaining = visitor.credit_limit - visitor.credit_used;
  const allowed = remaining >= amount;

  return {
    allowed,
    credit_limit: visitor.credit_limit,
    credit_used: visitor.credit_used,
    credit_remaining: remaining,
    reason: allowed ? null : `Sisa saldo tidak cukup (Sisa: Rp ${remaining.toLocaleString('id-ID')})`
  };
}

export async function deductCredit(visitorId: string, amount: number): Promise<{ success: boolean; error?: string }> {
  try {
    if (isSupabaseConfigured) {
      // Atomic increment operation via Supabase custom RPC or SQL
      // In production Supabase, atomic credit updates should use:
      // UPDATE visitors SET credit_used = credit_used + amount WHERE id = visitorId
      const { error } = await supabase.rpc('increment_credit_used', { visitor_id: visitorId, amount_to_add: amount });
      if (error) {
        // Fallback to sequential update if RPC is missing
        const { data: v } = await supabase.from('visitors').select('credit_used').eq('id', visitorId).single();
        if (v) {
          const { error: updErr } = await supabase
            .from('visitors')
            .update({ credit_used: v.credit_used + amount })
            .eq('id', visitorId);
          if (updErr) return { success: false, error: 'Gagal memotong saldo gelang' };
        }
      }
      return { success: true };
    } else {
      // Simulation mode
      const visitors = getStorageItem<Visitor[]>('ecotour_visitors', []);
      const idx = visitors.findIndex(v => v.id === visitorId);
      if (idx !== -1) {
        visitors[idx].credit_used += amount;
        setStorageItem('ecotour_visitors', visitors);
        return { success: true };
      }
      return { success: false, error: 'Wisatawan tidak ditemukan' };
    }
  } catch (err: any) {
    console.error('[visitorService] deductCredit caught error:', err);
    return { success: false, error: 'Gagal memproses potongan saldo' };
  }
}

export async function resetCredit(visitorId: string, actorUserId: string): Promise<{ success: boolean }> {
  try {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('visitors')
        .update({ credit_used: 0 })
        .eq('id', visitorId);

      if (error) {
        console.error('[visitorService] error resetting credit:', error);
        return { success: false };
      }

      // Log reset credit operation in Audit logs
      const { error: logError } = await supabase
        .from('audit_log')
        .insert({
          action: 'reset_credit',
          actor_user_id: actorUserId,
          target_id: visitorId
        });
      if (logError) console.warn('[visitorService] failed to write audit log:', logError);

      return { success: true };
    } else {
      // Simulation mode
      const visitors = getStorageItem<Visitor[]>('ecotour_visitors', []);
      const idx = visitors.findIndex(v => v.id === visitorId);
      if (idx !== -1) {
        visitors[idx].credit_used = 0;
        setStorageItem('ecotour_visitors', visitors);

        // Log audit locally
        const auditLog = getStorageItem<any[]>('ecotour_audit_log', []);
        auditLog.unshift({
          id: Date.now(),
          action: 'reset_credit',
          actor_user_id: actorUserId,
          target_id: visitorId,
          created_at: new Date().toISOString()
        });
        setStorageItem('ecotour_audit_log', auditLog);

        return { success: true };
      }
      return { success: false };
    }
  } catch (err) {
    console.error('[visitorService] resetCredit caught error:', err);
    return { success: false };
  }
}

export async function updateVisitor(
  visitorId: string,
  data: Partial<RegisterVisitorInput>
): Promise<{ visitor?: Visitor; error?: string }> {
  const updateSchema = registerVisitorSchema.partial();
  const validation = updateSchema.safeParse(data);
  if (!validation.success) {
    return { error: validation.error.issues[0]?.message || 'Validasi update gagal' };
  }

  try {
    if (isSupabaseConfigured) {
      const { data: updatedVisitor, error } = await supabase
        .from('visitors')
        .update(validation.data)
        .eq('id', visitorId)
        .select()
        .single();

      if (error || !updatedVisitor) {
        console.error('[visitorService] updateVisitor error:', error);
        return { error: 'Gagal memperbarui data wisatawan di database' };
      }

      // audit log
      const { error: logError } = await supabase.from('audit_log').insert({
        action: 'update_visitor',
        actor_user_id: 'admin',
        target_id: visitorId,
        metadata: validation.data
      });
      if (logError) console.warn('Audit log insert failed:', logError);

      return { visitor: updatedVisitor as Visitor };
    } else {
      // Simulation mode
      const visitors = getStorageItem<Visitor[]>('ecotour_visitors', []);
      const idx = visitors.findIndex(v => v.id === visitorId);
      if (idx === -1) return { error: 'Wisatawan tidak ditemukan' };

      const updated = { ...visitors[idx], ...validation.data };
      visitors[idx] = updated;
      setStorageItem('ecotour_visitors', visitors);

      // audit log
      const auditLog = getStorageItem<any[]>('ecotour_audit_log', []);
      auditLog.unshift({
        id: Date.now(),
        action: 'update_visitor',
        actor_user_id: 'admin',
        target_id: visitorId,
        metadata: validation.data,
        created_at: new Date().toISOString()
      });
      setStorageItem('ecotour_audit_log', auditLog);

      return { visitor: updated };
    }
  } catch (err: any) {
    console.error('[visitorService] updateVisitor caught error:', err);
    return { error: 'Terjadi kesalahan sistem, coba lagi' };
  }
}

export async function topUpCredit(
  rfidUid: string,
  amount: number,
  merchantId: string,
  note?: string
): Promise<{ success: boolean; newCreditLimit?: number; error?: string }> {
  if (amount <= 0) {
    return { success: false, error: 'Nominal top up harus lebih besar dari 0' };
  }

  try {
    const visRes = await fetchVisitorByUID(rfidUid);
    if ('error' in visRes) {
      return { success: false, error: visRes.error === 'TAG_NOT_FOUND' ? 'Gelang RFID tidak terdaftar' : 'Gelang RFID tidak aktif' };
    }

    const { visitor, tag } = visRes;
    const newCreditLimit = Number(visitor.credit_limit) + Number(amount);

    if (isSupabaseConfigured) {
      // UPDATE visitors
      const { error: updateErr } = await supabase
        .from('visitors')
        .update({ credit_limit: newCreditLimit })
        .eq('id', visitor.id);

      if (updateErr) {
        console.error('[visitorService] topUpCredit update error:', updateErr);
        return { success: false, error: 'Gagal menambah batas kredit di database' };
      }

      // INSERT credit_topups
      const { error: insertErr } = await supabase
        .from('credit_topups')
        .insert({
          visitor_id: visitor.id,
          rfid_uid: tag.uid,
          amount,
          top_up_by: merchantId,
          top_up_by_name: merchantId === 'admin' ? 'Administrator' : 'Merchant',
          note
        });

      if (insertErr) {
        console.warn('Gagal mencatat data topup di database:', insertErr);
      }

      // INSERT audit_log
      const { error: logError } = await supabase.from('audit_log').insert({
        action: 'topup_credit',
        actor_user_id: merchantId,
        target_id: visitor.id,
        metadata: { amount, note, rfid_uid: tag.uid }
      });
      if (logError) console.warn('Audit log insert failed:', logError);

      return { success: true, newCreditLimit };
    } else {
      // Simulation mode
      const visitors = getStorageItem<Visitor[]>('ecotour_visitors', []);
      const vIdx = visitors.findIndex(v => v.id === visitor.id);
      if (vIdx === -1) return { success: false, error: 'Wisatawan tidak ditemukan' };

      visitors[vIdx].credit_limit = newCreditLimit;
      setStorageItem('ecotour_visitors', visitors);

      // Insert credit_topups
      const topups = getStorageItem<CreditTopUp[]>('ecotour_credit_topups', []);
      const newTopup: CreditTopUp = {
        id: `topup-${Date.now()}`,
        visitor_id: visitor.id,
        rfid_uid: tag.uid,
        amount,
        top_up_by: merchantId,
        top_up_by_name: merchantId === 'admin' ? 'Administrator' : 'Merchant',
        note,
        created_at: new Date().toISOString()
      };
      topups.unshift(newTopup);
      setStorageItem('ecotour_credit_topups', topups);

      // audit log
      const auditLog = getStorageItem<any[]>('ecotour_audit_log', []);
      auditLog.unshift({
        id: Date.now(),
        action: 'topup_credit',
        actor_user_id: merchantId,
        target_id: visitor.id,
        metadata: { amount, note, rfid_uid: tag.uid },
        created_at: new Date().toISOString()
      });
      setStorageItem('ecotour_audit_log', auditLog);

      return { success: true, newCreditLimit };
    }
  } catch (err: any) {
    console.error('[visitorService] topUpCredit caught error:', err);
    return { success: false, error: 'Terjadi kesalahan sistem' };
  }
}

export async function toggleTagStatus(
  tagId: string,
  isActive: boolean,
  actorUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('rfid_tags')
        .update({ is_active: isActive })
        .eq('id', tagId);

      if (error) {
        console.error('[visitorService] toggleTagStatus error:', error);
        return { success: false, error: 'Gagal merubah keaktifan gelang di database' };
      }

      // audit log
      const { error: logError } = await supabase.from('audit_log').insert({
        action: 'toggle_tag',
        actor_user_id: actorUserId,
        target_id: tagId,
        metadata: { is_active: isActive }
      });
      if (logError) console.warn('Audit log insert failed:', logError);

      return { success: true };
    } else {
      // Simulation mode
      const tags = getStorageItem<RFIDTag[]>('ecotour_rfid_tags', []);
      const idx = tags.findIndex(t => t.id === tagId);
      if (idx === -1) return { success: false, error: 'Tag tidak ditemukan' };

      tags[idx].is_active = isActive;
      setStorageItem('ecotour_rfid_tags', tags);

      // audit log
      const auditLog = getStorageItem<any[]>('ecotour_audit_log', []);
      auditLog.unshift({
        id: Date.now(),
        action: 'toggle_tag',
        actor_user_id: actorUserId,
        target_id: tagId,
        metadata: { is_active: isActive },
        created_at: new Date().toISOString()
      });
      setStorageItem('ecotour_audit_log', auditLog);

      return { success: true };
    }
  } catch (err: any) {
    console.error('[visitorService] toggleTagStatus caught error:', err);
    return { success: false, error: 'Terjadi kesalahan sistem' };
  }
}

export async function getTopUpHistory(
  visitorId: string
): Promise<{ topups: CreditTopUp[]; error?: string }> {
  try {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('credit_topups')
        .select('*')
        .eq('visitor_id', visitorId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('[visitorService] getTopUpHistory error:', error);
        return { topups: [], error: 'Gagal mengambil data riwayat top up' };
      }

      return { topups: data as CreditTopUp[] };
    } else {
      // Simulation mode
      const topups = getStorageItem<CreditTopUp[]>('ecotour_credit_topups', []);
      const filtered = topups.filter(t => t.visitor_id === visitorId).slice(0, 20);
      return { topups: filtered };
    }
  } catch (err: any) {
    console.error('[visitorService] getTopUpHistory caught error:', err);
    return { topups: [], error: 'Terjadi kesalahan sistem' };
  }
}

export async function getVisitorJourney(
  visitorId: string,
  date?: string
): Promise<{ journey: JourneyItem[]; stats: JourneyStats; error?: string }> {
  const targetDate = date || new Date().toISOString().split('T')[0];

  try {
    if (isSupabaseConfigured) {
      // 1. Fetch visitor tags
      const { data: tagData, error: tagErr } = await supabase
        .from('rfid_tags')
        .select('uid')
        .eq('visitor_id', visitorId);

      if (tagErr) {
        console.error('[visitorService] getVisitorJourney tag error:', tagErr);
        return {
          journey: [],
          stats: { total_spend: 0, total_taps: 0, first_tap: '', last_tap: '', duration_minutes: 0, merchants_visited: [] },
          error: 'Gagal mengambil data tag RFID'
        };
      }

      if (!tagData || tagData.length === 0) {
        return {
          journey: [],
          stats: { total_spend: 0, total_taps: 0, first_tap: '', last_tap: '', duration_minutes: 0, merchants_visited: [] }
        };
      }

      const uids = tagData.map(t => t.uid);

      // 2. Fetch transactions for these tags matching DATE(created_at)
      // Supabase DATE filter can be handled using gte/lte on timestamps for that day
      const startOfDay = `${targetDate}T00:00:00.000Z`;
      const endOfDay = `${targetDate}T23:59:59.999Z`;

      const { data: txs, error: txErr } = await supabase
        .from('transactions')
        .select('*, merchant:merchants(*)')
        .in('rfid_uid', uids)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: true });

      if (txErr) {
        console.error('[visitorService] getVisitorJourney transactions error:', txErr);
        return {
          journey: [],
          stats: { total_spend: 0, total_taps: 0, first_tap: '', last_tap: '', duration_minutes: 0, merchants_visited: [] },
          error: 'Gagal mengambil riwayat transaksi'
        };
      }

      const journey: JourneyItem[] = (txs || []).map(t => ({
        transaction_id: t.id,
        merchant_name: t.merchant?.name || 'Unknown',
        merchant_category: t.merchant?.category || 'Unknown',
        merchant_location: t.merchant?.location || 'Unknown',
        type: t.type as 'entry' | 'payment',
        amount: Number(t.amount),
        created_at: t.created_at
      }));

      // Calculate stats
      const total_taps = journey.length;
      const total_spend = journey.reduce((acc, item) => acc + (item.type === 'payment' ? item.amount : 0), 0);
      const first_tap = total_taps > 0 ? journey[0].created_at : '';
      const last_tap = total_taps > 0 ? journey[journey.length - 1].created_at : '';

      let duration_minutes = 0;
      if (total_taps > 1 && first_tap && last_tap) {
        const firstTime = new Date(first_tap).getTime();
        const lastTime = new Date(last_tap).getTime();
        duration_minutes = Math.round((lastTime - firstTime) / (60 * 1000));
      }

      const merchants_visited = Array.from(new Set(journey.map(item => item.merchant_name)));

      const stats: JourneyStats = {
        total_spend,
        total_taps,
        first_tap,
        last_tap,
        duration_minutes,
        merchants_visited
      };

      return { journey, stats };
    } else {
      // Simulation mode
      const tags = getStorageItem<RFIDTag[]>('ecotour_rfid_tags', []);
      const visitorTags = tags.filter(t => t.visitor_id === visitorId).map(t => t.uid);

      if (visitorTags.length === 0) {
        return {
          journey: [],
          stats: { total_spend: 0, total_taps: 0, first_tap: '', last_tap: '', duration_minutes: 0, merchants_visited: [] }
        };
      }

      const txs = getStorageItem<Transaction[]>('ecotour_transactions', []);
      const merchants = getStorageItem<Merchant[]>('ecotour_merchants', []);

      const filtered = txs.filter(t => {
        if (!visitorTags.includes(t.rfid_uid)) return false;
        const txDate = t.created_at.split('T')[0];
        return txDate === targetDate;
      }).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      const journey: JourneyItem[] = filtered.map(t => {
        const m = merchants.find(merch => merch.id === t.merchant_id);
        return {
          transaction_id: t.id,
          merchant_name: m?.name || 'Unknown',
          merchant_category: m?.category || 'Unknown',
          merchant_location: m?.location || 'Unknown',
          type: t.type as 'entry' | 'payment',
          amount: Number(t.amount),
          created_at: t.created_at
        };
      });

      // Calculate stats
      const total_taps = journey.length;
      const total_spend = journey.reduce((acc, item) => acc + (item.type === 'payment' ? item.amount : 0), 0);
      const first_tap = total_taps > 0 ? journey[0].created_at : '';
      const last_tap = total_taps > 0 ? journey[journey.length - 1].created_at : '';

      let duration_minutes = 0;
      if (total_taps > 1 && first_tap && last_tap) {
        const firstTime = new Date(first_tap).getTime();
        const lastTime = new Date(last_tap).getTime();
        duration_minutes = Math.round((lastTime - firstTime) / (60 * 1000));
      }

      const merchants_visited = Array.from(new Set(journey.map(item => item.merchant_name)));

      const stats: JourneyStats = {
        total_spend,
        total_taps,
        first_tap,
        last_tap,
        duration_minutes,
        merchants_visited
      };

      return { journey, stats };
    }
  } catch (err: any) {
    console.error('[visitorService] getVisitorJourney caught error:', err);
    return {
      journey: [],
      stats: { total_spend: 0, total_taps: 0, first_tap: '', last_tap: '', duration_minutes: 0, merchants_visited: [] },
      error: 'Terjadi kesalahan sistem'
    };
  }
}
