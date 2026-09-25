import { query, transaction } from './postgres-client';
import { PoolClient } from 'pg';
import logger from '../utils/logger';

// ============================================
// Types
// ============================================
export interface JobRecord {
  external_job_id: string;
  source_platform: string;
  title: string;
  company_name: string | null;
  location: string | null;
  experience_min: number | null;
  experience_max: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  job_description: string | null;
  job_url: string;
  skills: string[];
  company_rating: number | null;
  job_type: string | null;
  posted_date: string | null;
  raw_data: Record<string, any>;
}

export interface UpsertResult {
  total: number;
  inserted: number;
  updated: number;
  errors: number;
}

export interface ScrapeRunRecord {
  id?: string;
  user_id: string | null;
  platform: string;
  search_params: Record<string, any>;
  jobs_found: number;
  jobs_new: number;
  jobs_updated: number;
  jobs_skipped: number;
  status: 'running' | 'completed' | 'failed';
  error_message?: string;
}

// ============================================
// Job Repository
// ============================================
export class JobRepository {

  /**
   * Batch upsert jobs using ON CONFLICT.
   * Updates last_seen_at + any changed fields for existing jobs.
   * Returns counts of inserted vs updated.
   */
  async upsertJobs(jobs: JobRecord[]): Promise<UpsertResult> {
    if (jobs.length === 0) return { total: 0, inserted: 0, updated: 0, errors: 0 };

    const result: UpsertResult = { total: jobs.length, inserted: 0, updated: 0, errors: 0 };

    // Process in batches of 50 to avoid enormous SQL statements
    const batchSize = 50;
    for (let i = 0; i < jobs.length; i += batchSize) {
      const batch = jobs.slice(i, i + batchSize);

      try {
        const batchResult = await this.upsertBatch(batch);
        result.inserted += batchResult.inserted;
        result.updated += batchResult.updated;
      } catch (err: any) {
        logger.error(`Batch upsert failed (batch ${Math.floor(i / batchSize) + 1}): ${err.message}`);
        result.errors += batch.length;
      }
    }

    logger.info(`Upsert complete: ${result.inserted} new, ${result.updated} updated, ${result.errors} errors`);
    return result;
  }

  private async upsertBatch(jobs: JobRecord[]): Promise<{ inserted: number; updated: number }> {
    return await transaction(async (client: PoolClient) => {
      let inserted = 0;
      let updated = 0;

      for (const job of jobs) {
        const res = await client.query(
          `INSERT INTO jobs (
            external_job_id, source_platform, title, company_name, location,
            experience_min, experience_max, salary_min, salary_max, salary_currency,
            job_description, job_url, skills, company_rating, job_type,
            posted_date, raw_data, scraped_at, last_seen_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13::jsonb, $14, $15,
            $16, $17::jsonb, NOW(), NOW()
          )
          ON CONFLICT (external_job_id, source_platform)
          DO UPDATE SET
            title = EXCLUDED.title,
            company_name = COALESCE(EXCLUDED.company_name, jobs.company_name),
            location = COALESCE(EXCLUDED.location, jobs.location),
            experience_min = COALESCE(EXCLUDED.experience_min, jobs.experience_min),
            experience_max = COALESCE(EXCLUDED.experience_max, jobs.experience_max),
            salary_min = COALESCE(EXCLUDED.salary_min, jobs.salary_min),
            salary_max = COALESCE(EXCLUDED.salary_max, jobs.salary_max),
            job_description = COALESCE(EXCLUDED.job_description, jobs.job_description),
            skills = CASE WHEN EXCLUDED.skills != '[]'::jsonb THEN EXCLUDED.skills ELSE jobs.skills END,
            last_seen_at = NOW(),
            is_active = TRUE
          RETURNING (xmax = 0) AS is_new`,
          [
            job.external_job_id, job.source_platform, job.title, job.company_name, job.location,
            job.experience_min, job.experience_max, job.salary_min, job.salary_max, job.salary_currency,
            job.job_description, job.job_url, JSON.stringify(job.skills), job.company_rating, job.job_type,
            job.posted_date, JSON.stringify(job.raw_data),
          ]
        );

        if (res.rows[0]?.is_new) {
          inserted++;
        } else {
          updated++;
        }
      }

      return { inserted, updated };
    });
  }

  /**
   * Check which external IDs already exist (for pre-filtering).
   */
  async getExistingExternalIds(platform: string, externalIds: string[]): Promise<Set<string>> {
    if (externalIds.length === 0) return new Set();

    const placeholders = externalIds.map((_, i) => `$${i + 2}`).join(', ');
    const res = await query<{ external_job_id: string }>(
      `SELECT external_job_id FROM jobs
       WHERE source_platform = $1 AND external_job_id IN (${placeholders})`,
      [platform, ...externalIds]
    );

    return new Set(res.rows.map(r => r.external_job_id));
  }

  /**
   * Get jobs with optional filters.
   */
  async getJobs(filters: {
    platform?: string;
    location?: string;
    skills?: string[];
    minExperience?: number;
    maxExperience?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<any[]> {
    const conditions: string[] = ['is_active = TRUE'];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.platform) {
      conditions.push(`source_platform = $${paramIndex++}`);
      params.push(filters.platform);
    }
    if (filters.location) {
      conditions.push(`location ILIKE $${paramIndex++}`);
      params.push(`%${filters.location}%`);
    }
    if (filters.skills && filters.skills.length > 0) {
      conditions.push(`skills ?| $${paramIndex++}::text[]`);
      params.push(filters.skills);
    }
    if (filters.minExperience !== undefined) {
      conditions.push(`experience_min >= $${paramIndex++}`);
      params.push(filters.minExperience);
    }
    if (filters.maxExperience !== undefined) {
      conditions.push(`experience_max <= $${paramIndex++}`);
      params.push(filters.maxExperience);
    }

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const sql = `
      SELECT * FROM jobs
      WHERE ${conditions.join(' AND ')}
      ORDER BY scraped_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limit, offset);

    const res = await query(sql, params);
    return res.rows;
  }

  // ============================================
  // Scrape Run Tracking
  // ============================================

  async createScrapeRun(run: Omit<ScrapeRunRecord, 'id'>): Promise<string> {
    const res = await query<{ id: string }>(
      `INSERT INTO scrape_runs (user_id, platform, search_params, status)
       VALUES ($1, $2, $3::jsonb, $4)
       RETURNING id`,
      [run.user_id, run.platform, JSON.stringify(run.search_params), run.status]
    );
    return res.rows[0].id;
  }

  async completeScrapeRun(
    runId: string,
    stats: { jobs_found: number; jobs_new: number; jobs_updated: number; jobs_skipped: number },
    status: 'completed' | 'failed' = 'completed',
    errorMessage?: string
  ): Promise<void> {
    await query(
      `UPDATE scrape_runs SET
        jobs_found = $2, jobs_new = $3, jobs_updated = $4, jobs_skipped = $5,
        status = $6, error_message = $7, completed_at = NOW()
       WHERE id = $1`,
      [runId, stats.jobs_found, stats.jobs_new, stats.jobs_updated, stats.jobs_skipped, status, errorMessage || null]
    );
  }
}
