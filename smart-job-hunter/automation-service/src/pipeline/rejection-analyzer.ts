import { query } from '../db/postgres-client';
import { createAIClient } from '../ai/ai-client';
import logger from '../utils/logger';

// =============================================
// Rejection Analysis Engine
// =============================================

export interface RejectionAnalysisResult {
  id: string;
  userId: string;
  jobId: string;
  likelyReasons: string[];
  missingSkills: string[];
  resumeSuggestions: string[];
  atsGapAnalysis: Record<string, any>;
  analyzedAt: string;
}

export class RejectionAnalyzer {
  async analyze(userId: string, jobId: string): Promise<RejectionAnalysisResult> {
    // Gather data
    const [jobRes, userRes, scoreRes, atsRes] = await Promise.all([
      query('SELECT * FROM jobs WHERE id = $1', [jobId]),
      query('SELECT skills, experience_years FROM users WHERE id = $1', [userId]),
      query('SELECT * FROM job_scores WHERE user_id = $1 AND job_id = $2', [userId, jobId]),
      query('SELECT * FROM ats_analysis WHERE user_id = $1 AND job_id = $2', [userId, jobId]),
    ]);

    const job = jobRes.rows[0];
    const user = userRes.rows[0];
    const score = scoreRes.rows[0];
    const ats = atsRes.rows[0];

    const likelyReasons: string[] = [];
    const missingSkills: string[] = [];
    const resumeSuggestions: string[] = [];

    // Analyze based on scores
    if (score) {
      const total = parseFloat(score.total_score);
      if (total < 50) likelyReasons.push(`Low match score (${total}/100) — poor fit for requirements`);
      if (parseFloat(score.skill_score) < 50) likelyReasons.push('Significant skill gaps');
      if (parseFloat(score.experience_score) < 50) likelyReasons.push('Experience level mismatch');
      if (parseFloat(score.location_score) < 50) likelyReasons.push('Location mismatch');
    }

    // ATS analysis
    if (ats) {
      const atsScore = parseFloat(ats.ats_score);
      if (atsScore < 40) {
        likelyReasons.push(`Low ATS score (${atsScore}/100) — resume likely filtered by ATS`);
        resumeSuggestions.push('Add more job-specific keywords to your resume');
      }
      if (ats.missing_keywords?.length > 0) {
        missingSkills.push(...ats.missing_keywords);
        resumeSuggestions.push(`Add these keywords: ${ats.missing_keywords.slice(0, 5).join(', ')}`);
      }
      if (ats.priority === 'SKIP') {
        likelyReasons.push(`Flagged as SKIP: ${ats.skip_reason}`);
      }
    }

    // Job-specific analysis
    if (job && user) {
      const jobSkills = (job.skills || []).map((s: string) => s.toLowerCase());
      const userSkills = new Set((user.skills || []).map((s: string) => s.toLowerCase()));
      const gaps = jobSkills.filter((s: string) => !userSkills.has(s));
      if (gaps.length > 0) missingSkills.push(...gaps);

      if (job.experience_min && user.experience_years < job.experience_min) {
        likelyReasons.push(`Under-experienced: ${user.experience_years}yrs vs ${job.experience_min}+ required`);
      }
    }

    if (likelyReasons.length === 0) {
      likelyReasons.push('No clear technical reason — could be: high competition, internal candidate, or posting closed');
    }

    // General suggestions
    if (resumeSuggestions.length === 0) {
      resumeSuggestions.push('Tailor your resume more specifically to each role');
      resumeSuggestions.push('Add quantifiable metrics to your experience bullets');
    }

    const atsGapAnalysis = ats ? {
      atsScore: parseFloat(ats.ats_score),
      keywordMatchPct: parseFloat(ats.keyword_match_pct),
      missingKeywordCount: (ats.missing_keywords || []).length,
      priority: ats.priority,
    } : {};

    // Deduplicate
    const uniqueSkills = [...new Set(missingSkills)];

    const res = await query(
      `INSERT INTO rejection_analysis (user_id, job_id, likely_reasons, missing_skills, resume_suggestions, ats_gap_analysis)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb)
       ON CONFLICT (user_id, job_id) DO UPDATE SET
         likely_reasons = EXCLUDED.likely_reasons, missing_skills = EXCLUDED.missing_skills,
         resume_suggestions = EXCLUDED.resume_suggestions, ats_gap_analysis = EXCLUDED.ats_gap_analysis,
         analyzed_at = NOW()
       RETURNING *`,
      [userId, jobId, JSON.stringify(likelyReasons), JSON.stringify(uniqueSkills),
       JSON.stringify(resumeSuggestions), JSON.stringify(atsGapAnalysis)]
    );

    logger.info(`Rejection analyzed: ${jobId}`);
    return this.mapRow(res.rows[0]);
  }

  /** Batch analyze all rejected/ghosted applications */
  async batchAnalyze(userId: string): Promise<{ analyzed: number }> {
    const res = await query(
      `SELECT DISTINCT p.job_id FROM interview_pipeline p
       WHERE p.user_id = $1 AND p.stage IN ('REJECTED','GHOSTED')
         AND NOT EXISTS (SELECT 1 FROM rejection_analysis ra WHERE ra.user_id = $1 AND ra.job_id = p.job_id)`,
      [userId]
    );

    let count = 0;
    for (const row of res.rows) {
      try {
        await this.analyze(userId, row.job_id);
        count++;
      } catch (err: any) {
        logger.warn(`Rejection analysis failed for ${row.job_id}: ${err.message}`);
      }
    }

    return { analyzed: count };
  }

  async getForJob(userId: string, jobId: string): Promise<RejectionAnalysisResult | null> {
    const res = await query(
      'SELECT * FROM rejection_analysis WHERE user_id = $1 AND job_id = $2',
      [userId, jobId]
    );
    return res.rows.length ? this.mapRow(res.rows[0]) : null;
  }

  async getAll(userId: string): Promise<RejectionAnalysisResult[]> {
    const res = await query(
      'SELECT * FROM rejection_analysis WHERE user_id = $1 ORDER BY analyzed_at DESC',
      [userId]
    );
    return res.rows.map((r: any) => this.mapRow(r));
  }

  /** Aggregate common rejection patterns */
  async getPatterns(userId: string): Promise<{ commonReasons: Record<string, number>; topMissingSkills: Record<string, number> }> {
    const all = await this.getAll(userId);
    const reasons: Record<string, number> = {};
    const skills: Record<string, number> = {};

    for (const a of all) {
      for (const r of a.likelyReasons) { reasons[r] = (reasons[r] || 0) + 1; }
      for (const s of a.missingSkills) { skills[s] = (skills[s] || 0) + 1; }
    }

    // Sort by frequency
    const sortedReasons = Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 10));
    const sortedSkills = Object.fromEntries(Object.entries(skills).sort((a, b) => b[1] - a[1]).slice(0, 15));

    return { commonReasons: sortedReasons, topMissingSkills: sortedSkills };
  }

  private mapRow(r: any): RejectionAnalysisResult {
    return {
      id: r.id, userId: r.user_id, jobId: r.job_id,
      likelyReasons: r.likely_reasons || [], missingSkills: r.missing_skills || [],
      resumeSuggestions: r.resume_suggestions || [], atsGapAnalysis: r.ats_gap_analysis || {},
      analyzedAt: r.analyzed_at,
    };
  }
}
