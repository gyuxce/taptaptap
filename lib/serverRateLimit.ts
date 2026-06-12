import 'server-only';

import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { isSupabaseAdminConfigured, supabaseAdmin } from '@/lib/supabaseAdmin';
import { logger } from '@/lib/logger';

interface RateLimitOptions {
  namespace: string;
  limit: number;
  windowSeconds: number;
  subject?: string;
}

function getClientIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export async function consumeRateLimit(request: NextRequest, options: RateLimitOptions) {
  if (!isSupabaseAdminConfigured) {
    return { allowed: false, unavailable: true };
  }

  const rawKey = `${options.namespace}:${options.subject || getClientIp(request)}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const { data, error } = await supabaseAdmin.rpc('consume_rate_limit', {
    p_key_hash: keyHash,
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
  });

  if (error) {
    logger.error('rate_limit.failed', { namespace: options.namespace, error });
    return { allowed: false, unavailable: true };
  }

  return { allowed: data === true, unavailable: false };
}
