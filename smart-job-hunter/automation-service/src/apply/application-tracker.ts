import { query } from '../db/postgres-client';
import { createHash } from 'crypto';
import logger from '../utils/logger';

export type ApplicationStatus = 'pending' | 'approved' | 'applying' | 'applied' | 'failed' | 'skipped';

export interface ApplicationRecord {
  id: string;
  userId: string;
  jobId: string;
  status: ApplicationStatus;
  resumeUsed: string | null;
  coverLetterUsed: string | null;
  answersUsed: Record<string, string>;
  appliedAt: string | null;
  failureReason: string | null;
  platformConfirmation: string | null;
  retryCount: number;
  createdAt: string;
}

export class ApplicationTracker {

  /**
   * Create a pending application record.
   * Returns null if already exists (duplicate prevention).
   */
  async createPending(userId: string, jobId: string, externalJobId: string, platform: string): Promise<string | null> {
    const applyHash = this.computeHash(userId, externalJobId, platform);

    try {
      const res = await query(
        `INSERT INTO job_applications (user_id, job_id, status, apply_hash)
         VALUES ($1, $2, 'pending', $3)
         ON CONFLICT (job_id, user_id) DO NOTHING
         RETURNING id`,
        [userId, jobId, applyHash]
      );

      if (res.rowCount === 0) {
        logger.warn(`Duplicate application blocked: user=${userId} job=${externalJobId}`);
        return null;
      }

      return res.rows[0].id;
    } catch (err: any) {
      if (err.code === '23505') {
        logger.warn(`Application already exists for user=${userId} job=${jobId}`);
        return null;
      }
      throw err;
    }
  }

  /**
   * Update application status with optional data.
   */
  async updateStatus(
    applicationId: string,
    status: ApplicationStatus,
    data?: {
      resumeUsed?: string;
      coverLetterUsed?: string;
      answersUsed?: Record<string, string>;
      failureReason?: string;
      platformConfirmation?: string;
    }
  ): Promise<void> {
    const sets: string[] = ['status = $2', 'updated_at = NOW()'];
    const params: any[] = [applicationId, status];
    let idx = 3;

    if (status === 'applied') {
      sets.push('applied_at = NOW()');
    }
    if (status === 'failed') {
      sets.push('retry_count = retry_count + 1');
    }

    if (data?.resumeUsed !== undefined) {
      sets.push(`resume_used = $${idx}`); params.push(data.resumeUsed); idx++;
    }
    if (data?.coverLetterUsed !== undefined) {
      sets.push(`cover_letter_used = $${idx}`); params.push(data.coverLetterUsed); idx++;
    }
    if (data?.answersUsed !== undefined) {
      sets.push(`answers_used = $${idx}::jsonb`); params.push(JSON.stringify(data.answersUsed)); idx++;
    }
    if (data?.failureReason !== undefined) {
      sets.push(`failure_reason = $${idx}`); params.push(data.failureReason); idx++;
    }
    if (data?.platformConfirmation !== undefined) {
      sets.push(`platform_confirmation = $${idx}`); params.push(data.platformConfirmation); idx++;
    }

    await query(`UPDATE job_applications SET ${sets.join(', ')} WHERE id = $1`, params);
  }

  /**
   * Count applications made today by this user.
   */
  async countTodayApplications(userId: string): Promise<number> {
    const res = await query(
      `SELECT COUNT(*) AS cnt FROM job_applications
       WHERE user_id = $1 AND status IN ('applied', 'applying') AND applied_at >= CURRENT_DATE`,
      [userId]
    );
    return parseInt(res.rows[0].cnt);
  }

  /**
   * Get pending approvals for a user.
   */
  async getPendingApprovals(userId: string): Promise<ApplicationRecord[]> {
    const res = await query(
      `SELECT ja.*, j.title AS job_title, j.company_name, j.job_url, js.total_score
       FROM job_applications ja
       JOIN jobs j ON j.id = ja.job_id
       LEFT JOIN job_scores js ON js.job_id = ja.job_id AND js.user_id = ja.user_id
       WHERE ja.user_id = $1 AND ja.status = 'pending'
       ORDER BY js.total_score DESC NULLS LAST`,
      [userId]
    );
    return res.rows.map(this.mapRow);
  }

  /**
   * Get retriable failed applications.
   */
  async getRetriable(userId: string): Promise<ApplicationRecord[]> {
    const res = await query(
      `SELECT * FROM job_applications
       WHERE user_id = $1 AND status = 'failed' AND retry_count < max_retries
       ORDER BY updated_at ASC`,
      [userId]
    );
    return res.rows.map(this.mapRow);
  }

  /**
   * Get application stats for a user.
   */
  async getStats(userId: string): Promise<{
    total: number; applied: number; failed: number; pending: number; todayCount: number;
  }> {
    const res = await query(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'applied') AS applied,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status IN ('applied','applying') AND applied_at >= CURRENT_DATE) AS today_count
       FROM job_applications WHERE user_id = $1`,
      [userId]
    );
    const row = res.rows[0];
    return {
      total: parseInt(row.total),
      applied: parseInt(row.applied),
      failed: parseInt(row.failed),
      pending: parseInt(row.pending),
      todayCount: parseInt(row.today_count),
    };
  }

  /**
   * Check if user already applied to this job.
   */
  async hasApplied(userId: string, jobId: string): Promise<boolean> {
    const res = await query(
      `SELECT 1 FROM job_applications WHERE user_id = $1 AND job_id = $2 AND status = 'applied' LIMIT 1`,
      [userId, jobId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  private computeHash(userId: string, externalJobId: string, platform: string): string {
    return createHash('sha256').update(`${userId}:${externalJobId}:${platform}`).digest('hex');
  }

  private mapRow(row: any): ApplicationRecord {
    return {
      id: row.id, userId: row.user_id, jobId: row.job_id, status: row.status,
      resumeUsed: row.resume_used, coverLetterUsed: row.cover_letter_used,
      answersUsed: row.answers_used || {}, appliedAt: row.applied_at,
      failureReason: row.failure_reason, platformConfirmation: row.platform_confirmation,
      retryCount: row.retry_count, createdAt: row.created_at,
    };
  }
}
