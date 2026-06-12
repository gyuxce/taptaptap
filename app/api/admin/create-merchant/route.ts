import { NextRequest, NextResponse } from 'next/server';
import { createMerchantSchema } from '@/lib/validations';
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

    // 2. Validate input schema
    const body = await req.json();
    const validation = createMerchantSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues[0]?.message || 'Validasi formulir gagal' }, { status: 400 });
    }

    const { name, category, location, merchant_type, phone, owner_email, owner_password } = validation.data;

    if (!isSupabaseAdminConfigured) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi' },
        { status: 503 }
      );
    }
    const rateLimit = await consumeRateLimit(req, {
      namespace: 'admin:create-merchant',
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

    // 3. Database operations
    if (isSupabaseAdminConfigured) {
      // Step A: Create User in auth.users
      const { data: userData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: owner_email,
        password: owner_password,
        email_confirm: true,
        user_metadata: { role: 'merchant', name }
      });

      if (authError || !userData?.user) {
        console.error('[create-merchant] auth error:', authError);
        const errMsg = authError?.message === 'User already exists' ? 'Email sudah digunakan' : 'Gagal membuat user auth';
        return NextResponse.json({ error: errMsg }, { status: 400 });
      }

      const userId = userData.user.id;

      // Step B: Insert merchant, update profile, and write audit in one DB transaction.
      const { data: provisionedMerchants, error: merchantError } = await supabaseAdmin
        .rpc('finalize_merchant_provisioning', {
          p_user_id: userId,
          p_actor_user_id: adminProfile.id,
          p_name: name,
          p_category: category,
          p_location: location,
          p_merchant_type: merchant_type,
          p_phone: phone,
          p_owner_email: owner_email,
        });
      const merchantData = provisionedMerchants?.[0];

      if (merchantError || !merchantData) {
        console.error('[create-merchant] merchant db error:', merchantError);
        // Rollback created user
        await supabaseAdmin.auth.admin.deleteUser(userId);
        const isMissingPhoneColumn =
          merchantError?.code === 'PGRST204' &&
          merchantError.message?.includes("'phone'");
        const isMissingProvisioningFunction =
          merchantError?.code === 'PGRST202' ||
          merchantError?.message?.includes('finalize_merchant_provisioning');
        return NextResponse.json({
          error: isMissingPhoneColumn
            ? 'Schema database belum terbaru: kolom merchants.phone belum tersedia'
            : isMissingProvisioningFunction
              ? 'Jalankan migration optimasi provisioning merchant di Supabase'
              : 'Gagal mendaftarkan merchant di database',
          correlationId,
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        merchant: merchantData,
        credentials: { email: owner_email, password: owner_password }
      });
    }
  } catch (err: unknown) {
    logger.error('merchant.create.failed', { correlationId, error: err });
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error: ' + message }, { status: 500 });
  }
}
