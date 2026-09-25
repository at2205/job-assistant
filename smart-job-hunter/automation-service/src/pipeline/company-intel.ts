import { query } from '../db/postgres-client';
import logger from '../utils/logger';

// =============================================
// Company Intelligence — track + analyze companies
// =============================================

export interface CompanyIntel {
  id: string;
  userId: string;
  companyName: string;
  totalApplications: number;
  responsesReceived: number;
  interviewsGiven: number;
  offersReceived: number;
  rejections: number;
  avgResponseDays: number | null;
  avgHiringCycleDays: number | null;
  responseRate: number;
  notes: string | null;
  lastAppliedAt: string | null;
  lastResponseAt: string | null;
}

export class CompanyIntelService {
  /** Rebuild company stats from application data */
  async refreshAll(userId: string): Promise<number> {
    const res = await query(
      `SELECT j.company_name,
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE ja.status IN ('applied','approved')) AS responses,
              COUNT(*) FILTER (WHERE ja.last_stage IN ('HR_SCREENING','TECHNICAL_ROUND','ASSIGNMENT','FINAL_ROUND')) AS interviews,
              COUNT(*) FILTER (WHERE ja.last_stage = 'OFFER') AS offers,
              COUNT(*) FILTER (WHERE ja.status = 'failed' OR ja.last_stage = 'REJECTED') AS rejections,
              MAX(ja.created_at) AS last_applied,
              MAX(ja.response_received_at) AS last_response
       FROM job_applications ja
       JOIN jobs j ON j.id = ja.job_id
       WHERE ja.user_id = $1 AND j.company_name IS NOT NULL
       GROUP BY j.company_name`,
      [userId]
    );

    for (const row of res.rows) {
      const responseRate = row.total > 0
        ? Math.round((parseInt(row.responses) / parseInt(row.total)) * 100) : 0;

      await query(
        `INSERT INTO company_intel (user_id, company_name, total_applications, responses_received,
         interviews_given, offers_received, rejections, response_rate, last_applied_at, last_response_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id, company_name) DO UPDATE SET
           total_applications = EXCLUDED.total_applications,
           responses_received = EXCLUDED.responses_received,
           interviews_given = EXCLUDED.interviews_given,
           offers_received = EXCLUDED.offers_received,
           rejections = EXCLUDED.rejections,
           response_rate = EXCLUDED.response_rate,
           last_applied_at = EXCLUDED.last_applied_at,
           last_response_at = EXCLUDED.last_response_at,
           updated_at = NOW()`,
        [userId, row.company_name, parseInt(row.total), parseInt(row.responses),
         parseInt(row.interviews), parseInt(row.offers), parseInt(row.rejections),
         responseRate, row.last_applied, row.last_response]
      );
    }

    logger.info(`Company intel refreshed: ${res.rows.length} companies`);
    return res.rows.length;
  }

  async getAll(userId: string, sortBy: 'response_rate' | 'total_applications' = 'total_applications'): Promise<CompanyIntel[]> {
    const res = await query(
      `SELECT * FROM company_intel WHERE user_id = $1 ORDER BY ${sortBy} DESC`,
      [userId]
    );
    return res.rows.map((r: any) => this.mapRow(r));
  }

  async getByCompany(userId: string, companyName: string): Promise<CompanyIntel | null> {
    const res = await query(
      `SELECT * FROM company_intel WHERE user_id = $1 AND LOWER(company_name) = LOWER($2)`,
      [userId, companyName]
    );
    return res.rows.length ? this.mapRow(res.rows[0]) : null;
  }

  async getHighResponders(userId: string, limit = 10): Promise<CompanyIntel[]> {
    const res = await query(
      `SELECT * FROM company_intel WHERE user_id = $1 AND response_rate > 0
       ORDER BY response_rate DESC LIMIT $2`,
      [userId, limit]
    );
    return res.rows.map((r: any) => this.mapRow(r));
  }

  async getQuickRejectors(userId: string, limit = 10): Promise<CompanyIntel[]> {
    const res = await query(
      `SELECT * FROM company_intel WHERE user_id = $1 AND rejections > 0
       ORDER BY rejections DESC, total_applications ASC LIMIT $2`,
      [userId, limit]
    );
    return res.rows.map((r: any) => this.mapRow(r));
  }

  async updateNotes(userId: string, companyName: string, notes: string): Promise<void> {
    await query(
      `UPDATE company_intel SET notes = $3, updated_at = NOW()
       WHERE user_id = $1 AND LOWER(company_name) = LOWER($2)`,
      [userId, companyName, notes]
    );
  }

  private mapRow(r: any): CompanyIntel {
    return {
      id: r.id, userId: r.user_id, companyName: r.company_name,
      totalApplications: r.total_applications, responsesReceived: r.responses_received,
      interviewsGiven: r.interviews_given, offersReceived: r.offers_received,
      rejections: r.rejections,
      avgResponseDays: r.avg_response_days ? parseFloat(r.avg_response_days) : null,
      avgHiringCycleDays: r.avg_hiring_cycle_days ? parseFloat(r.avg_hiring_cycle_days) : null,
      responseRate: parseFloat(r.response_rate) || 0,
      notes: r.notes,
      lastAppliedAt: r.last_applied_at, lastResponseAt: r.last_response_at,
    };
  }
}
