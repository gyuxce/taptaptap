import { NextResponse } from 'next/server';
import { db, isSupabaseConfigured, getStorageItem, setStorageItem } from '@/lib/supabase';
import { Transaction } from '@/types';

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
    const body = await req.json();
    const { phone, merchantName, amount, visitorName, transactionId } = body;

    // Sanitization & simple validation
    const cleanPhone = String(phone || '').replace(/[^0-9+]/g, '');
    const cleanMerchant = String(merchantName || 'EcoTour Merchant').trim();
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
    } else if (formattedPhone.startsWith('+628')) {
      formattedPhone = '628' + formattedPhone.substring(4);
    } else if (!formattedPhone.startsWith('628')) {
      // default formatting
      formattedPhone = '62' + formattedPhone.replace(/^0+/, '');
    }

    const datetimeStr = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const message = `Halo ${cleanVisitorName} 👋\n\nTransaksi berhasil dicatat!\n📍 Lokasi: ${cleanMerchant}\n💰 Nominal: Rp ${cleanAmount.toLocaleString('id-ID')}\n🕐 Waktu: ${datetimeStr} WIB\n\nTerima kasih telah berkunjung ke EcoTour! 🌿`;

    console.log(`[api/notify] Dispatching Fonnte WA message to: ${formattedPhone}`);

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

    // Update database/storage
    if (isSupabaseConfigured && transactionId) {
      const { supabaseAdmin } = await import('@/lib/supabaseAdmin');
      await supabaseAdmin
        .from('transactions')
        .update({ whatsapp_status: status })
        .eq('id', transactionId);
    } else if (transactionId) {
      // simulation sync
      const list = getStorageItem<Transaction[]>('ecotour_transactions', []);
      const idx = list.findIndex(t => t.id === transactionId);
      if (idx !== -1) {
        list[idx].whatsapp_status = status;
        setStorageItem('ecotour_transactions', list);
      }
    }

    return NextResponse.json({ success: true, status });
  } catch (err: any) {
    console.error('[api/notify] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error: ' + err.message }, { status: 500 });
  }
}
