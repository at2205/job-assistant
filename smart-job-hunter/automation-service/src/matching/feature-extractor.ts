import { query } from '../db/postgres-client';
import { UserFeatures, JobFeatures } from './scoring-strategy';
import logger from '../utils/logger';

/**
 * Extracts and normalizes features from DB records
 * into structures that the scoring engine can consume.
 */
export class FeatureExtractor {

  /**
   * Load user profile features from DB.
   */
  async extractUserFeatures(userId: string): Promise<UserFeatures> {
    const res = await query(
      `SELECT skills, experience_years, preferred_locations, target_locations,
              expected_salary_min, expected_salary_max, min_experience
       FROM users WHERE id = $1`,
      [userId]
    );

    if (res.rowCount === 0) {
      throw new Error(`User not found: ${userId}`);
    }

    const user = res.rows[0];

    // Parse skills from JSONB
    let skills: string[] = [];
    if (Array.isArray(user.skills)) {
      skills = user.skills.map((s: any) => typeof s === 'string' ? s.toLowerCase().trim() : '').filter(Boolean);
    } else if (typeof user.skills === 'string') {
      try {
        skills = JSON.parse(user.skills).map((s: string) => s.toLowerCase().trim());
      } catch {
        skills = [];
      }
    }

    // Merge preferred_locations and target_locations
    const locations: string[] = [
      ...(user.preferred_locations || []),
      ...(user.target_locations || []),
    ].map((l: string) => l.toLowerCase().trim()).filter(Boolean);

    return {
      skills,
      experienceYears: user.experience_years || user.min_experience || 0,
      preferredLocations: [...new Set(locations)],
      expectedSalaryMin: user.expected_salary_min || 0,
      expectedSalaryMax: user.expected_salary_max || 0,
    };
  }

  /**
   * Load job features for unscored jobs (jobs this user hasn't scored yet).
   * Returns batches to avoid loading entire DB into memory.
   */
  async extractUnscoredJobs(userId: string, limit: number = 200): Promise<JobFeatures[]> {
    const res = await query(
      `SELECT j.id, j.title, j.company_name, j.skills, j.experience_min, j.experience_max,
              j.salary_min, j.salary_max, j.location, j.posted_date
       FROM jobs j
       WHERE j.is_active = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM job_scores js WHERE js.job_id = j.id AND js.user_id = $1
         )
       ORDER BY j.scraped_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return res.rows.map(this.rowToJobFeatures);
  }

  /**
   * Load all active job features (for rescoring).
   */
  async extractAllActiveJobs(limit: number = 500): Promise<JobFeatures[]> {
    const res = await query(
      `SELECT id, title, company_name, skills, experience_min, experience_max,
              salary_min, salary_max, location, posted_date
       FROM jobs WHERE is_active = TRUE
       ORDER BY scraped_at DESC LIMIT $1`,
      [limit]
    );

    return res.rows.map(this.rowToJobFeatures);
  }

  /**
   * Load specific jobs by IDs.
   */
  async extractJobsByIds(jobIds: string[]): Promise<JobFeatures[]> {
    if (jobIds.length === 0) return [];
    const placeholders = jobIds.map((_, i) => `$${i + 1}`).join(', ');
    const res = await query(
      `SELECT id, title, company_name, skills, experience_min, experience_max,
              salary_min, salary_max, location, posted_date
       FROM jobs WHERE id IN (${placeholders})`,
      jobIds
    );
    return res.rows.map(this.rowToJobFeatures);
  }

  private rowToJobFeatures(row: any): JobFeatures {
    let skills: string[] = [];
    if (Array.isArray(row.skills)) {
      skills = row.skills.map((s: any) => typeof s === 'string' ? s.toLowerCase().trim() : '').filter(Boolean);
    }

    return {
      jobId: row.id,
      title: row.title || '',
      companyName: row.company_name || null,
      skills,
      experienceMin: row.experience_min,
      experienceMax: row.experience_max,
      salaryMin: row.salary_min,
      salaryMax: row.salary_max,
      location: row.location,
      postedDate: row.posted_date ? new Date(row.posted_date) : null,
    };
  }
}
