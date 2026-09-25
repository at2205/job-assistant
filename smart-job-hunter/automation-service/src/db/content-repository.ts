import { query } from './postgres-client';
import logger from '../utils/logger';

export type ContentType = 'resume' | 'cover_letter' | 'answers';

export interface GeneratedContentRow {
  id: string;
  userId: string;
  jobId: string;
  contentType: ContentType;
  content: string;
  providerUsed: string;
  modelUsed: string;
  generationTimeMs: number;
  qualityScore: number | null;
  createdAt: string;
}

export class ContentRepository {

  /**
   * Check if content already exists for this user+job+type.
   * Returns cached content or null.
   */
  async getCached(userId: string, jobId: string, contentType: ContentType): Promise<GeneratedContentRow | null> {
    const res = await query(
      `SELECT * FROM generated_content
       WHERE user_id = $1 AND job_id = $2 AND content_type = $3`,
      [userId, jobId, contentType]
    );
    if (res.rowCount === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  /**
   * Save generated content. Uses upsert to replace stale content on regeneration.
   */
  async save(params: {
    userId: string;
    jobId: string;
    contentType: ContentType;
    content: string;
    promptUsed: string;
    provider: string;
    model: string;
    generationTimeMs: number;
    qualityScore?: number;
  }): Promise<string> {
    const res = await query(
      `INSERT INTO generated_content
        (user_id, job_id, content_type, content, prompt_used, provider_used, model_used, generation_time_ms, quality_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, job_id, content_type) DO UPDATE SET
        content = EXCLUDED.content,
        prompt_used = EXCLUDED.prompt_used,
        provider_used = EXCLUDED.provider_used,
        model_used = EXCLUDED.model_used,
        generation_time_ms = EXCLUDED.generation_time_ms,
        quality_score = EXCLUDED.quality_score,
        created_at = NOW()
       RETURNING id`,
      [
        params.userId, params.jobId, params.contentType,
        params.content, params.promptUsed,
        params.provider, params.model,
        params.generationTimeMs, params.qualityScore ?? null,
      ]
    );
    return res.rows[0].id;
  }

  /**
   * Get all generated content for a user+job.
   */
  async getForJob(userId: string, jobId: string): Promise<GeneratedContentRow[]> {
    const res = await query(
      `SELECT * FROM generated_content WHERE user_id = $1 AND job_id = $2 ORDER BY content_type`,
      [userId, jobId]
    );
    return res.rows.map(this.mapRow);
  }

  private mapRow(row: any): GeneratedContentRow {
    return {
      id: row.id,
      userId: row.user_id,
      jobId: row.job_id,
      contentType: row.content_type,
      content: row.content,
      providerUsed: row.provider_used,
      modelUsed: row.model_used,
      generationTimeMs: row.generation_time_ms,
      qualityScore: row.quality_score ? parseFloat(row.quality_score) : null,
      createdAt: row.created_at,
    };
  }
}
