import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getVerifiedProfile } from '@/lib/serverAuth';
import { authenticatedLandingPath, canAccessPath } from '@/lib/authorization';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const profile = await getVerifiedProfile(request);

  const isAuthRoute = pathname === '/';
  if (!canAccessPath(profile, pathname)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (isAuthRoute && profile) {
    return NextResponse.redirect(
      new URL(authenticatedLandingPath(profile), request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/tap/:path*',
    '/pos/:path*',
    '/dashboard/:path*',
    '/visitors/:path*',
    '/merchants/:path*',
    '/menu-products/:path*',
    '/transactions/:path*',
    '/reports/:path*',
  ],
};
