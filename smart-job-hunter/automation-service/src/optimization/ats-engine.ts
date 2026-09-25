import { query } from '../db/postgres-client';
import { UserFeatures, JobFeatures, ScoreResult } from '../matching/scoring-strategy';
import logger from '../utils/logger';

// =============================================
// ATS Keyword Extraction + Scoring
// =============================================

// High-value ATS keywords by category
const KEYWORD_CATEGORIES: Record<string, string[]> = {
  languages: ['java', 'python', 'javascript', 'typescript', 'golang', 'go', 'c++', 'c#', 'rust', 'kotlin', 'scala', 'ruby', 'php', 'swift'],
  frameworks: ['spring boot', 'spring', 'react', 'angular', 'vue', 'next.js', 'express', 'django', 'flask', 'rails', 'node.js', '.net', 'fastapi'],
  databases: ['postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'cassandra', 'dynamodb', 'oracle', 'sql server'],
  cloud: ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'jenkins', 'ci/cd', 'devops'],
  concepts: ['microservices', 'rest api', 'graphql', 'agile', 'scrum', 'tdd', 'solid', 'design patterns', 'system design', 'data structures'],
  tools: ['git', 'jira', 'confluence', 'kafka', 'rabbitmq', 'nginx', 'linux', 'maven', 'gradle'],
};

const ALL_KEYWORDS = Object.values(KEYWORD_CATEGORIES).flat();

export interface ATSAnalysis {
  atsScore: number;
  keywordMatchPct: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  priority: 'HIGH' | 'GOOD' | 'LOW' | 'SKIP';
  interviewProbability: number;
  skipReason: string | null;
  suggestions: string[];
}

/**
 * Extract keywords from job description text.
 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const kw of ALL_KEYWORDS) {
    if (lower.includes(kw)) found.push(kw);
  }
  // Also extract multi-word terms from skills
  return [...new Set(found)];
}

/**
 * Full ATS analysis: keyword match + interview probability + priority.
 */
export function analyzeATS(
  user: UserFeatures,
  job: JobFeatures,
  score: ScoreResult,
  jobDescription: string | null
): ATSAnalysis {
  // 1. Keyword extraction
  const descKeywords = extractKeywords(jobDescription || '');
  const skillKeywords = job.skills.map(s => s.toLowerCase());
  const allJobKeywords = [...new Set([...descKeywords, ...skillKeywords])];
  const userSkillsLower = new Set(user.skills.map(s => s.toLowerCase()));

  const matched = allJobKeywords.filter(k => userSkillsLower.has(k));
  const missing = allJobKeywords.filter(k => !userSkillsLower.has(k));

  const keywordMatchPct = allJobKeywords.length > 0
    ? Math.round((matched.length / allJobKeywords.length) * 100)
    : 50;

  // 2. ATS Score (0-100): weighted by keyword density + formatting
  let atsScore = keywordMatchPct;
  // Bonus for high skill match
  if (score.skillScore.score >= 80) atsScore = Math.min(100, atsScore + 10);
  // Bonus for experience fit
  if (score.experienceScore.score >= 90) atsScore = Math.min(100, atsScore + 5);
  // Penalty for too many missing critical keywords
  if (missing.length > 5) atsScore = Math.max(0, atsScore - 10);

  // 3. Interview Probability (0-100)
  let interviewProb = 0;
  // Base: weighted composite
  interviewProb += score.totalScore * 0.30;
  interviewProb += atsScore * 0.25;
  // Recency is huge for interview chances
  interviewProb += score.recencyScore.score * 0.20;
  // Location match matters
  interviewProb += score.locationScore.score * 0.10;
  // Experience alignment
  interviewProb += score.experienceScore.score * 0.15;
  interviewProb = Math.round(Math.min(100, interviewProb));

  // 4. Spam / quality detection
  const skipReason = detectSkipReason(job, jobDescription);

  // 5. Priority categorization
  const priority = categorize(score.totalScore, atsScore, interviewProb, skipReason);

  // 6. Suggestions
  const suggestions = generateSuggestions(missing, score, atsScore);

  return {
    atsScore: Math.round(atsScore),
    keywordMatchPct,
    matchedKeywords: matched,
    missingKeywords: missing,
    priority,
    interviewProbability: interviewProb,
    skipReason,
    suggestions,
  };
}

