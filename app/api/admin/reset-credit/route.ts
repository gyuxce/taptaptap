import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedAdmin } from '@/lib/serverAuth';
import { consumeRateLimit } from '@/lib/serverRateLimit';
import { logger, requestId } from '@/lib/logger';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  const correlationId = requestId(req.headers);
  try {
    const adminProfile = await getVerifiedAdmin(req);
    if (!adminProfile) {
      return NextResponse.json({ error: 'Unauthorized. Akses ditolak.' }, { status: 401 });
    }
    if (!isSupabaseAdminConfigured) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi' }, { status: 503 });
    }
    const rateLimit = await consumeRateLimit(req, {
      namespace: 'admin:reset-credit',
      subject: adminProfile.id,
      limit: 10,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.unavailable ? 'Rate limiter tidak tersedia' : 'Terlalu banyak permintaan' },
        { status: rateLimit.unavailable ? 503 : 429 }
      );
    }

    // 2. Read request body
    const body = await req.json();
    const { visitorId } = body;

    if (!visitorId) {
      return NextResponse.json({ error: 'visitorId wajib dikirim' }, { status: 400 });
    }

    const { data: visitor, error: visitorError } = await supabaseAdmin
      .from('visitors')
      .select('credit_limit, credit_used')
      .eq('id', visitorId)
      .single();
    if (visitorError || !visitor) {
      return NextResponse.json({ error: 'Wisatawan tidak ditemukan' }, { status: 404 });
    }
    if (Number(visitor.credit_limit) === 0) {
      return NextResponse.json({ error: 'Kredit unlimited tidak dapat direset' }, { status: 400 });
    }

    const creditLimit = Number(visitor.credit_limit);
    const { data: updatedVisitor, error: resetError } = await supabaseAdmin
      .from('visitors')
      .update({ credit_used: creditLimit })
      .eq('id', visitorId)
      .select('id, credit_limit, credit_used')
      .single();
    if (resetError) {
      logger.error('visitor.reset_credit.database_failed', { correlationId, visitorId, error: resetError });
      return NextResponse.json({ error: 'Gagal mereset kredit wisatawan' }, { status: 500 });
    }

    await supabaseAdmin.from('audit_log').insert({
      action: 'reset_credit',
      actor_user_id: adminProfile.id,
      target_id: visitorId,
      metadata: {
        correlation_id: correlationId,
        previous_credit_used: Number(visitor.credit_used),
        credit_limit: creditLimit,
        new_credit_used: creditLimit,
      },
    });
    return NextResponse.json({ success: true, visitor: updatedVisitor });
  } catch (err: unknown) {
    logger.error('visitor.reset_credit.failed', { correlationId, error: err });
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error: ' + message }, { status: 500 });
  }
}
