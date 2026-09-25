/**
 * Scoring weights and thresholds — fully tunable.
 * Change these to adjust scoring behavior without touching code logic.
 */

export interface ScoringWeights {
  skill: number;
  experience: number;
  location: number;
  salary: number;
  recency: number;
}

export interface ScoringThresholds {
  autoApplyMinScore: number;     // minimum score to auto-apply
  reviewMinScore: number;        // minimum score to show in dashboard
  experienceFlexYears: number;   // how many years below range is "close enough"
  salaryFlexPercent: number;     // how far below expected salary is acceptable (0.0-1.0)
}

export interface RecencyTiers {
  fresh: { maxDays: number; score: number };
  recent: { maxDays: number; score: number };
  moderate: { maxDays: number; score: number };
  stale: { score: number };
}

export interface ScoringConfig {
  version: string;
  weights: ScoringWeights;
  thresholds: ScoringThresholds;
  recencyTiers: RecencyTiers;
}

/**
 * Default config — override via env or future admin panel.
 */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  version: 'v1',

  weights: {
    skill: 0.40,
    experience: 0.20,
    location: 0.15,
    salary: 0.15,
    recency: 0.10,
  },

  thresholds: {
    autoApplyMinScore: 75,
    reviewMinScore: 50,
    experienceFlexYears: 1,     // 1 year below min is still acceptable
    salaryFlexPercent: 0.15,    // 15% below expected is still "okay"
  },

  recencyTiers: {
    fresh:    { maxDays: 2,  score: 100 },
    recent:   { maxDays: 5,  score: 80 },
    moderate: { maxDays: 10, score: 60 },
    stale:    { score: 30 },
  },
};

/**
 * Load config — currently returns defaults, but designed to be overridable
 * from DB, env vars, or admin panel in the future.
 */
export function loadScoringConfig(): ScoringConfig {
  const config = { ...DEFAULT_SCORING_CONFIG };

  // Override weights from env if set
  const envWeights = process.env.SCORING_WEIGHTS;
  if (envWeights) {
    try {
      const parsed = JSON.parse(envWeights);
      config.weights = { ...config.weights, ...parsed };
    } catch {
      // ignore malformed env
    }
  }

  const envThreshold = process.env.AUTO_APPLY_MIN_SCORE;
  if (envThreshold) {
    config.thresholds.autoApplyMinScore = parseInt(envThreshold);
  }

  // Validate weights sum to 1.0
  const sum = Object.values(config.weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1.0) > 0.01) {
    throw new Error(`Scoring weights must sum to 1.0, got ${sum.toFixed(3)}`);
  }

  return config;
}
