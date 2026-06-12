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

      // Step B: Insert into merchants table
      const { data: merchantData, error: merchantError } = await supabaseAdmin
        .from('merchants')
        .insert({
          name,
          category,
          location,
          merchant_type,
          owner_user_id: userId,
          phone,
          is_active: true
        })
        .select()
        .single();

      if (merchantError || !merchantData) {
        console.error('[create-merchant] merchant db error:', merchantError);
        // Rollback created user
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return NextResponse.json({ error: 'Gagal mendaftarkan merchant di database' }, { status: 500 });
      }

      // Step C: Upsert into profiles table to prevent primary key collision from the trigger
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: userId,
          role: 'merchant',
          merchant_id: merchantData.id,
          merchant_type: merchant_type
        }, { onConflict: 'id' });

      if (profileError) {
        console.error('[create-merchant] profile db error:', profileError);
        // Rollback created user and merchant
        await supabaseAdmin.from('merchants').delete().eq('id', merchantData.id);
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return NextResponse.json({ error: 'Gagal membuat profil user merchant' }, { status: 500 });
      }

      // Step D: Write log to audit trail
      const { error: auditError } = await supabaseAdmin
        .from('audit_log')
        .insert({
          action: 'create_merchant',
          actor_user_id: adminProfile.id,
          target_id: merchantData.id,
          metadata: { name, category, location, phone, owner_email }
        });
      if (auditError) {
        console.warn('[create-merchant] failed to log audit:', auditError);
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