function detectSkipReason(job: JobFeatures, desc: string | null): string | null {
  const title = (job.title || '').toLowerCase();
  const description = (desc || '').toLowerCase();

  // Fake/spam indicators
  if (title.includes('walk-in') || title.includes('walkin')) return 'Walk-in drive (low quality)';
  if (title.includes('urgent hiring') || title.includes('mass hiring')) return 'Mass hiring (low priority)';
  if (description.includes('registration fee') || description.includes('security deposit')) return 'Scam: asks for money';
  if (description.includes('work from home data entry') && !title.includes('engineer')) return 'Likely spam/data entry';

  // Unrealistic requirements
  if (job.experienceMin && job.experienceMin >= 15) return 'Extremely senior role (15+ yrs)';

  // Stale posting
  if (job.postedDate) {
    const days = Math.floor((Date.now() - new Date(job.postedDate).getTime()) / 86400000);
    if (days > 60) return `Very old posting (${days} days)`;
  }

  return null;
}

function categorize(totalScore: number, atsScore: number, interviewProb: number, skipReason: string | null): 'HIGH' | 'GOOD' | 'LOW' | 'SKIP' {
  if (skipReason) return 'SKIP';
  if (totalScore >= 75 && atsScore >= 60 && interviewProb >= 55) return 'HIGH';
  if (totalScore >= 55 && atsScore >= 40) return 'GOOD';
  if (totalScore >= 35) return 'LOW';
  return 'SKIP';
}

function generateSuggestions(missingKeywords: string[], score: ScoreResult, atsScore: number): string[] {
  const suggestions: string[] = [];

  if (missingKeywords.length > 0 && missingKeywords.length <= 5) {
    suggestions.push(`Add these to your resume: ${missingKeywords.join(', ')}`);
  } else if (missingKeywords.length > 5) {
    suggestions.push(`Key gaps: ${missingKeywords.slice(0, 5).join(', ')} (+${missingKeywords.length - 5} more)`);
  }

  if (score.skillScore.score < 60) {
    suggestions.push('Skill match is low — consider highlighting transferable experience');
  }

  if (atsScore < 50) {
    suggestions.push('ATS score is low — add more job-specific keywords to resume');
  }

  if (score.recencyScore.score < 50) {
    suggestions.push('This is an older posting — response rate may be lower');
  }

  return suggestions;
}

// =============================================
// DB Persistence
// =============================================

export async function saveATSAnalysis(userId: string, jobId: string, analysis: ATSAnalysis): Promise<void> {
  await query(
    `INSERT INTO ats_analysis (user_id, job_id, ats_score, keyword_match_pct, matched_keywords, missing_keywords, priority, interview_probability, skip_reason)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
     ON CONFLICT (user_id, job_id) DO UPDATE SET
       ats_score = EXCLUDED.ats_score, keyword_match_pct = EXCLUDED.keyword_match_pct,
       matched_keywords = EXCLUDED.matched_keywords, missing_keywords = EXCLUDED.missing_keywords,
       priority = EXCLUDED.priority, interview_probability = EXCLUDED.interview_probability,
       skip_reason = EXCLUDED.skip_reason, analyzed_at = NOW()`,
    [userId, jobId, analysis.atsScore, analysis.keywordMatchPct,
     JSON.stringify(analysis.matchedKeywords), JSON.stringify(analysis.missingKeywords),
     analysis.priority, analysis.interviewProbability, analysis.skipReason]
  );
}

export async function getATSAnalysis(userId: string, jobId: string): Promise<ATSAnalysis | null> {
  const res = await query(
    'SELECT * FROM ats_analysis WHERE user_id = $1 AND job_id = $2',
    [userId, jobId]
  );
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    atsScore: parseFloat(r.ats_score),
    keywordMatchPct: parseFloat(r.keyword_match_pct),
    matchedKeywords: r.matched_keywords || [],
    missingKeywords: r.missing_keywords || [],
    priority: r.priority,
    interviewProbability: parseFloat(r.interview_probability),
    skipReason: r.skip_reason,
    suggestions: [],
  };
}

