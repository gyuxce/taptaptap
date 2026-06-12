import { NextResponse } from 'next/server';
import { resetCredit } from '@/lib/services/visitorService';

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

    // 2. Read request body
    const body = await req.json();
    const { visitorId, actorUserId } = body;

    if (!visitorId) {
      return NextResponse.json({ error: 'visitorId wajib dikirim' }, { status: 400 });
    }

    // 3. Call visitor service function
    const res = await resetCredit(visitorId, actorUserId || adminProfile.id);

    if (res.success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Gagal mereset kredit wisatawan' }, { status: 500 });
    }
  } catch (err: any) {
    console.error('[reset-credit] caught error:', err);
    return NextResponse.json({ error: 'Internal Server Error: ' + err.message }, { status: 500 });
  }
}
