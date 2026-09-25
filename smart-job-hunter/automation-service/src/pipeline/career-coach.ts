import { query } from '../db/postgres-client';
import { createAIClient } from '../ai/ai-client';
import logger from '../utils/logger';

// =============================================
// AI Career Coach
// =============================================

export type CoachingType = 'PROFILE_REVIEW' | 'SALARY_ADVICE' | 'ROLE_TARGETING' | 'SKILL_ROADMAP' | 'READINESS_SCORE' | 'WEEKLY_SUMMARY';

export interface CoachingAdvice {
  id: string;
  userId: string;
  coachingType: CoachingType;
  advice: any;
  readinessScore: number | null;
  providerUsed: string | null;
  generatedAt: string;
}

const COACHING_PROMPTS: Record<CoachingType, string> = {
  PROFILE_REVIEW: `Review this developer's profile and provide actionable improvement suggestions.

Profile:
- Skills: {skills}
- Experience: {experience} years
- Target roles: {targetRoles}
- Locations: {locations}

Job market context:
- Total jobs found: {totalJobs}
- Avg match score: {avgScore}
- Top missing skills: {missingSkills}

Provide as JSON: { "strengths": [...], "improvements": [...], "quickWins": [...], "longTermGoals": [...] }`,

  SALARY_ADVICE: `Based on this developer's profile, provide salary positioning advice for the Indian job market.

Profile:
- Skills: {skills}
- Experience: {experience} years
- Current salary range: {salaryRange}
- Locations: {locations}

Provide as JSON: { "currentRange": "X-Y LPA", "marketRate": "X-Y LPA", "negotiationTips": [...], "highValueSkills": [...] }`,

  ROLE_TARGETING: `Analyze which roles this developer should target for maximum interview success.

Profile:
- Skills: {skills}
- Experience: {experience} years
- Current avg match: {avgScore}%
- Strong matches: {strongSkills}

Provide as JSON: { "recommendedRoles": [{"title": "...", "fitScore": 90, "reason": "..."}], "avoidRoles": [...], "pivotSuggestions": [...] }`,

  SKILL_ROADMAP: `Create a 90-day skill development roadmap for this developer.

Profile:
- Current Skills: {skills}
- Experience: {experience} years
- Most requested by jobs: {topRequested}
- Most commonly missing: {missingSkills}

Provide as JSON: { "week1_4": [{"skill": "...", "priority": "HIGH", "resources": [...]}], "week5_8": [...], "week9_12": [...] }`,

  READINESS_SCORE: `Rate this developer's interview readiness on a 0-100 scale.

Profile:
- Skills: {skills}
- Experience: {experience} years
- Avg match: {avgScore}%
- Avg ATS: {avgATS}%
- Applications: {totalApps}
- Interview rate: {interviewRate}%

Provide as JSON: { "readinessScore": 75, "breakdown": {"technicalPrep": 80, "resumeQuality": 70, "interviewSkills": 65, "marketFit": 85}, "topPriority": "..." }`,

  WEEKLY_SUMMARY: `Summarize this developer's job search week and provide coaching advice.

This week:
- Applications: {appsSent}
- Responses: {responses}
- Interviews: {interviews}
- Rejections: {rejections}
- Career score: {careerScore}/100

Provide as JSON: { "summary": "...", "wins": [...], "improvements": [...], "focusNextWeek": "..." }`,
};

export class CareerCoach {
  async getAdvice(userId: string, type: CoachingType): Promise<CoachingAdvice> {
    const context = await this.gatherContext(userId);
    const prompt = this.buildPrompt(type, context);

    const aiClient = createAIClient();
    const result = await aiClient.generate(prompt, {
      systemPrompt: 'You are an expert AI career coach specializing in the Indian tech job market. Provide specific, actionable advice. Output ONLY valid JSON.',
      maxTokens: 1500,
      temperature: 0.7,
    });

    let advice: any;
    try {
      const match = result.text.match(/\{[\s\S]*\}/);
      advice = match ? JSON.parse(match[0]) : { raw: result.text };
    } catch {
      advice = { raw: result.text };
    }

    const readinessScore = advice.readinessScore || null;

    const res = await query(
      `INSERT INTO career_coaching (user_id, coaching_type, advice, readiness_score, provider_used)
       VALUES ($1, $2, $3::jsonb, $4, $5) RETURNING *`,
      [userId, type, JSON.stringify(advice), readinessScore, result.provider]
    );

    logger.info(`Career coaching: ${type} generated`);
    return this.mapRow(res.rows[0]);
  }