export async function getATSStats(userId: string): Promise<{
  analyzed: number; highPriority: number; goodMatch: number; avgATS: number; avgInterview: number;
  topMissing: string[];
}> {
  const res = await query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE priority = 'HIGH') AS high_ct,
       COUNT(*) FILTER (WHERE priority = 'GOOD') AS good_ct,
       ROUND(AVG(ats_score), 1) AS avg_ats,
       ROUND(AVG(interview_probability), 1) AS avg_interview
     FROM ats_analysis WHERE user_id = $1 AND priority != 'SKIP'`,
    [userId]
  );
  const row = res.rows[0];

  // Aggregate most common missing keywords
  const missingRes = await query(
    `SELECT kw, COUNT(*) AS ct FROM ats_analysis, jsonb_array_elements_text(missing_keywords) AS kw
     WHERE user_id = $1 AND priority != 'SKIP' GROUP BY kw ORDER BY ct DESC LIMIT 10`,
    [userId]
  );

  return {
    analyzed: parseInt(row.total),
    highPriority: parseInt(row.high_ct),
    goodMatch: parseInt(row.good_ct),
    avgATS: parseFloat(row.avg_ats) || 0,
    avgInterview: parseFloat(row.avg_interview) || 0,
    topMissing: missingRes.rows.map((r: any) => r.kw),
  };
}

/**
 * Batch analyze all scored-but-unanalyzed jobs for a user.
 */
export async function batchAnalyze(userId: string): Promise<{ analyzed: number; highPriority: number }> {
  // Get scored jobs that haven't been ATS-analyzed yet
  const res = await query(
    `SELECT js.job_id, js.total_score, js.skill_score, js.experience_score,
            js.location_score, js.salary_score, js.recency_score, js.score_breakdown,
            j.title, j.company_name, j.skills, j.experience_min, j.experience_max,
            j.salary_min, j.salary_max, j.location, j.posted_date, j.job_description
     FROM job_scores js
     JOIN jobs j ON j.id = js.job_id
     WHERE js.user_id = $1
       AND NOT EXISTS (SELECT 1 FROM ats_analysis a WHERE a.user_id = $1 AND a.job_id = js.job_id)
     ORDER BY js.total_score DESC`,
    [userId]
  );

  if (res.rows.length === 0) return { analyzed: 0, highPriority: 0 };

  // Load user features
  const userRes = await query(
    'SELECT skills, experience_years, preferred_locations, target_locations, expected_salary_min, expected_salary_max FROM users WHERE id = $1',
    [userId]
  );
  const u = userRes.rows[0];
  const userFeatures: UserFeatures = {
    skills: (Array.isArray(u.skills) ? u.skills : []).map((s: string) => s.toLowerCase()),
    experienceYears: u.experience_years || 0,
    preferredLocations: [...(u.preferred_locations || []), ...(u.target_locations || [])].map((l: string) => l.toLowerCase()),
    expectedSalaryMin: u.expected_salary_min || 0,
    expectedSalaryMax: u.expected_salary_max || 0,
  };

  let highCount = 0;
  for (const row of res.rows) {
    const jobFeatures: JobFeatures = {
      jobId: row.job_id, title: row.title, companyName: row.company_name,
      skills: (Array.isArray(row.skills) ? row.skills : []).map((s: any) => String(s).toLowerCase()),
      experienceMin: row.experience_min, experienceMax: row.experience_max,
      salaryMin: row.salary_min, salaryMax: row.salary_max,
      location: row.location, postedDate: row.posted_date ? new Date(row.posted_date) : null,
    };

    const scoreResult: ScoreResult = {
      jobId: row.job_id,
      totalScore: parseFloat(row.total_score),
      skillScore: { score: parseFloat(row.skill_score), reason: '', matchedItems: [] },
      experienceScore: { score: parseFloat(row.experience_score), reason: '' },
      locationScore: { score: parseFloat(row.location_score), reason: '' },
      salaryScore: { score: parseFloat(row.salary_score), reason: '' },
      recencyScore: { score: parseFloat(row.recency_score), reason: '' },
    };

    const analysis = analyzeATS(userFeatures, jobFeatures, scoreResult, row.job_description);
    await saveATSAnalysis(userId, row.job_id, analysis);
    if (analysis.priority === 'HIGH') highCount++;
  }

  logger.info(`ATS batch: analyzed ${res.rows.length} jobs, ${highCount} HIGH priority`);
  return { analyzed: res.rows.length, highPriority: highCount };
}
