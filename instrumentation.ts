import type { Instrumentation } from 'next';
import { logger } from '@/lib/logger';

export function register() {
  logger.info('application.started', {
    environment: process.env.APP_ENV || process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
  });
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const payload = {
    route: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routeType: context.routeType,
    error,
  };
  logger.error('request.unhandled_error', payload);

  const webhook = process.env.OBSERVABILITY_WEBHOOK_URL;
  if (webhook) {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'request.unhandled_error',
        ...payload,
        error: error instanceof Error ? error.message : String(error),
      }),
    }).catch(reportError => {
      logger.error('observability.webhook_failed', { error: reportError });
    });
  }
};
