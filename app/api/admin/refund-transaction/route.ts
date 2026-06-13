import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedAdmin } from '@/lib/serverAuth';
import { consumeRateLimit } from '@/lib/serverRateLimit';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/supabaseAdmin';
import { logger, requestId } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const correlationId = requestId(req.headers);
  try {
    const admin = await getVerifiedAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Akses admin diperlukan' }, { status: 401 });
    if (!isSupabaseAdminConfigured) {
      return NextResponse.json({ error: 'Konfigurasi server belum lengkap' }, { status: 503 });
    }

    const rateLimit = await consumeRateLimit(req, {
      namespace: 'admin:refund-transaction',
      subject: admin.id,
      limit: 10,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Terlalu banyak permintaan refund' }, { status: 429 });
    }

    const { transactionId, reason } = await req.json();
    if (!transactionId || !String(reason || '').trim()) {
      return NextResponse.json({ error: 'Transaksi dan alasan refund wajib diisi' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc('refund_transaction', {
      p_transaction_id: transactionId,
      p_actor_user_id: admin.id,
      p_reason: String(reason).trim().slice(0, 300),
    });
    if (error) {
      const message = error.message || '';
      const friendly = message.includes('ALREADY_REFUNDED')
        ? 'Transaksi sudah pernah direfund'
        : message.includes('NOT_REFUNDABLE')
        ? 'Hanya transaksi belanja yang dapat direfund'
        : message.includes('TRANSACTION_NOT_FOUND')
        ? 'Transaksi tidak ditemukan'
        : 'Refund gagal diproses';
      return NextResponse.json({ error: friendly }, { status: 400 });
    }
    return NextResponse.json({ success: true, result: data });
  } catch (error) {
    logger.error('transaction.refund_failed', { correlationId, error });
    return NextResponse.json({ error: 'Terjadi kesalahan saat refund' }, { status: 500 });
  }
}
