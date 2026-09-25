import { createHash, randomBytes } from 'crypto';
import { query } from '../db/postgres-client';
import logger from '../utils/logger';

/**
 * JWT-based auth utilities for the automation service.
 *
 * The actual JWT issuance/verification happens in the Spring Boot backend.
 * This module handles:
 *   - Password hashing (bcrypt-like with crypto)
 *   - Refresh token management
 *   - Usage tracking for billing
 */

// ============================================
// Password Hashing (use bcrypt in production Spring Boot backend)
// This is a simplified version for the Node.js automation service
// ============================================

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(salt + password).digest('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = createHash('sha256').update(salt + password).digest('hex');
  return computed === hash;
}

// ============================================
// Refresh Token Management
// ============================================

export async function createRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );

  return token;
}

export async function validateRefreshToken(token: string): Promise<string | null> {
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const res = await query(
    `SELECT user_id FROM refresh_tokens
     WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW()`,
    [tokenHash]
  );

  return res.rowCount && res.rowCount > 0 ? res.rows[0].user_id : null;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await query(`UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1`, [tokenHash]);
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await query(`UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1`, [userId]);
}

// ============================================
// Usage Tracking (for billing plan enforcement)
// ============================================

export interface PlanLimits {
  dailyScrapes: number;
  dailyGenerations: number;
  dailyApplications: number;
  totalJobs: number;
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { dailyScrapes: 3, dailyGenerations: 10, dailyApplications: 5, totalJobs: 100 },
  pro: { dailyScrapes: 20, dailyGenerations: 100, dailyApplications: 30, totalJobs: 5000 },
  enterprise: { dailyScrapes: 999, dailyGenerations: 999, dailyApplications: 100, totalJobs: 99999 },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

export async function trackUsage(userId: string, action: string): Promise<void> {
  await query(
    `INSERT INTO usage_log (user_id, action, count, period)
     VALUES ($1, $2, 1, CURRENT_DATE)
     ON CONFLICT (user_id, action, period) DO UPDATE SET count = usage_log.count + 1`,
    [userId, action]
  );
}

export async function checkUsageLimit(userId: string, action: string): Promise<{ allowed: boolean; used: number; limit: number }> {
  // Get user's plan
  const userRes = await query(`SELECT plan FROM users WHERE id = $1`, [userId]);
  const plan = userRes.rows[0]?.plan || 'free';
  const limits = getPlanLimits(plan);

  // Get today's usage
  const usageRes = await query(
    `SELECT COALESCE(count, 0) AS used FROM usage_log
     WHERE user_id = $1 AND action = $2 AND period = CURRENT_DATE`,
    [userId, action]
  );
  const used = parseInt(usageRes.rows[0]?.used || '0');

  const limitMap: Record<string, number> = {
    scrape: limits.dailyScrapes,
    generate: limits.dailyGenerations,
    apply: limits.dailyApplications,
  };
  const limit = limitMap[action] ?? 999;

  return { allowed: used < limit, used, limit };
}

export async function getUsageSummary(userId: string): Promise<Record<string, { used: number; limit: number }>> {
  const userRes = await query(`SELECT plan FROM users WHERE id = $1`, [userId]);
  const plan = userRes.rows[0]?.plan || 'free';
  const limits = getPlanLimits(plan);

  const usageRes = await query(
    `SELECT action, COALESCE(count, 0) AS used FROM usage_log
     WHERE user_id = $1 AND period = CURRENT_DATE`,
    [userId]
  );

  const usageMap: Record<string, number> = {};
  for (const row of usageRes.rows) {
    usageMap[row.action] = parseInt(row.used);
  }

  return {
    scrape: { used: usageMap.scrape || 0, limit: limits.dailyScrapes },
    generate: { used: usageMap.generate || 0, limit: limits.dailyGenerations },
    apply: { used: usageMap.apply || 0, limit: limits.dailyApplications },
  };
}
