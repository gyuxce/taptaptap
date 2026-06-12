import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/supabaseAdmin';
import { getVerifiedAdmin } from '@/lib/serverAuth';
import { consumeRateLimit } from '@/lib/serverRateLimit';
import { logger, requestId } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const correlationId = requestId(req.headers);
  try {
    const adminProfile = await getVerifiedAdmin(req);
    if (!adminProfile) {
      return NextResponse.json({ error: 'Unauthorized. Akses ditolak.' }, { status: 401 });
    }

    // 2. Parse payload
    const body = await req.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: 'ID Merchant diperlukan' }, { status: 400 });
    }

    if (!isSupabaseAdminConfigured) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi' },
        { status: 503 }
      );
    }
    const rateLimit = await consumeRateLimit(req, {
      namespace: 'admin:delete-merchant',
      subject: adminProfile.id,
      limit: 5,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.unavailable ? 'Rate limiter tidak tersedia' : 'Terlalu banyak permintaan' },
        { status: rateLimit.unavailable ? 503 : 429 }
      );
    }

    if (isSupabaseAdminConfigured) {
      // Step A: Get owner_user_id
      const { data: merch, error: mGetErr } = await supabaseAdmin
        .from('merchants')
        .select('name, owner_user_id')
        .eq('id', id)
        .single();

      if (mGetErr || !merch) {
        console.error('[delete-merchant] find error:', mGetErr);
        return NextResponse.json({ error: 'Merchant tidak ditemukan' }, { status: 404 });
      }

      // Step B: Delete merchant record (cascades transactions due to FK cascade delete)
      const { error: delErr } = await supabaseAdmin
        .from('merchants')
        .delete()
        .eq('id', id);

      if (delErr) {
        console.error('[delete-merchant] db delete error:', delErr);
        return NextResponse.json({ error: 'Gagal menghapus merchant dari database' }, { status: 500 });
      }

      // Step C: Delete user from auth.users (cascades profiles due to ON DELETE CASCADE)
      if (merch.owner_user_id) {
        const { error: authDelErr } = await supabaseAdmin.auth.admin.deleteUser(merch.owner_user_id);
        if (authDelErr) {
          console.warn('[delete-merchant] failed to delete auth user:', authDelErr);
        }
      }

      // Step D: Write log to audit trail
      const { error: auditError } = await supabaseAdmin
        .from('audit_log')
        .insert({
          action: 'delete_merchant',
          actor_user_id: adminProfile.id,
          target_id: id,
          metadata: { name: merch.name, owner_user_id: merch.owner_user_id }
        });
      if (auditError) {
        console.warn('[delete-merchant] failed to log audit:', auditError);
      }

      return NextResponse.json({ success: true });
    }
  } catch (err: unknown) {
    logger.error('merchant.delete.failed', { correlationId, error: err });
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error: ' + message }, { status: 500 });
  }
}
