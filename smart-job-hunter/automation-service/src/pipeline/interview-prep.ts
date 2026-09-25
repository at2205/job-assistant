import { query } from '../db/postgres-client';
import { createAIClient } from '../ai/ai-client';
import logger from '../utils/logger';

// =============================================
// Interview Preparation Engine
// =============================================

export type PrepType = 'TECHNICAL' | 'HR' | 'DSA' | 'SYSTEM_DESIGN' | 'COMPANY_SPECIFIC' | 'BEHAVIORAL';

export interface PrepQuestion {
  question: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  suggestedAnswer?: string;
}

export interface InterviewPrepResult {
  id: string;
  userId: string;
  jobId: string;
  prepType: PrepType;
  questions: PrepQuestion[];
  suggestedAnswers: any[];
  weakAreas: string[];
  providerUsed: string | null;
  generatedAt: string;
}

const PREP_PROMPTS: Record<PrepType, string> = {
  TECHNICAL: `Generate 8 technical interview questions for a {role} position at {company}.
Focus on: {skills}
Format: JSON array of objects with "question", "difficulty" (easy/medium/hard), "category", "suggestedAnswer"
Include a mix of conceptual and hands-on coding questions.
For Java/Spring Boot: cover Spring Boot internals, REST design, JPA, security, microservices.`,

  HR: `Generate 6 HR/behavioral interview questions for a {role} position at {company}.
Format: JSON array of objects with "question", "difficulty" (easy/medium/hard), "category", "suggestedAnswer"
Include: motivation, teamwork, conflict resolution, career goals, salary expectations, why this company.`,

  DSA: `Generate 6 data structure and algorithm questions likely asked for {role} at {company}.
Skills context: {skills}
Format: JSON array of objects with "question", "difficulty" (easy/medium/hard), "category", "suggestedAnswer"
Focus on: arrays, strings, trees, graphs, dynamic programming, sorting. Include the approach, not full code.`,

  SYSTEM_DESIGN: `Generate 4 system design questions for a {role} position at {company}.
Skills context: {skills}
Format: JSON array of objects with "question", "difficulty" (medium/hard), "category", "suggestedAnswer"
Focus on: scalability, database design, API design, caching, messaging. Give a brief solution outline.`,

  COMPANY_SPECIFIC: `Generate 5 company-specific interview questions for {company} hiring a {role}.
Based on the job description: {description}
Format: JSON array of objects with "question", "difficulty" (easy/medium/hard), "category", "suggestedAnswer"
Focus on the specific technologies and problems this company likely faces.`,

  BEHAVIORAL: `Generate 5 behavioral STAR-method interview questions for a {role} at {company}.
Format: JSON array of objects with "question", "difficulty" (easy/medium/hard), "category", "suggestedAnswer"
suggestedAnswer should be a STAR framework outline (Situation, Task, Action, Result).`,
};

export class InterviewPrepEngine {
  async generate(
    userId: string, jobId: string, prepType: PrepType,
    context: { jobTitle: string; companyName: string; skills: string[]; jobDescription?: string },
    force = false
  ): Promise<InterviewPrepResult> {
    // Check cache
    if (!force) {
      const cached = await this.getCached(userId, jobId, prepType);
      if (cached) return cached;
    }

    const prompt = this.buildPrompt(prepType, context);

    const aiClient = createAIClient();
    const result = await aiClient.generate(prompt, {
      systemPrompt: 'You are a senior technical interviewer. Generate realistic interview questions with helpful suggested answers. Output ONLY valid JSON array.',
      maxTokens: 2000,
      temperature: 0.7,
    });

    let questions: PrepQuestion[] = [];
    try {
      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) questions = JSON.parse(jsonMatch[0]);
    } catch {
      logger.warn('Failed to parse AI prep response, creating fallback');
      questions = [{ question: result.text, difficulty: 'medium', category: prepType }];
    }

    // Analyze weak areas based on user skills vs job skills
    const weakAreas = await this.analyzeWeakAreas(userId, context.skills);

    const res = await query(
      `INSERT INTO interview_prep (user_id, job_id, prep_type, questions, suggested_answers, weak_areas, provider_used)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7)
       ON CONFLICT (user_id, job_id, prep_type) DO UPDATE SET
         questions = EXCLUDED.questions, suggested_answers = EXCLUDED.suggested_answers,
         weak_areas = EXCLUDED.weak_areas, provider_used = EXCLUDED.provider_used, generated_at = NOW()
       RETURNING *`,
      [userId, jobId, prepType, JSON.stringify(questions), JSON.stringify([]),
       JSON.stringify(weakAreas), result.provider]
    );

    logger.info(`Interview prep generated: ${prepType} for ${context.companyName}`);
    return this.mapRow(res.rows[0]);
  }

  async getAllForJob(userId: string, jobId: string): Promise<InterviewPrepResult[]> {
    const res = await query(
      `SELECT * FROM interview_prep WHERE user_id = $1 AND job_id = $2 ORDER BY generated_at DESC`,
      [userId, jobId]
    );
    return res.rows.map((r: any) => this.mapRow(r));
  }

  async generateFullPrep(
    userId: string, jobId: string,
    context: { jobTitle: string; companyName: string; skills: string[]; jobDescription?: string }
  ): Promise<InterviewPrepResult[]> {
    const types: PrepType[] = ['TECHNICAL', 'HR', 'DSA', 'SYSTEM_DESIGN'];
    const results: InterviewPrepResult[] = [];

    for (const type of types) {
      try {
        const r = await this.generate(userId, jobId, type, context);
        results.push(r);
      } catch (err: any) {
        logger.error(`Prep generation failed for ${type}: ${err.message}`);
      }
    }

    return results;
  }

  private async getCached(userId: string, jobId: string, prepType: PrepType): Promise<InterviewPrepResult | null> {
    const res = await query(
      `SELECT * FROM interview_prep WHERE user_id = $1 AND job_id = $2 AND prep_type = $3`,
      [userId, jobId, prepType]
    );
    return res.rows.length ? this.mapRow(res.rows[0]) : null;
  }

  private async analyzeWeakAreas(userId: string, jobSkills: string[]): Promise<string[]> {
    const userRes = await query('SELECT skills FROM users WHERE id = $1', [userId]);
    if (!userRes.rows.length) return [];
    const userSkills = new Set((userRes.rows[0].skills || []).map((s: string) => s.toLowerCase()));
    return jobSkills.filter(s => !userSkills.has(s.toLowerCase()));
  }

  private buildPrompt(type: PrepType, ctx: any): string {
    return PREP_PROMPTS[type]
      .replace('{role}', ctx.jobTitle || 'Software Engineer')
      .replace('{company}', ctx.companyName || 'the company')
      .replace(/\{skills\}/g, (ctx.skills || []).join(', ') || 'general programming')
      .replace('{description}', ctx.jobDescription?.substring(0, 500) || 'N/A');
  }

  private mapRow(r: any): InterviewPrepResult {
    return {
      id: r.id, userId: r.user_id, jobId: r.job_id,
      prepType: r.prep_type, questions: r.questions || [],
      suggestedAnswers: r.suggested_answers || [],
      weakAreas: r.weak_areas || [],
      providerUsed: r.provider_used, generatedAt: r.generated_at,
    };
  }
}
