import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Read session cookie
  const sessionCookie = request.cookies.get('ecotour_session');
  
  let session = null;
  if (sessionCookie) {
    try {
      session = JSON.parse(decodeURIComponent(sessionCookie.value));
    } catch {
      // Ignore parse errors
    }
  }

  // Define route types
  const isAuthRoute = pathname === '/';
  const isMerchantRoute = pathname.startsWith('/tap');
  const isAdminRoute = 
    pathname.startsWith('/dashboard') || 
    pathname.startsWith('/visitors') || 
    pathname.startsWith('/merchants') || 
    pathname.startsWith('/transactions');

  // Allow next-internals and static assets
  if (
    pathname.startsWith('/api') || 
    pathname.startsWith('/_next') || 
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 1. Route /tap* -> check session, redirect to / if not present
  if (isMerchantRoute) {
    if (!session) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // 2. Route /dashboard* /visitors* /merchants* /transactions* -> check session + role === admin, redirect to /
  if (isAdminRoute) {
    if (!session || session.role !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // 3. Route / -> if logged in, redirect to /tap or /dashboard accordingly
  if (isAuthRoute) {
    if (session) {
      if (session.role === 'admin') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      } else if (session.role === 'merchant') {
        return NextResponse.redirect(new URL('/tap', request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/tap/:path*',
    '/dashboard/:path*',
    '/visitors/:path*',
    '/merchants/:path*',
    '/transactions/:path*'
  ],
};
