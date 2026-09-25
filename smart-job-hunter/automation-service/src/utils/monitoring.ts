import logger from '../utils/logger';
import { query } from '../db/postgres-client';

/**
 * Lightweight monitoring — no external services needed.
 * Logs to structured JSON, tracks system health, alerts on anomalies.
 *
 * Production upgrade path: Sentry (error tracking), BetterStack (logs), PostHog (analytics).
 */

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  checks: Record<string, { ok: boolean; latencyMs: number; error?: string }>;
  timestamp: string;
}

/**
 * Run health checks on all dependencies.
 */
export async function checkHealth(): Promise<HealthStatus> {
  const checks: HealthStatus['checks'] = {};

  // Database
  const dbStart = Date.now();
  try {
    await query('SELECT 1');
    checks.database = { ok: true, latencyMs: Date.now() - dbStart };
  } catch (err: any) {
    checks.database = { ok: false, latencyMs: Date.now() - dbStart, error: err.message };
  }

  // Ollama
  const ollamaStart = Date.now();
  try {
    const res = await fetch(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    checks.ollama = { ok: res.ok, latencyMs: Date.now() - ollamaStart };
  } catch (err: any) {
    checks.ollama = { ok: false, latencyMs: Date.now() - ollamaStart, error: err.message };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  const someOk = Object.values(checks).some((c) => c.ok);

  return {
    status: allOk ? 'healthy' : someOk ? 'degraded' : 'down',
    checks,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Track key metrics in DB for the dashboard.
 */
export async function recordMetric(name: string, value: number, userId?: string): Promise<void> {
  try {
    await query(
      `INSERT INTO usage_log (user_id, action, count, period)
       VALUES ($1, $2, $3, CURRENT_DATE)
       ON CONFLICT (user_id, action, period) DO UPDATE SET count = usage_log.count + $3`,
      [userId || '00000000-0000-0000-0000-000000000000', name, value]
    );
  } catch (err: any) {
    logger.warn(`Failed to record metric ${name}: ${err.message}`);
  }
}

/**
 * Simple error reporter — logs structured error data.
 * In production, replace with Sentry SDK.
 */
export function reportError(error: Error, context?: Record<string, any>): void {
  const payload = {
    level: 'error',
    message: error.message,
    stack: error.stack?.split('\n').slice(0, 5),
    context,
    timestamp: new Date().toISOString(),
  };

  logger.error(JSON.stringify(payload));

  // TODO: Production — send to Sentry
  // Sentry.captureException(error, { extra: context });
}
