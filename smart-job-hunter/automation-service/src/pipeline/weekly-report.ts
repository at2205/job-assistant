import { query } from '../db/postgres-client';
import logger from '../utils/logger';

// =============================================
// Weekly Career Report Generator
// =============================================

export interface WeeklyReport {
  id: string;
  userId: string;
  weekStart: string;
  jobsScraped: number;
  jobsScored: number;
  applicationsSent: number;
  responsesReceived: number;
  interviewsScheduled: number;
  rejectionCount: number;
  offerCount: number;
  avgAtsScore: number | null;
  avgResponseDays: number | null;
  topRequestedSkills: string[];
  missingSkillsTrend: string[];
  topCompanies: any[];
  pipelineSummary: Record<string, number>;
  careerScore: number;
}

export class WeeklyReportGenerator {
  async generate(userId: string): Promise<WeeklyReport> {
    const weekStart = this.getWeekStart();

    // Gather metrics
    const [apps, pipeline, ats, scores] = await Promise.all([
      this.getApplicationMetrics(userId, weekStart),
      this.getPipelineMetrics(userId),
      this.getATSMetrics(userId, weekStart),
      this.getScoreMetrics(userId, weekStart),
    ]);

    const careerScore = this.calculateCareerScore(apps, pipeline, ats);

    const report: Omit<WeeklyReport, 'id'> = {
      userId,
      weekStart: weekStart.toISOString(),
      jobsScraped: scores.scraped,
      jobsScored: scores.scored,
      applicationsSent: apps.sent,
      responsesReceived: apps.responses,
      interviewsScheduled: pipeline.interviews,
      rejectionCount: pipeline.rejections,
      offerCount: pipeline.offers,
      avgAtsScore: ats.avgScore,
      avgResponseDays: apps.avgResponseDays,
      topRequestedSkills: ats.topRequested,
      missingSkillsTrend: ats.topMissing,
      topCompanies: apps.topCompanies,
      pipelineSummary: pipeline.summary,
      careerScore,
    };

    const res = await query(
      `INSERT INTO weekly_analytics
       (user_id, week_start, jobs_scraped, jobs_scored, applications_sent,
        responses_received_count, interviews_scheduled, rejection_count, offer_count,
        avg_ats_score, avg_response_days, top_requested_skills, missing_skills_trend,
        top_companies, pipeline_summary, career_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [userId, weekStart.toISOString(), report.jobsScraped, report.jobsScored,
       report.applicationsSent, report.responsesReceived, report.interviewsScheduled,
       report.rejectionCount, report.offerCount, report.avgAtsScore,
       report.avgResponseDays, JSON.stringify(report.topRequestedSkills),
       JSON.stringify(report.missingSkillsTrend), JSON.stringify(report.topCompanies),
       JSON.stringify(report.pipelineSummary), report.careerScore]
    );

    logger.info(`Weekly report generated. Career score: ${careerScore}`);
    return { id: res.rows[0]?.id || 'cached', ...report };
  }

  async getHistory(userId: string, weeks = 8): Promise<WeeklyReport[]> {
    const res = await query(
      `SELECT * FROM weekly_analytics WHERE user_id = $1
       ORDER BY week_start DESC LIMIT $2`,
      [userId, weeks]
    );
    return res.rows.map((r: any) => this.mapRow(r));
  }

  private async getApplicationMetrics(userId: string, since: Date) {
    const res = await query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= $2) AS sent,
         COUNT(*) FILTER (WHERE response_received_at >= $2) AS responses,
         AVG(EXTRACT(EPOCH FROM (response_received_at - created_at)) / 86400)
           FILTER (WHERE response_received_at IS NOT NULL) AS avg_days
       FROM job_applications WHERE user_id = $1`,
      [userId, since.toISOString()]
    );
    const row = res.rows[0];

    // Top companies
    const compRes = await query(
      `SELECT j.company_name, COUNT(*) AS cnt
       FROM job_applications ja JOIN jobs j ON j.id = ja.job_id
       WHERE ja.user_id = $1 AND ja.created_at >= $2 AND j.company_name IS NOT NULL
       GROUP BY j.company_name ORDER BY cnt DESC LIMIT 5`,
      [userId, since.toISOString()]
    );

    return {
      sent: parseInt(row.sent) || 0,
      responses: parseInt(row.responses) || 0,
      avgResponseDays: row.avg_days ? Math.round(parseFloat(row.avg_days) * 10) / 10 : null,
      topCompanies: compRes.rows.map((r: any) => ({ company: r.company_name, count: parseInt(r.cnt) })),
    };
  }

