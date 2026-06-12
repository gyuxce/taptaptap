import { supabase } from '@/lib/supabase';
import { Visitor, RFIDTag, CreditCheckResult, CreditTopUp, JourneyItem, JourneyStats } from '@/types';
import { registerVisitorSchema, RegisterVisitorInput } from '@/lib/validations';
import { normalizeUID } from '../utils';
export async function fetchVisitorByUID(uid: string): Promise<{
    visitor: Visitor;
    tag: RFIDTag;
} | {
    error: 'TAG_NOT_FOUND' | 'VISITOR_NOT_FOUND' | 'TAG_INACTIVE' | string;
}> {
    const normalized = normalizeUID(uid);
    try {
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
    }
    catch (err: unknown) {
        console.error('[visitorService] fetchVisitorByUID caught error:', err);
        return { error: 'Terjadi kesalahan, coba lagi' };
    }
}
export async function registerVisitor(data: RegisterVisitorInput, uid: string, merchantId: string): Promise<{
    visitor: Visitor;
} | {
    error: string;
}> {
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
    }
    catch (err: unknown) {
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
export async function deductCredit(visitorId: string, amount: number): Promise<{
    success: boolean;
    error?: string;
}> {
    void visitorId;
    void amount;
    return {
        success: false,
        error: 'Pemotongan saldo hanya boleh dilakukan melalui transaksi atomik'
    };
}
export async function resetCredit(visitorId: string, actorUserId: string): Promise<{
    success: boolean;
}> {
    try {
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
        if (logError)
            console.warn('[visitorService] failed to write audit log:', logError);
        return { success: true };
    }
    catch (err) {
        console.error('[visitorService] resetCredit caught error:', err);
        return { success: false };
    }
}
export async function updateVisitor(visitorId: string, data: Partial<RegisterVisitorInput>): Promise<{
    visitor?: Visitor;
    error?: string;
}> {
    const updateSchema = registerVisitorSchema.partial();
    const validation = updateSchema.safeParse(data);
    if (!validation.success) {
        return { error: validation.error.issues[0]?.message || 'Validasi update gagal' };
    }
    try {
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
        return { visitor: updatedVisitor as Visitor };
    }
    catch (err: unknown) {
        console.error('[visitorService] updateVisitor caught error:', err);
        return { error: 'Terjadi kesalahan sistem, coba lagi' };
    }
}
export async function topUpCredit(rfidUid: string, amount: number, merchantId: string, note?: string): Promise<{
    success: boolean;
    newCreditLimit?: number;
    error?: string;
}> {
    if (amount <= 0) {
        return { success: false, error: 'Nominal top up harus lebih besar dari 0' };
    }
    try {
        const { data, error } = await supabase.rpc('process_topup', {
            p_rfid_uid: normalizeUID(rfidUid),
            p_amount: amount,
            p_merchant_id: merchantId,
            p_note: note || null
        });
        if (error || !data) {
            console.error('[visitorService] topUpCredit RPC error:', error);
            const message = error?.message || '';
            if (message.includes('FORBIDDEN'))
                return { success: false, error: 'Hanya admin atau loket yang dapat melakukan top up' };
            if (message.includes('TAG_NOT_FOUND'))
                return { success: false, error: 'Gelang RFID tidak terdaftar' };
            if (message.includes('TAG_INACTIVE'))
                return { success: false, error: 'Gelang RFID tidak aktif' };
            return { success: false, error: 'Gagal memproses top up di database' };
        }
        return { success: true, newCreditLimit: Number(data.new_credit_limit) };
    }
    catch (err: unknown) {
        console.error('[visitorService] topUpCredit caught error:', err);
        return { success: false, error: 'Terjadi kesalahan sistem' };
    }
}
export async function toggleTagStatus(tagId: string, isActive: boolean, actorUserId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        const { error } = await supabase
            .from('rfid_tags')
            .update({ is_active: isActive })
            .eq('id', tagId);
        if (error) {
            console.error('[visitorService] toggleTagStatus error:', error);
            return { success: false, error: 'Gagal merubah keaktifan gelang di database' };
        }
        void actorUserId;
        return { success: true };
    }
    catch (err: unknown) {
        console.error('[visitorService] toggleTagStatus caught error:', err);
        return { success: false, error: 'Terjadi kesalahan sistem' };
    }
}
export async function getTopUpHistory(visitorId: string): Promise<{
    topups: CreditTopUp[];
    error?: string;
}> {
    try {
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
    }
    catch (err: unknown) {
        console.error('[visitorService] getTopUpHistory caught error:', err);
        return { topups: [], error: 'Terjadi kesalahan sistem' };
    }
}
export async function getVisitorJourney(visitorId: string, date?: string): Promise<{
    journey: JourneyItem[];
    stats: JourneyStats;
    error?: string;
}> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    try {
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
    }
    catch (err: unknown) {
        console.error('[visitorService] getVisitorJourney caught error:', err);
        return {
            journey: [],
            stats: { total_spend: 0, total_taps: 0, first_tap: '', last_tap: '', duration_minutes: 0, merchants_visited: [] },
            error: 'Terjadi kesalahan sistem'
        };
    }
}