  async getHistory(userId: string, type?: CoachingType): Promise<CoachingAdvice[]> {
    let sql = 'SELECT * FROM career_coaching WHERE user_id = $1';
    const params: any[] = [userId];
    if (type) { sql += ' AND coaching_type = $2'; params.push(type); }
    sql += ' ORDER BY generated_at DESC LIMIT 20';
    const res = await query(sql, params);
    return res.rows.map((r: any) => this.mapRow(r));
  }

  async getLatestReadiness(userId: string): Promise<number | null> {
    const res = await query(
      `SELECT readiness_score FROM career_coaching
       WHERE user_id = $1 AND coaching_type = 'READINESS_SCORE' AND readiness_score IS NOT NULL
       ORDER BY generated_at DESC LIMIT 1`,
      [userId]
    );
    return res.rows.length ? res.rows[0].readiness_score : null;
  }

  private async gatherContext(userId: string): Promise<Record<string, any>> {
    const [userRes, scoreRes, atsRes, appRes, pipelineRes] = await Promise.all([
      query('SELECT * FROM users WHERE id = $1', [userId]),
      query('SELECT ROUND(AVG(total_score), 1) AS avg, COUNT(*) AS total FROM job_scores WHERE user_id = $1', [userId]),
      query(`SELECT ROUND(AVG(ats_score), 1) AS avg_ats,
             (SELECT array_agg(kw) FROM (SELECT kw FROM ats_analysis, jsonb_array_elements_text(missing_keywords) AS kw WHERE user_id = $1 GROUP BY kw ORDER BY COUNT(*) DESC LIMIT 5) t) AS missing,
             (SELECT array_agg(kw) FROM (SELECT kw FROM ats_analysis, jsonb_array_elements_text(matched_keywords) AS kw WHERE user_id = $1 GROUP BY kw ORDER BY COUNT(*) DESC LIMIT 5) t) AS requested
             FROM ats_analysis WHERE user_id = $1`, [userId]),
      query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'applied') AS applied FROM job_applications WHERE user_id = $1`, [userId]),
      query(`SELECT COUNT(*) FILTER (WHERE stage IN ('HR_SCREENING','TECHNICAL_ROUND','ASSIGNMENT','FINAL_ROUND')) AS interviews,
             COUNT(*) AS total FROM interview_pipeline WHERE user_id = $1`, [userId]),
    ]);

    const user = userRes.rows[0] || {};
    const totalApps = parseInt(appRes.rows[0].total) || 0;
    const interviews = parseInt(pipelineRes.rows[0].interviews) || 0;

    return {
      skills: (user.skills || []).join(', '),
      experience: user.experience_years || 0,
      targetRoles: (user.target_roles || []).join(', '),
      locations: [...(user.preferred_locations || []), ...(user.target_locations || [])].join(', '),
      salaryRange: `${user.expected_salary_min || '?'}-${user.expected_salary_max || '?'} LPA`,
      totalJobs: parseInt(scoreRes.rows[0].total) || 0,
      avgScore: parseFloat(scoreRes.rows[0].avg) || 0,
      avgATS: parseFloat(atsRes.rows[0]?.avg_ats) || 0,
      missingSkills: (atsRes.rows[0]?.missing || []).join(', '),
      topRequested: (atsRes.rows[0]?.requested || []).join(', '),
      strongSkills: (user.skills || []).slice(0, 5).join(', '),
      totalApps,
      interviewRate: totalApps > 0 ? Math.round((interviews / totalApps) * 100) : 0,
      appsSent: parseInt(appRes.rows[0].applied) || 0,
    };
  }

  private buildPrompt(type: CoachingType, ctx: Record<string, any>): string {
    let prompt = COACHING_PROMPTS[type];
    for (const [key, val] of Object.entries(ctx)) {
      prompt = prompt.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val || 'N/A'));
    }
    return prompt;
  }

  private mapRow(r: any): CoachingAdvice {
    return {
      id: r.id, userId: r.user_id, coachingType: r.coaching_type,
      advice: r.advice, readinessScore: r.readiness_score,
      providerUsed: r.provider_used, generatedAt: r.generated_at,
    };
  }
}
