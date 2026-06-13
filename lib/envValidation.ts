type RuntimeEnv = Record<string, string | undefined>;

const strictEnvironments = new Set(['staging', 'production']);
const placeholderPattern = /(your-|placeholder|missing-config|example)/i;

export function getSupabaseProjectRef(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith('.supabase.co') ? hostname.split('.')[0] : null;
  } catch {
    return null;
  }
}

export function validateDeploymentEnv(env: RuntimeEnv) {
  const appEnv = env.APP_ENV || 'development';
  if (!strictEnvironments.has(appEnv)) return;

  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'EXPECTED_SUPABASE_PROJECT_REF',
  ] as const;

  const missing = required.filter(key => {
    const value = env[key]?.trim();
    return !value || placeholderPattern.test(value);
  });

  if (missing.length > 0) {
    throw new Error(
      `[env] ${appEnv} membutuhkan konfigurasi valid: ${missing.join(', ')}`
    );
  }

  if (env.NEXT_PUBLIC_APP_ENV !== appEnv) {
    throw new Error(
      `[env] NEXT_PUBLIC_APP_ENV harus sama dengan APP_ENV (${appEnv}).`
    );
  }

  const projectRef = getSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL!);
  if (!projectRef) {
    throw new Error('[env] NEXT_PUBLIC_SUPABASE_URL bukan URL project Supabase yang valid.');
  }

  if (projectRef !== env.EXPECTED_SUPABASE_PROJECT_REF) {
    throw new Error(
      `[env] Supabase project ref tidak cocok. Diharapkan ${env.EXPECTED_SUPABASE_PROJECT_REF}, menerima ${projectRef}.`
    );
  }
}
