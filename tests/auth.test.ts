import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  single: vi.fn(),
  requireSupabaseConfig: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  requireSupabaseConfig: mocks.requireSupabaseConfig,
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: mocks.single })),
      })),
    })),
  },
}));

import { signIn } from '@/lib/auth';

describe('login', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'window', {
      value: { setTimeout, clearTimeout },
      configurable: true,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects malformed credentials before contacting Supabase', async () => {
    const result = await signIn('not-an-email', '123');
    expect(result.error).toBeTruthy();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('returns the verified profile after a successful login', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'admin@example.com' } },
      error: null,
    });
    mocks.single.mockResolvedValue({
      data: {
        id: 'user-1',
        role: 'admin',
        merchant_id: null,
        merchant_type: null,
        created_at: '',
      },
      error: null,
    });

    const result = await signIn('admin@example.com', 'password123');
    expect(result.error).toBeNull();
    expect(result.profile?.role).toBe('admin');
  });

  it('signs the session out when the account has no authorization profile', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-2', email: 'orphan@example.com' } },
      error: null,
    });
    mocks.single.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const result = await signIn('orphan@example.com', 'password123');
    expect(result.profile).toBeNull();
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