  private async getPipelineMetrics(userId: string) {
    const res = await query(
      `SELECT stage, COUNT(*) AS cnt FROM interview_pipeline WHERE user_id = $1 GROUP BY stage`,
      [userId]
    );
    const summary: Record<string, number> = {};
    let interviews = 0, rejections = 0, offers = 0;
    for (const r of res.rows) {
      summary[r.stage] = parseInt(r.cnt);
      if (['HR_SCREENING', 'TECHNICAL_ROUND', 'ASSIGNMENT', 'FINAL_ROUND'].includes(r.stage)) {
        interviews += parseInt(r.cnt);
      }
      if (r.stage === 'REJECTED') rejections = parseInt(r.cnt);
      if (r.stage === 'OFFER') offers = parseInt(r.cnt);
    }
    return { summary, interviews, rejections, offers };
  }

  private async getATSMetrics(userId: string, since: Date) {
    const res = await query(
      `SELECT ROUND(AVG(ats_score), 1) AS avg_score FROM ats_analysis
       WHERE user_id = $1 AND priority != 'SKIP'`,
      [userId]
    );

    const missingRes = await query(
      `SELECT kw, COUNT(*) AS ct FROM ats_analysis, jsonb_array_elements_text(missing_keywords) AS kw
       WHERE user_id = $1 AND priority != 'SKIP' GROUP BY kw ORDER BY ct DESC LIMIT 10`,
      [userId]
    );

    const requestedRes = await query(
      `SELECT kw, COUNT(*) AS ct FROM ats_analysis, jsonb_array_elements_text(matched_keywords) AS kw
       WHERE user_id = $1 GROUP BY kw ORDER BY ct DESC LIMIT 10`,
      [userId]
    );

    return {
      avgScore: res.rows[0]?.avg_score ? parseFloat(res.rows[0].avg_score) : null,
      topMissing: missingRes.rows.map((r: any) => r.kw),
      topRequested: requestedRes.rows.map((r: any) => r.kw),
    };
  }

  private async getScoreMetrics(userId: string, since: Date) {
    const res = await query(
      `SELECT
         (SELECT COUNT(*) FROM jobs WHERE scraped_at >= $2) AS scraped,
         (SELECT COUNT(*) FROM job_scores WHERE user_id = $1 AND scored_at >= $2) AS scored`,
      [userId, since.toISOString()]
    );
    return { scraped: parseInt(res.rows[0].scraped) || 0, scored: parseInt(res.rows[0].scored) || 0 };
  }

  private calculateCareerScore(apps: any, pipeline: any, ats: any): number {
    let score = 30; // base
    // Activity bonus
    if (apps.sent > 0) score += Math.min(20, apps.sent * 4);
    // Response rate bonus
    if (apps.sent > 0 && apps.responses > 0) score += Math.min(20, (apps.responses / apps.sent) * 40);
    // Interview bonus
    score += Math.min(15, pipeline.interviews * 5);
    // Offer bonus
    score += Math.min(10, pipeline.offers * 10);
    // ATS quality bonus
    if (ats.avgScore && ats.avgScore > 50) score += Math.min(5, (ats.avgScore - 50) / 10);
    return Math.min(100, Math.round(score));
  }

  private getWeekStart(): Date {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  private mapRow(r: any): WeeklyReport {
    return {
      id: r.id, userId: r.user_id, weekStart: r.week_start,
      jobsScraped: r.jobs_scraped, jobsScored: r.jobs_scored,
      applicationsSent: r.applications_sent,
      responsesReceived: r.responses_received_count || r.responses_received || 0,
      interviewsScheduled: r.interviews_scheduled || 0,
      rejectionCount: r.rejection_count || 0, offerCount: r.offer_count || 0,
      avgAtsScore: r.avg_ats_score ? parseFloat(r.avg_ats_score) : null,
      avgResponseDays: r.avg_response_days ? parseFloat(r.avg_response_days) : null,
      topRequestedSkills: r.top_requested_skills || [],
      missingSkillsTrend: r.missing_skills_trend || [],
      topCompanies: r.top_companies || [],
      pipelineSummary: r.pipeline_summary || {},
      careerScore: r.career_score || 0,
    };
  }
}
