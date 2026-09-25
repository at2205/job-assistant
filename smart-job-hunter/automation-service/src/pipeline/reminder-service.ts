import { query } from '../db/postgres-client';
import logger from '../utils/logger';

// =============================================
// Reminder / Calendar System
// =============================================

export type ReminderType = 'INTERVIEW' | 'FOLLOW_UP' | 'ASSIGNMENT_DUE' | 'OFFER_DEADLINE' | 'CUSTOM';

export interface Reminder {
  id: string;
  userId: string;
  jobId: string | null;
  recruiterId: string | null;
  reminderType: ReminderType;
  title: string;
  description: string | null;
  remindAt: string;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  // joined
  jobTitle?: string;
  companyName?: string;
}

export class ReminderService {
  async create(data: {
    userId: string; jobId?: string; recruiterId?: string;
    reminderType: ReminderType; title: string; description?: string;
    remindAt: string;
  }): Promise<Reminder> {
    const res = await query(
      `INSERT INTO reminders (user_id, job_id, recruiter_id, reminder_type, title, description, remind_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.userId, data.jobId || null, data.recruiterId || null,
       data.reminderType, data.title, data.description || null, data.remindAt]
    );
    logger.info(`Reminder created: ${data.title}`);
    return this.mapRow(res.rows[0]);
  }

  async getUpcoming(userId: string, daysAhead = 7): Promise<Reminder[]> {
    const res = await query(
      `SELECT r.*, j.title AS job_title, j.company_name
       FROM reminders r
       LEFT JOIN jobs j ON j.id = r.job_id
       WHERE r.user_id = $1 AND NOT r.is_completed
         AND r.remind_at <= NOW() + INTERVAL '1 day' * $2
       ORDER BY r.remind_at ASC`,
      [userId, daysAhead]
    );
    return res.rows.map((r: any) => this.mapRow(r));
  }

  async getOverdue(userId: string): Promise<Reminder[]> {
    const res = await query(
      `SELECT r.*, j.title AS job_title, j.company_name
       FROM reminders r
       LEFT JOIN jobs j ON j.id = r.job_id
       WHERE r.user_id = $1 AND NOT r.is_completed AND r.remind_at < NOW()
       ORDER BY r.remind_at ASC`,
      [userId]
    );
    return res.rows.map((r: any) => this.mapRow(r));
  }

  async getAll(userId: string, includeCompleted = false): Promise<Reminder[]> {
    let sql = `SELECT r.*, j.title AS job_title, j.company_name
               FROM reminders r
               LEFT JOIN jobs j ON j.id = r.job_id
               WHERE r.user_id = $1`;
    if (!includeCompleted) sql += ` AND NOT r.is_completed`;
    sql += ` ORDER BY r.remind_at ASC`;
    const res = await query(sql, [userId]);
    return res.rows.map((r: any) => this.mapRow(r));
  }

  async complete(id: string): Promise<void> {
    await query(
      `UPDATE reminders SET is_completed = TRUE, completed_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  async delete(id: string): Promise<void> {
    await query('DELETE FROM reminders WHERE id = $1', [id]);
  }

  /** Auto-create follow-up reminders for applications without response */
  async autoCreateFollowUps(userId: string, daysAfterApply = 7): Promise<number> {
    const res = await query(
      `SELECT ja.id AS app_id, ja.job_id, j.title, j.company_name, ja.created_at
       FROM job_applications ja
       JOIN jobs j ON j.id = ja.job_id
       WHERE ja.user_id = $1 AND ja.status = 'applied'
         AND ja.created_at < NOW() - INTERVAL '1 day' * $2
         AND NOT EXISTS (
           SELECT 1 FROM reminders r
           WHERE r.user_id = $1 AND r.job_id = ja.job_id AND r.reminder_type = 'FOLLOW_UP'
         )`,
      [userId, daysAfterApply]
    );

    for (const row of res.rows) {
      await this.create({
        userId,
        jobId: row.job_id,
        reminderType: 'FOLLOW_UP',
        title: `Follow up: ${row.title} at ${row.company_name}`,
        description: `No response after ${daysAfterApply} days. Consider sending a polite follow-up.`,
        remindAt: new Date().toISOString(),
      });
    }

    if (res.rows.length > 0) {
      logger.info(`Auto-created ${res.rows.length} follow-up reminders`);
    }
    return res.rows.length;
  }

  /** Export reminders as iCal format for Google Calendar integration */
  async exportICal(userId: string): Promise<string> {
    const reminders = await this.getUpcoming(userId, 30);

    let ical = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//SmartJobHunter//EN\n';
    for (const r of reminders) {
      const dt = new Date(r.remindAt).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      ical += `BEGIN:VEVENT\n`;
      ical += `DTSTART:${dt}\n`;
      ical += `DTEND:${dt}\n`;
      ical += `SUMMARY:${r.title}\n`;
      if (r.description) ical += `DESCRIPTION:${r.description}\n`;
      ical += `UID:${r.id}@smartjobhunter\n`;
      ical += `END:VEVENT\n`;
    }
    ical += 'END:VCALENDAR';
    return ical;
  }

  private mapRow(r: any): Reminder {
    return {
      id: r.id, userId: r.user_id, jobId: r.job_id,
      recruiterId: r.recruiter_id, reminderType: r.reminder_type,
      title: r.title, description: r.description,
      remindAt: r.remind_at, isCompleted: r.is_completed,
      completedAt: r.completed_at, createdAt: r.created_at,
      jobTitle: r.job_title, companyName: r.company_name,
    };
  }
}
