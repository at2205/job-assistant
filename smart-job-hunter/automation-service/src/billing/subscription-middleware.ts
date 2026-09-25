// =============================================
// Subscription Middleware — Usage Gating
// =============================================
// Checks plan limits before allowing operations.
// Used by queue workers and API endpoints.
// =============================================

import { query } from '../db/postgres-client';
import { logger } from '../utils/logging';

export interface PlanLimits {
  planName: string;
  maxApplicationsPerDay: number;
  maxAiGenerationsPerDay: number;
  maxScrapeRunsPerDay: number;
  maxSavedJobs: number;
  maxPlatforms: number;
  features: string[];
}

export interface DailyUsage {
  applicationsCount: number;
  aiGenerationsCount: number;
  scrapeRunsCount: number;
}

// ---- Get user's plan limits ----
export async function getUserPlanLimits(userId: string): Promise<PlanLimits> {
  const res = await query(
    `SELECT p.name as plan_name,
            p.max_applications_per_day,
            p.max_ai_generations_per_day,
            p.max_scrape_runs_per_day,
            p.max_saved_jobs,
            p.max_platforms,
            p.features
     FROM subscriptions s
     JOIN plans p ON s.plan_id = p.id
     WHERE s.user_id = $1 AND s.status IN ('active', 'trialing')`,
    [userId],
  );

  if (res.rows.length === 0) {
    // Default to free plan limits
    return {
      planName: 'free',
      maxApplicationsPerDay: 5,
      maxAiGenerationsPerDay: 10,
      maxScrapeRunsPerDay: 3,
      maxSavedJobs: 100,
      maxPlatforms: 1,
      features: ['basic_scoring', 'manual_apply'],
    };
  }

  const row = res.rows[0];
  return {
    planName: row.plan_name,
    maxApplicationsPerDay: row.max_applications_per_day,
    maxAiGenerationsPerDay: row.max_ai_generations_per_day,
    maxScrapeRunsPerDay: row.max_scrape_runs_per_day,
    maxSavedJobs: row.max_saved_jobs,
    maxPlatforms: row.max_platforms,
    features: row.features,
  };
}

// ---- Get today's usage ----
export async function getDailyUsage(userId: string): Promise<DailyUsage> {
  const res = await query(
    `SELECT applications_count, ai_generations_count, scrape_runs_count
     FROM daily_usage
     WHERE user_id = $1 AND usage_date = CURRENT_DATE`,
    [userId],
  );

  if (res.rows.length === 0) {
    return { applicationsCount: 0, aiGenerationsCount: 0, scrapeRunsCount: 0 };
  }

  return {
    applicationsCount: res.rows[0].applications_count,
    aiGenerationsCount: res.rows[0].ai_generations_count,
    scrapeRunsCount: res.rows[0].scrape_runs_count,
  };
}

// ---- Increment usage counter ----
export async function incrementUsage(
  userId: string,
  field: 'applications_count' | 'ai_generations_count' | 'scrape_runs_count',
): Promise<void> {
  await query(
    `INSERT INTO daily_usage (user_id, usage_date, ${field})
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (user_id, usage_date)
     DO UPDATE SET ${field} = daily_usage.${field} + 1`,
    [userId],
  );
}

// ---- Gate Checks ----
export type GateResult = { allowed: true } | { allowed: false; reason: string };

export async function canApply(userId: string): Promise<GateResult> {
  const [limits, usage] = await Promise.all([
    getUserPlanLimits(userId),
    getDailyUsage(userId),
  ]);

  if (usage.applicationsCount >= limits.maxApplicationsPerDay) {
    return {
      allowed: false,
      reason: `Daily application limit reached (${limits.maxApplicationsPerDay}/${limits.planName} plan). Upgrade for more.`,
    };
  }

  if (!limits.features.includes('auto_apply') && !limits.features.includes('manual_apply')) {
    return { allowed: false, reason: 'Application feature not available on your plan.' };
  }

  return { allowed: true };
}

export async function canGenerate(userId: string): Promise<GateResult> {
  const [limits, usage] = await Promise.all([
    getUserPlanLimits(userId),
    getDailyUsage(userId),
  ]);

  if (usage.aiGenerationsCount >= limits.maxAiGenerationsPerDay) {
    return {
      allowed: false,
      reason: `Daily AI generation limit reached (${limits.maxAiGenerationsPerDay}/${limits.planName} plan). Upgrade for more.`,
    };
  }

  return { allowed: true };
}

export async function canScrape(userId: string): Promise<GateResult> {
  const [limits, usage] = await Promise.all([
    getUserPlanLimits(userId),
    getDailyUsage(userId),
  ]);

  if (usage.scrapeRunsCount >= limits.maxScrapeRunsPerDay) {
    return {
      allowed: false,
      reason: `Daily scrape limit reached (${limits.maxScrapeRunsPerDay}/${limits.planName} plan). Upgrade for more.`,
    };
  }

  return { allowed: true };
}

export async function checkFeature(userId: string, feature: string): Promise<GateResult> {
  const limits = await getUserPlanLimits(userId);
  if (!limits.features.includes(feature)) {
    return {
      allowed: false,
      reason: `Feature "${feature}" requires ${feature === 'api_access' ? 'Agency' : 'Pro'} plan.`,
    };
  }
  return { allowed: true };
}

// ---- Usage Report ----
export async function getUsageReport(userId: string): Promise<{
  plan: PlanLimits;
  today: DailyUsage;
  remaining: {
    applications: number;
    aiGenerations: number;
    scrapeRuns: number;
  };
}> {
  const [plan, today] = await Promise.all([
    getUserPlanLimits(userId),
    getDailyUsage(userId),
  ]);

  return {
    plan,
    today,
    remaining: {
      applications: Math.max(0, plan.maxApplicationsPerDay - today.applicationsCount),
      aiGenerations: Math.max(0, plan.maxAiGenerationsPerDay - today.aiGenerationsCount),
      scrapeRuns: Math.max(0, plan.maxScrapeRunsPerDay - today.scrapeRunsCount),
    },
  };
}
