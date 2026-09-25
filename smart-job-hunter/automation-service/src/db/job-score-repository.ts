import { query, transaction } from '../db/postgres-client';
import { PoolClient } from 'pg';
import { ScoreResult } from '../matching/scoring-strategy';
import logger from '../utils/logger';

export interface StoredJobScore {
  id: string;
  userId: string;
  jobId: string;
  totalScore: number;
  skillScore: number;
  experienceScore: number;
  locationScore: number;
  salaryScore: number;
  recencyScore: number;
  scoreBreakdown: Record<string, any>;
  scoredAt: string;
  // Joined fields from jobs table
  jobTitle?: string;
  companyName?: string;
  jobUrl?: string;
  location?: string;
}

export class JobScoreRepository {

  /**
   * Batch upsert scores.
   * Uses ON CONFLICT to update if user rescores a job.
   */
  async upsertScores(userId: string, scores: ScoreResult[], version: string): Promise<{ inserted: number; updated: number }> {
    if (scores.length === 0) return { inserted: 0, updated: 0 };

    let inserted = 0;
    let updated = 0;

    // Batch in groups of 100
    const batchSize = 100;
    for (let i = 0; i < scores.length; i += batchSize) {
      const batch = scores.slice(i, i + batchSize);

      await transaction(async (client: PoolClient) => {
        for (const score of batch) {
          const breakdown = {
            skill: score.skillScore,
            experience: score.experienceScore,
            location: score.locationScore,
            salary: score.salaryScore,
            recency: score.recencyScore,
          };

          const res = await client.query(
            `INSERT INTO job_scores (
              user_id, job_id, skill_score, experience_score, location_score,
              salary_score, recency_score, total_score, score_breakdown, scoring_version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
            ON CONFLICT (user_id, job_id) DO UPDATE SET
              skill_score = EXCLUDED.skill_score,
              experience_score = EXCLUDED.experience_score,
              location_score = EXCLUDED.location_score,
              salary_score = EXCLUDED.salary_score,
              recency_score = EXCLUDED.recency_score,
              total_score = EXCLUDED.total_score,
              score_breakdown = EXCLUDED.score_breakdown,
              scoring_version = EXCLUDED.scoring_version,
              scored_at = NOW()
            RETURNING (xmax = 0) AS is_new`,
            [
              userId, score.jobId,
              score.skillScore.score, score.experienceScore.score, score.locationScore.score,
              score.salaryScore.score, score.recencyScore.score, score.totalScore,
              JSON.stringify(breakdown), version,
            ]
          );

          if (res.rows[0]?.is_new) inserted++;
          else updated++;
        }
      });
    }

    logger.info(`Scores upserted: ${inserted} new, ${updated} updated`);
    return { inserted, updated };
  }

  /**
   * Get top-ranked jobs for a user.
   */
  async getTopJobs(
    userId: string,
    options: { minScore?: number; limit?: number; offset?: number } = {}
  ): Promise<StoredJobScore[]> {
    const minScore = options.minScore ?? 0;
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const res = await query(
      `SELECT js.*, j.title AS job_title, j.company_name, j.job_url, j.location
       FROM job_scores js
       JOIN jobs j ON j.id = js.job_id
       WHERE js.user_id = $1 AND js.total_score >= $2
       ORDER BY js.total_score DESC
       LIMIT $3 OFFSET $4`,
      [userId, minScore, limit, offset]
    );

    return res.rows.map(this.rowToStoredScore);
  }

  /**
   * Get jobs above auto-apply threshold.
   */
  async getAutoApplyCandidates(userId: string, threshold: number): Promise<StoredJobScore[]> {
    const res = await query(
      `SELECT js.*, j.title AS job_title, j.company_name, j.job_url, j.location
       FROM job_scores js
       JOIN jobs j ON j.id = js.job_id
       LEFT JOIN job_applications ja ON ja.job_id = js.job_id AND ja.user_id = js.user_id
       WHERE js.user_id = $1
         AND js.total_score >= $2
         AND ja.id IS NULL
       ORDER BY js.total_score DESC`,
      [userId, threshold]
    );

    return res.rows.map(this.rowToStoredScore);
  }

  /**
   * Get score stats for a user.
   */
  async getScoreStats(userId: string): Promise<{
    totalScored: number;
    avgScore: number;
    aboveThreshold: number;
    scoreDistribution: Record<string, number>;
  }> {
    const res = await query(
      `SELECT
        COUNT(*) AS total,
        ROUND(AVG(total_score), 1) AS avg_score,
        COUNT(*) FILTER (WHERE total_score >= 75) AS above_threshold,
        COUNT(*) FILTER (WHERE total_score >= 90) AS tier_excellent,
        COUNT(*) FILTER (WHERE total_score >= 75 AND total_score < 90) AS tier_good,
        COUNT(*) FILTER (WHERE total_score >= 50 AND total_score < 75) AS tier_fair,
        COUNT(*) FILTER (WHERE total_score < 50) AS tier_poor
       FROM job_scores WHERE user_id = $1`,
      [userId]
    );

    const row = res.rows[0];
    return {
      totalScored: parseInt(row.total),
      avgScore: parseFloat(row.avg_score) || 0,
      aboveThreshold: parseInt(row.above_threshold),
      scoreDistribution: {
        'excellent (90-100)': parseInt(row.tier_excellent),
        'good (75-89)': parseInt(row.tier_good),
        'fair (50-74)': parseInt(row.tier_fair),
        'poor (0-49)': parseInt(row.tier_poor),
      },
    };
  }

  private rowToStoredScore(row: any): StoredJobScore {
    return {
      id: row.id,
      userId: row.user_id,
      jobId: row.job_id,
      totalScore: parseFloat(row.total_score),
      skillScore: parseFloat(row.skill_score),
      experienceScore: parseFloat(row.experience_score),
      locationScore: parseFloat(row.location_score),
      salaryScore: parseFloat(row.salary_score),
      recencyScore: parseFloat(row.recency_score),
      scoreBreakdown: row.score_breakdown || {},
      scoredAt: row.scored_at,
      jobTitle: row.job_title,
      companyName: row.company_name,
      jobUrl: row.job_url,
      location: row.location,
    };
  }
}
