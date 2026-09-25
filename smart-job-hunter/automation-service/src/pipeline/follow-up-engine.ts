import { query } from '../db/postgres-client';
import { createAIClient } from '../ai/ai-client';
import logger from '../utils/logger';

// =============================================
// Follow-up Engine — draft generation (NEVER auto-send)
// =============================================

export type FollowUpType = 'RECRUITER_FOLLOW_UP' | 'THANK_YOU' | 'APPLICATION_REMINDER' | 'NETWORKING' | 'STATUS_CHECK';

export interface FollowUpDraft {
  id: string;
  userId: string;
  jobId: string | null;
  recruiterId: string | null;
  applicationId: string | null;
  followUpType: FollowUpType;
  subject: string | null;
  content: string;
  tone: string;
  status: 'draft' | 'reviewed' | 'sent' | 'skipped';
  generatedBy: string | null;
  scheduledFor: string | null;
  sentAt: string | null;
  createdAt: string;
}

const FOLLOW_UP_PROMPTS: Record<FollowUpType, string> = {
  RECRUITER_FOLLOW_UP: `Write a polite, professional follow-up email to a recruiter about a job application.
Rules:
- Maximum 100 words
- Be respectful of their time
- Reference the specific role
- Do NOT be pushy or desperate
- End with a clear, soft call-to-action
- No exclamation marks
- No "I hope this email finds you well"`,

  THANK_YOU: `Write a concise thank-you message after a job interview.
Rules:
- Maximum 80 words
- Reference something specific discussed (use the job details)
- Express genuine interest
- Professional and warm but not over-eager
- No generic flattery`,

  APPLICATION_REMINDER: `Write a brief status check email about a pending job application.
Rules:
- Maximum 60 words
- Politely ask about the application status
- Do NOT pressure or sound impatient
- Professional tone
- Reference the role and when you applied`,

  NETWORKING: `Write a brief networking message to connect with a recruiter or professional.
Rules:
- Maximum 80 words
- Be genuine and specific about why you're reaching out
- Do NOT ask for a job directly
- Focus on mutual value
- Professional and friendly`,

  STATUS_CHECK: `Write a brief follow-up checking on interview process status.
Rules:
- Maximum 60 words
- Professional and patient
- Reference the stage you're at
- Do NOT sound anxious`,
};

export class FollowUpEngine {
  /** Generate a follow-up draft using AI */
  async generateDraft(
    userId: string,
    type: FollowUpType,
    context: {
      jobTitle?: string; companyName?: string; recruiterName?: string;
      jobId?: string; recruiterId?: string; applicationId?: string;
      interviewDate?: string; stage?: string; additionalContext?: string;
    }
  ): Promise<FollowUpDraft> {
    const prompt = this.buildPrompt(type, context);

    const aiClient = createAIClient();
    const available = await aiClient.getAvailableProviders();
    if (available.length === 0) throw new Error('No AI providers available');

    const result = await aiClient.generate(prompt, {
      systemPrompt: 'You are a professional career communication specialist. Write concise, recruiter-friendly messages. Never be spammy, generic, or pushy.',
      maxTokens: 300,
      temperature: 0.7,
    });

    // Parse subject and body
    const lines = result.text.trim().split('\n');
    let subject: string | null = null;
    let body = result.text.trim();

    if (lines[0].toLowerCase().startsWith('subject:')) {
      subject = lines[0].replace(/^subject:\s*/i, '').trim();
      body = lines.slice(1).join('\n').trim();
    }

    const res = await query(
      `INSERT INTO follow_up_drafts
       (user_id, job_id, recruiter_id, application_id, follow_up_type, subject, content, generated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [userId, context.jobId || null, context.recruiterId || null,
       context.applicationId || null, type, subject, body, result.provider]
    );

    logger.info(`Follow-up draft generated: ${type} for ${context.companyName || 'N/A'}`);
    return this.mapRow(res.rows[0]);
  }

  async getDrafts(userId: string, status?: string): Promise<FollowUpDraft[]> {
    let sql = `SELECT f.*, j.title AS job_title, j.company_name
               FROM follow_up_drafts f
               LEFT JOIN jobs j ON j.id = f.job_id
               WHERE f.user_id = $1`;
    const params: any[] = [userId];
    if (status) { sql += ` AND f.status = $2`; params.push(status); }
    sql += ` ORDER BY f.created_at DESC`;
    const res = await query(sql, params);
    return res.rows.map((r: any) => this.mapRow(r));
  }

  async updateStatus(id: string, status: 'reviewed' | 'sent' | 'skipped'): Promise<void> {
    const updates = status === 'sent'
      ? `status = $1, sent_at = NOW()`
      : `status = $1`;
    await query(`UPDATE follow_up_drafts SET ${updates} WHERE id = $2`, [status, id]);
  }

  async updateContent(id: string, content: string, subject?: string): Promise<void> {
    await query(
      `UPDATE follow_up_drafts SET content = $1, subject = COALESCE($2, subject) WHERE id = $3`,
      [content, subject || null, id]
    );
  }

  /** Get pending follow-ups that are overdue */
  async getPendingReminders(userId: string): Promise<FollowUpDraft[]> {
    const res = await query(
      `SELECT * FROM follow_up_drafts
       WHERE user_id = $1 AND status = 'draft' AND scheduled_for IS NOT NULL AND scheduled_for <= NOW()
       ORDER BY scheduled_for ASC`,
      [userId]
    );
    return res.rows.map((r: any) => this.mapRow(r));
  }

  private buildPrompt(type: FollowUpType, ctx: any): string {
    const base = FOLLOW_UP_PROMPTS[type];
    const details = [];
    if (ctx.jobTitle) details.push(`Role: ${ctx.jobTitle}`);
    if (ctx.companyName) details.push(`Company: ${ctx.companyName}`);
    if (ctx.recruiterName) details.push(`Recruiter: ${ctx.recruiterName}`);
    if (ctx.stage) details.push(`Current stage: ${ctx.stage}`);
    if (ctx.interviewDate) details.push(`Interview date: ${ctx.interviewDate}`);
    if (ctx.additionalContext) details.push(`Context: ${ctx.additionalContext}`);

    return `${base}\n\nJob Details:\n${details.join('\n')}\n\nWrite the message now. Start with "Subject:" on the first line.`;
  }

  private mapRow(r: any): FollowUpDraft {
    return {
      id: r.id, userId: r.user_id, jobId: r.job_id,
      recruiterId: r.recruiter_id, applicationId: r.application_id,
      followUpType: r.follow_up_type, subject: r.subject,
      content: r.content, tone: r.tone || 'professional',
      status: r.status, generatedBy: r.generated_by,
      scheduledFor: r.scheduled_for, sentAt: r.sent_at,
      createdAt: r.created_at,
    };
  }
}
