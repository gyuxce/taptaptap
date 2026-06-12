import { NextResponse } from 'next/server';
import { createMerchantSchema } from '@/lib/validations';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/supabaseAdmin';

// Simple in-memory rate limiting map
const ipRequestTimestamps: { [ip: string]: number } = {};

export async function POST(req: Request) {
  // Simple rate limiting: max 1 req per sec per IP
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const now = Date.now();
  const lastReqTime = ipRequestTimestamps[ip];
  if (lastReqTime && now - lastReqTime < 1000) {
    return NextResponse.json({ error: 'Too many requests. Limit 1 per second.' }, { status: 429 });
  }
  ipRequestTimestamps[ip] = now;

  try {
    // 1. Auth Guard (check admin session in cookies)
    const cookieHeader = req.headers.get('cookie') || '';
    const sessionCookie = cookieHeader
      .split('; ')
      .find(row => row.startsWith('ecotour_session='))
      ?.split('=')[1];
    
    let adminProfile: any = null;
    if (sessionCookie) {
      try {
        adminProfile = JSON.parse(decodeURIComponent(sessionCookie));
      } catch {
        // ignore
      }
    }

    if (!adminProfile || adminProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized. Akses ditolak.' }, { status: 401 });
    }

    // 2. Validate input schema
    const body = await req.json();
    const validation = createMerchantSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues[0]?.message || 'Validasi formulir gagal' }, { status: 400 });
    }

    const { name, category, location, merchant_type, owner_email, owner_password } = validation.data;

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

      // Step C: Insert into profiles table
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: userId,
          role: 'merchant',
          merchant_id: merchantData.id,
          merchant_type: merchant_type
        });

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
          metadata: { name, category, location, owner_email }
        });
      if (auditError) {
        console.warn('[create-merchant] failed to log audit:', auditError);
      }

      return NextResponse.json({
        success: true,
        merchant: merchantData,
        credentials: { email: owner_email, password: owner_password }
      });
    } else {
      // Simulation offline mode
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'offline_mode_simulation',
        credentials: { email: owner_email, password: owner_password }
      });
    }
  } catch (err: any) {
    console.error('[create-merchant] caught error:', err);
    return NextResponse.json({ error: 'Internal Server Error: ' + err.message }, { status: 500 });
  }
}
