import { describe, expect, it } from 'vitest';
import { getSupabaseProjectRef, validateDeploymentEnv } from '@/lib/envValidation';

const validStagingEnv = {
  APP_ENV: 'staging',
  NEXT_PUBLIC_APP_ENV: 'staging',
  NEXT_PUBLIC_SUPABASE_URL: 'https://stagingref.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  EXPECTED_SUPABASE_PROJECT_REF: 'stagingref',
};

describe('deployment environment validation', () => {
  it('keeps local development tolerant of missing credentials', () => {
    expect(() => validateDeploymentEnv({ APP_ENV: 'development' })).not.toThrow();
  });

  it('accepts a staging environment bound to the expected Supabase project', () => {
    expect(() => validateDeploymentEnv(validStagingEnv)).not.toThrow();
  });

  it('rejects incomplete production credentials', () => {
    expect(() => validateDeploymentEnv({
      APP_ENV: 'production',
      NEXT_PUBLIC_APP_ENV: 'production',
    })).toThrow(/membutuhkan konfigurasi valid/);
  });

  it('rejects staging configured with a different Supabase project', () => {
    expect(() => validateDeploymentEnv({
      ...validStagingEnv,
      EXPECTED_SUPABASE_PROJECT_REF: 'productionref',
    })).toThrow(/project ref tidak cocok/);
  });

  it('extracts a project ref only from Supabase project URLs', () => {
    expect(getSupabaseProjectRef('https://abc123.supabase.co')).toBe('abc123');
    expect(getSupabaseProjectRef('https://example.com')).toBeNull();
  });
});
