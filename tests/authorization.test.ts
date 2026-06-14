import { describe, expect, it } from 'vitest';
import { authenticatedLandingPath, canAccessPath } from '@/lib/authorization';
import type { Profile } from '@/types';

const admin: Profile = {
  id: 'admin',
  role: 'admin',
  merchant_id: null,
  merchant_type: null,
  created_at: '',
};

const loket: Profile = {
  id: 'loket',
  role: 'merchant',
  merchant_id: 'merchant-loket',
  merchant_type: 'loket',
  created_at: '',
};

const regular: Profile = {
  id: 'regular',
  role: 'merchant',
  merchant_id: 'merchant-regular',
  merchant_type: 'regular',
  created_at: '',
};

describe('route authorization', () => {
  it('redirects each authenticated role to its own application', () => {
    expect(authenticatedLandingPath(admin)).toBe('/dashboard');
    expect(authenticatedLandingPath(loket)).toBe('/tap');
    expect(authenticatedLandingPath(regular)).toBe('/tap');
  });

  it('allows only admin profiles into admin routes', () => {
    for (const path of ['/dashboard', '/visitors', '/merchants', '/menu-products', '/transactions', '/reports']) {
      expect(canAccessPath(admin, path)).toBe(true);
      expect(canAccessPath(loket, path)).toBe(false);
      expect(canAccessPath(regular, path)).toBe(false);
      expect(canAccessPath(null, path)).toBe(false);
    }
  });

  it('allows merchant profiles, but not admin or anonymous users, into terminal routes', () => {
    expect(canAccessPath(loket, '/tap')).toBe(true);
    expect(canAccessPath(regular, '/tap')).toBe(true);
    expect(canAccessPath(admin, '/tap')).toBe(false);
    expect(canAccessPath(null, '/tap')).toBe(false);
    expect(canAccessPath(loket, '/pos')).toBe(true);
    expect(canAccessPath(regular, '/pos')).toBe(true);
    expect(canAccessPath(admin, '/pos')).toBe(false);
  });
});
