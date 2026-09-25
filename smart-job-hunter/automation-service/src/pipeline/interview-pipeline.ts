import { query } from '../db/postgres-client';
import logger from '../utils/logger';

// =============================================
// Interview Pipeline — stage tracking + history
// =============================================

export const PIPELINE_STAGES = [
  'SAVED','APPLIED','VIEWED','HR_SCREENING','TECHNICAL_ROUND',
  'ASSIGNMENT','FINAL_ROUND','OFFER','REJECTED','GHOSTED',
] as const;

export type PipelineStage = typeof PIPELINE_STAGES[number];

export interface PipelineEntry {
  id: string;
  userId: string;
  jobId: string;
  applicationId: string | null;
  stage: PipelineStage;
  notes: string | null;
  feedback: string | null;
  enteredAt: string;
  updatedAt: string;
  // joined
  jobTitle?: string;
  companyName?: string;
  jobUrl?: string;
  totalScore?: number;
}

export interface PipelineHistoryEntry {
  id: string;
  fromStage: string | null;
  toStage: string;
  notes: string | null;
  changedAt: string;
}

export class InterviewPipeline {
  /** Upsert a job into the pipeline at a given stage */
  async setStage(
    userId: string, jobId: string, stage: PipelineStage,
    opts: { applicationId?: string; notes?: string; feedback?: string } = {}
  ): Promise<PipelineEntry> {
    // Get current stage for history
    const current = await this.getEntry(userId, jobId);
    const fromStage = current?.stage || null;

    const res = await query(
      `INSERT INTO interview_pipeline (user_id, job_id, application_id, stage, notes, feedback)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, job_id) DO UPDATE SET
         stage = EXCLUDED.stage, notes = COALESCE(EXCLUDED.notes, interview_pipeline.notes),
         feedback = COALESCE(EXCLUDED.feedback, interview_pipeline.feedback),
         application_id = COALESCE(EXCLUDED.application_id, interview_pipeline.application_id),
         updated_at = NOW()
       RETURNING *`,
      [userId, jobId, opts.applicationId || null, stage, opts.notes || null, opts.feedback || null]
    );

    const entry = res.rows[0];

    // Record history
    if (fromStage !== stage) {
      await query(
        `INSERT INTO pipeline_history (pipeline_id, from_stage, to_stage, notes)
         VALUES ($1, $2, $3, $4)`,
        [entry.id, fromStage, stage, opts.notes || null]
      );
    }

    // Update application last_stage
    if (entry.application_id) {
      await query(
        `UPDATE job_applications SET last_stage = $1 WHERE id = $2`,
        [stage, entry.application_id]
      );
    }

    logger.info(`Pipeline: ${jobId} → ${stage}`);
    return this.mapRow(entry);
  }

  async getEntry(userId: string, jobId: string): Promise<PipelineEntry | null> {
    const res = await query(
      `SELECT p.*, j.title AS job_title, j.company_name, j.job_url,
              js.total_score
       FROM interview_pipeline p
       JOIN jobs j ON j.id = p.job_id
       LEFT JOIN job_scores js ON js.job_id = p.job_id AND js.user_id = p.user_id
       WHERE p.user_id = $1 AND p.job_id = $2`,
      [userId, jobId]
    );
    return res.rows.length ? this.mapRow(res.rows[0]) : null;
  }

  async getAll(userId: string, stage?: PipelineStage): Promise<PipelineEntry[]> {
    let sql = `SELECT p.*, j.title AS job_title, j.company_name, j.job_url, js.total_score
               FROM interview_pipeline p
               JOIN jobs j ON j.id = p.job_id
               LEFT JOIN job_scores js ON js.job_id = p.job_id AND js.user_id = p.user_id
               WHERE p.user_id = $1`;
    const params: any[] = [userId];
    if (stage) { sql += ` AND p.stage = $2`; params.push(stage); }
    sql += ` ORDER BY p.updated_at DESC`;
    const res = await query(sql, params);
    return res.rows.map((r: any) => this.mapRow(r));
  }

  async getHistory(pipelineId: string): Promise<PipelineHistoryEntry[]> {
    const res = await query(
      `SELECT * FROM pipeline_history WHERE pipeline_id = $1 ORDER BY changed_at ASC`,
      [pipelineId]
    );
    return res.rows.map((r: any) => ({
      id: r.id, fromStage: r.from_stage, toStage: r.to_stage,
      notes: r.notes, changedAt: r.changed_at,
    }));
  }

  async getAnalytics(userId: string) {
    const res = await query(
      `SELECT stage, COUNT(*) AS cnt FROM interview_pipeline WHERE user_id = $1 GROUP BY stage`,
      [userId]
    );
    const counts: Record<string, number> = {};
    for (const s of PIPELINE_STAGES) counts[s] = 0;
    for (const r of res.rows) counts[r.stage] = parseInt(r.cnt);

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const applied = total - counts.SAVED;
    const interviewed = counts.HR_SCREENING + counts.TECHNICAL_ROUND + counts.ASSIGNMENT + counts.FINAL_ROUND;
    const offers = counts.OFFER;

    return {
      stageCounts: counts,
      total,
      conversionRates: {
        applicationToView: applied > 0 ? Math.round(((counts.VIEWED + interviewed + offers + counts.REJECTED) / applied) * 100) : 0,
        viewToInterview: (counts.VIEWED + interviewed) > 0 ? Math.round((interviewed / (counts.VIEWED + interviewed)) * 100) : 0,
        interviewToOffer: interviewed > 0 ? Math.round((offers / interviewed) * 100) : 0,
        overallConversion: applied > 0 ? Math.round((offers / applied) * 100) : 0,
      },
    };
  }

  /** Auto-detect ghosted: applied > 14 days ago, no stage change */
  async markGhosted(userId: string, daysThreshold = 14): Promise<number> {
    const res = await query(
      `UPDATE interview_pipeline SET stage = 'GHOSTED', updated_at = NOW()
       WHERE user_id = $1 AND stage = 'APPLIED'
         AND updated_at < NOW() - INTERVAL '1 day' * $2
       RETURNING id`,
      [userId, daysThreshold]
    );
    if (res.rowCount && res.rowCount > 0) {
      // Record history for each
      for (const r of res.rows) {
        await query(
          `INSERT INTO pipeline_history (pipeline_id, from_stage, to_stage, notes)
           VALUES ($1, 'APPLIED', 'GHOSTED', 'Auto-detected: no response')`,
          [r.id]
        );
      }
      logger.info(`Marked ${res.rowCount} applications as GHOSTED`);
    }
    return res.rowCount || 0;
  }

  private mapRow(r: any): PipelineEntry {
    return {
      id: r.id, userId: r.user_id, jobId: r.job_id,
      applicationId: r.application_id, stage: r.stage,
      notes: r.notes, feedback: r.feedback,
      enteredAt: r.entered_at, updatedAt: r.updated_at,
      jobTitle: r.job_title, companyName: r.company_name,
      jobUrl: r.job_url, totalScore: r.total_score ? parseFloat(r.total_score) : undefined,
    };
  }
}
