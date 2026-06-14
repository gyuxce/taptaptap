import type { Profile } from '@/types';

export type AppRole = Profile['role'] | 'anonymous';

export function getRole(profile: Profile | null): AppRole {
  return profile?.role || 'anonymous';
}

export function canAccessPath(profile: Profile | null, pathname: string) {
  const role = getRole(profile);
  if (pathname === '/') return true;
  if (pathname.startsWith('/tap')) return role === 'merchant';
  if (pathname.startsWith('/pos')) {
    return role === 'merchant' && profile?.merchant_type === 'regular';
  }

  const adminPrefixes = ['/dashboard', '/visitors', '/merchants', '/menu-products', '/transactions', '/reports'];
  if (adminPrefixes.some(prefix => pathname.startsWith(prefix))) {
    return role === 'admin';
  }

  return true;
}

export function authenticatedLandingPath(profile: Profile) {
  return profile.role === 'admin' ? '/dashboard' : '/tap';
}
