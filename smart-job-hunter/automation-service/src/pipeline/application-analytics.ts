import { query } from '../db/postgres-client';

// =============================================
// Application Analytics Service
// =============================================

export interface AnalyticsSummary {
  responseRate: number;
  interviewConversion: number;
  offerConversion: number;
  rejectionRate: number;
  avgAtsScore: number;
  bestResumeVariant: string | null;
  bestPlatform: string | null;
  totalApplications: number;
  totalResponses: number;
  totalInterviews: number;
  totalOffers: number;
  totalRejections: number;
  avgDaysToResponse: number | null;
  platformBreakdown: Record<string, { applied: number; responded: number; rate: number }>;
  variantBreakdown: Record<string, { used: number; responded: number; rate: number }>;
  weeklyTrend: Array<{ week: string; applied: number; responses: number; interviews: number }>;
}

export class ApplicationAnalytics {
  async getSummary(userId: string): Promise<AnalyticsSummary> {
    const [totals, platforms, variants, weekly] = await Promise.all([
      this.getTotals(userId),
      this.getPlatformBreakdown(userId),
      this.getVariantBreakdown(userId),
      this.getWeeklyTrend(userId),
    ]);

    return { ...totals, platformBreakdown: platforms, variantBreakdown: variants, weeklyTrend: weekly };
  }

  private async getTotals(userId: string) {
    const res = await query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE response_received_at IS NOT NULL) AS responses,
         COUNT(*) FILTER (WHERE last_stage IN ('HR_SCREENING','TECHNICAL_ROUND','ASSIGNMENT','FINAL_ROUND','OFFER')) AS interviews,
         COUNT(*) FILTER (WHERE last_stage = 'OFFER') AS offers,
         COUNT(*) FILTER (WHERE last_stage = 'REJECTED' OR status = 'failed') AS rejections,
         AVG(EXTRACT(EPOCH FROM (response_received_at - created_at)) / 86400)
           FILTER (WHERE response_received_at IS NOT NULL) AS avg_days
       FROM job_applications WHERE user_id = $1`,
      [userId]
    );

    const r = res.rows[0];
    const total = parseInt(r.total) || 0;
    const responses = parseInt(r.responses) || 0;
    const interviews = parseInt(r.interviews) || 0;
    const offers = parseInt(r.offers) || 0;
    const rejections = parseInt(r.rejections) || 0;

    // Best ATS
    const atsRes = await query(
      `SELECT ROUND(AVG(a.ats_score), 1) AS avg_ats FROM ats_analysis a
       WHERE a.user_id = $1 AND a.priority != 'SKIP'`,
      [userId]
    );

    return {
      totalApplications: total,
      totalResponses: responses,
      totalInterviews: interviews,
      totalOffers: offers,
      totalRejections: rejections,
      responseRate: total > 0 ? Math.round((responses / total) * 100) : 0,
      interviewConversion: total > 0 ? Math.round((interviews / total) * 100) : 0,
      offerConversion: interviews > 0 ? Math.round((offers / interviews) * 100) : 0,
      rejectionRate: total > 0 ? Math.round((rejections / total) * 100) : 0,
      avgAtsScore: parseFloat(atsRes.rows[0]?.avg_ats) || 0,
      avgDaysToResponse: r.avg_days ? Math.round(parseFloat(r.avg_days) * 10) / 10 : null,
      bestResumeVariant: null,
      bestPlatform: null,
    };
  }

  private async getPlatformBreakdown(userId: string) {
    const res = await query(
      `SELECT j.source_platform,
              COUNT(*) AS applied,
              COUNT(*) FILTER (WHERE ja.response_received_at IS NOT NULL) AS responded
       FROM job_applications ja
       JOIN jobs j ON j.id = ja.job_id
       WHERE ja.user_id = $1
       GROUP BY j.source_platform`,
      [userId]
    );

    const breakdown: Record<string, { applied: number; responded: number; rate: number }> = {};
    let bestPlatform = '';
    let bestRate = 0;

    for (const r of res.rows) {
      const applied = parseInt(r.applied);
      const responded = parseInt(r.responded);
      const rate = applied > 0 ? Math.round((responded / applied) * 100) : 0;
      breakdown[r.source_platform || 'unknown'] = { applied, responded, rate };
      if (rate > bestRate) { bestRate = rate; bestPlatform = r.source_platform; }
    }

    return breakdown;
  }

  private async getVariantBreakdown(userId: string) {
    const res = await query(
      `SELECT gc.variant,
              COUNT(DISTINCT ja.id) AS used,
              COUNT(DISTINCT ja.id) FILTER (WHERE ja.response_received_at IS NOT NULL) AS responded
       FROM generated_content gc
       JOIN job_applications ja ON ja.job_id = gc.job_id AND ja.user_id = gc.user_id
       WHERE gc.user_id = $1 AND gc.content_type = 'resume' AND gc.variant IS NOT NULL
       GROUP BY gc.variant`,
      [userId]
    );

    const breakdown: Record<string, { used: number; responded: number; rate: number }> = {};
    for (const r of res.rows) {
      const used = parseInt(r.used);
      const responded = parseInt(r.responded);
      breakdown[r.variant] = { used, responded, rate: used > 0 ? Math.round((responded / used) * 100) : 0 };
    }

    return breakdown;
  }

  private async getWeeklyTrend(userId: string) {
    const res = await query(
      `SELECT DATE_TRUNC('week', ja.created_at)::date AS week,
              COUNT(*) AS applied,
              COUNT(*) FILTER (WHERE ja.response_received_at IS NOT NULL) AS responses,
              COUNT(*) FILTER (WHERE ja.last_stage IN ('HR_SCREENING','TECHNICAL_ROUND','ASSIGNMENT','FINAL_ROUND','OFFER')) AS interviews
       FROM job_applications ja
       WHERE ja.user_id = $1 AND ja.created_at >= NOW() - INTERVAL '8 weeks'
       GROUP BY week ORDER BY week DESC`,
      [userId]
    );

    return res.rows.map((r: any) => ({
      week: r.week, applied: parseInt(r.applied),
      responses: parseInt(r.responses), interviews: parseInt(r.interviews),
    }));
  }
}
