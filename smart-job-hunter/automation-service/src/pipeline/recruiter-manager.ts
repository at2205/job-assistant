import { query } from '../db/postgres-client';
import logger from '../utils/logger';

// =============================================
// Recruiter Management — profiles + interactions
// =============================================

export interface Recruiter {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  linkedinUrl: string | null;
  notes: string | null;
  responseRate: number;
  totalInteractions: number;
  lastInteractionAt: string | null;
  createdAt: string;
}

export type InteractionType = 'OUTREACH' | 'RESPONSE' | 'FOLLOW_UP' | 'INTERVIEW_SCHEDULE' | 'OFFER' | 'REJECTION' | 'NOTE';
export type Direction = 'INBOUND' | 'OUTBOUND';
export type Channel = 'EMAIL' | 'LINKEDIN' | 'PHONE' | 'NAUKRI' | 'OTHER';

export interface RecruiterInteraction {
  id: string;
  recruiterId: string;
  userId: string;
  jobId: string | null;
  applicationId: string | null;
  interactionType: InteractionType;
  direction: Direction;
  content: string | null;
  channel: Channel | null;
  interactionAt: string;
}

export class RecruiterManager {
  async create(userId: string, data: {
    name: string; email?: string; phone?: string;
    company?: string; linkedinUrl?: string; notes?: string;
  }): Promise<Recruiter> {
    const res = await query(
      `INSERT INTO recruiters (user_id, name, email, phone, company, linkedin_url, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, data.name, data.email || null, data.phone || null,
       data.company || null, data.linkedinUrl || null, data.notes || null]
    );
    logger.info(`Recruiter created: ${data.name} @ ${data.company}`);
    return this.mapRecruiter(res.rows[0]);
  }

  async update(id: string, data: Partial<Omit<Recruiter, 'id' | 'userId' | 'createdAt'>>): Promise<Recruiter> {
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(data)) {
      if (val === undefined) continue;
      const col = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${col} = $${idx}`);
      params.push(val);
      idx++;
    }
    fields.push('updated_at = NOW()');
    params.push(id);

    const res = await query(
      `UPDATE recruiters SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    return this.mapRecruiter(res.rows[0]);
  }

  async getAll(userId: string): Promise<Recruiter[]> {
    const res = await query(
      `SELECT * FROM recruiters WHERE user_id = $1 ORDER BY last_interaction_at DESC NULLS LAST, created_at DESC`,
      [userId]
    );
    return res.rows.map((r: any) => this.mapRecruiter(r));
  }

  async getById(id: string): Promise<Recruiter | null> {
    const res = await query('SELECT * FROM recruiters WHERE id = $1', [id]);
    return res.rows.length ? this.mapRecruiter(res.rows[0]) : null;
  }

  async findByCompany(userId: string, company: string): Promise<Recruiter[]> {
    const res = await query(
      `SELECT * FROM recruiters WHERE user_id = $1 AND LOWER(company) = LOWER($2)`,
      [userId, company]
    );
    return res.rows.map((r: any) => this.mapRecruiter(r));
  }

  async addInteraction(data: {
    recruiterId: string; userId: string; jobId?: string; applicationId?: string;
    interactionType: InteractionType; direction: Direction;
    content?: string; channel?: Channel;
  }): Promise<RecruiterInteraction> {
    const res = await query(
      `INSERT INTO recruiter_interactions
       (recruiter_id, user_id, job_id, application_id, interaction_type, direction, content, channel)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [data.recruiterId, data.userId, data.jobId || null, data.applicationId || null,
       data.interactionType, data.direction, data.content || null, data.channel || null]
    );

    // Update recruiter stats
    const statsRes = await query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE direction = 'INBOUND') AS inbound
       FROM recruiter_interactions WHERE recruiter_id = $1`,
      [data.recruiterId]
    );
    const total = parseInt(statsRes.rows[0].total);
    const inbound = parseInt(statsRes.rows[0].inbound);
    const responseRate = total > 0 ? Math.round((inbound / total) * 100) : 0;

    await query(
      `UPDATE recruiters SET total_interactions = $1, response_rate = $2,
       last_interaction_at = NOW(), updated_at = NOW() WHERE id = $3`,
      [total, responseRate, data.recruiterId]
    );

    return this.mapInteraction(res.rows[0]);
  }

  async getInteractions(recruiterId: string, limit = 20): Promise<RecruiterInteraction[]> {
    const res = await query(
      `SELECT * FROM recruiter_interactions WHERE recruiter_id = $1
       ORDER BY interaction_at DESC LIMIT $2`,
      [recruiterId, limit]
    );
    return res.rows.map((r: any) => this.mapInteraction(r));
  }

  async getTopRecruiters(userId: string, limit = 10): Promise<Recruiter[]> {
    const res = await query(
      `SELECT * FROM recruiters WHERE user_id = $1
       ORDER BY response_rate DESC, total_interactions DESC LIMIT $2`,
      [userId, limit]
    );
    return res.rows.map((r: any) => this.mapRecruiter(r));
  }

  private mapRecruiter(r: any): Recruiter {
    return {
      id: r.id, userId: r.user_id, name: r.name,
      email: r.email, phone: r.phone, company: r.company,
      linkedinUrl: r.linkedin_url, notes: r.notes,
      responseRate: parseFloat(r.response_rate) || 0,
      totalInteractions: r.total_interactions || 0,
      lastInteractionAt: r.last_interaction_at, createdAt: r.created_at,
    };
  }

  private mapInteraction(r: any): RecruiterInteraction {
    return {
      id: r.id, recruiterId: r.recruiter_id, userId: r.user_id,
      jobId: r.job_id, applicationId: r.application_id,
      interactionType: r.interaction_type, direction: r.direction,
      content: r.content, channel: r.channel,
      interactionAt: r.interaction_at,
    };
  }
}
