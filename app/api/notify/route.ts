import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedProfile } from '@/lib/serverAuth';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/supabaseAdmin';
import { consumeRateLimit } from '@/lib/serverRateLimit';
import { logger, requestId } from '@/lib/logger';
export async function POST(req: NextRequest) {
    const correlationId = requestId(req.headers);
    try {
        const profile = await getVerifiedProfile(req);
        if (!profile) {
            return NextResponse.json({ error: 'Unauthorized. Akses ditolak.' }, { status: 401 });
        }
        if (!isSupabaseAdminConfigured) {
            return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi' }, { status: 503 });
        }
        const rateLimit = await consumeRateLimit(req, {
            namespace: 'notify',
            subject: profile.id,
            limit: 30,
            windowSeconds: 60,
        });
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: rateLimit.unavailable ? 'Rate limiter tidak tersedia' : 'Terlalu banyak permintaan' },
                { status: rateLimit.unavailable ? 503 : 429 }
            );
        }
        const body = await req.json();
        const { phone, merchantName, amount, visitorName, transactionId } = body;
        // Sanitization & simple validation
        const cleanPhone = String(phone || '').replace(/[^0-9+]/g, '');
        const cleanMerchant = String(merchantName || 'WAVR Merchant').trim();
        const cleanAmount = Number(amount || 0);
        const cleanVisitorName = String(visitorName || 'Wisatawan').trim();
        const fonnteToken = process.env.FONNTE_TOKEN || '';
        // Guard cases
        if (!fonnteToken) {
            console.warn('[api/notify] Skip WA: FONNTE_TOKEN is missing');
            return NextResponse.json({ success: true, skipped: true, reason: 'missing_token' });
        }
        if (cleanAmount <= 0) {
            return NextResponse.json({ success: true, skipped: true, reason: 'amount_zero' });
        }
        if (!cleanPhone) {
            return NextResponse.json({ success: true, skipped: true, reason: 'missing_phone' });
        }
        // Format Indonesian phone numbers
        let formattedPhone = cleanPhone;
        if (formattedPhone.startsWith('08')) {
            formattedPhone = '628' + formattedPhone.substring(2);
        }
        else if (formattedPhone.startsWith('+628')) {
            formattedPhone = '628' + formattedPhone.substring(4);
        }
        else if (!formattedPhone.startsWith('628')) {
            // default formatting
            formattedPhone = '62' + formattedPhone.replace(/^0+/, '');
        }
        const datetimeStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        const message = `Halo ${cleanVisitorName} 👋\n\nTransaksi berhasil dicatat!\n📍 Lokasi: ${cleanMerchant}\n💰 Nominal: Rp ${cleanAmount.toLocaleString('id-ID')}\n🕐 Waktu: ${datetimeStr} WIB\n\nTerima kasih telah berkunjung ke WAVR!`;
        logger.info('notification.dispatch', { correlationId, provider: 'fonnte' });
        const res = await fetch('https://api.fonnte.com/send', {
            method: 'POST',
            headers: {
                'Authorization': fonnteToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                target: formattedPhone,
                message: message,
                countryCode: '62',
            }),
        });
        const resData = await res.json();
        const isSent = !!(res.ok && (resData.status === true || resData.status === 'true' || resData.detail === 'success' || resData.status === 'sent'));
        const status = isSent ? 'sent' : 'failed';
        if (transactionId) {
            await supabaseAdmin
                .from('transactions')
                .update({ whatsapp_status: status })
                .eq('id', transactionId);
        }
        return NextResponse.json({ success: true, status });
    }
    catch (err: unknown) {
        logger.error('notification.failed', { correlationId, error: err });
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: 'Internal Server Error: ' + message }, { status: 500 });
    }
}
