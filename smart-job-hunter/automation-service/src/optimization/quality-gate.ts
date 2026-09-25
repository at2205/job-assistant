import { getATSAnalysis, ATSAnalysis } from './ats-engine';
import logger from '../utils/logger';

/**
 * Application Quality Gate — prevents low-quality applications.
 * Runs before any apply flow (manual or auto).
 */

export interface QualityCheckResult {
  approved: boolean;
  overallQuality: number;  // 0-100
  checks: QualityCheck[];
  blockers: string[];
}

interface QualityCheck {
  name: string;
  passed: boolean;
  score: number;
  reason: string;
}

export async function checkApplicationQuality(
  userId: string,
  jobId: string,
  totalScore: number,
  atsAnalysis?: ATSAnalysis | null,
): Promise<QualityCheckResult> {
  // Ensure totalScore is a number
  totalScore = Number(totalScore) || 0;
  // Load ATS if not provided
  const ats = atsAnalysis || await getATSAnalysis(userId, jobId);

  const checks: QualityCheck[] = [];
  const blockers: string[] = [];

  // 1. Match score
  const scoreCheck: QualityCheck = {
    name: 'Match Score',
    passed: totalScore >= 50,
    score: totalScore,
    reason: totalScore >= 75 ? 'Strong match' : totalScore >= 50 ? 'Decent match' : 'Weak match — consider skipping',
  };
  checks.push(scoreCheck);
  if (totalScore < 40) blockers.push(`Match score too low (${totalScore}/100)`);

  // 2. ATS score
  const atsScore = ats?.atsScore ?? 50;
  const atsCheck: QualityCheck = {
    name: 'ATS Score',
    passed: atsScore >= 40,
    score: atsScore,
    reason: atsScore >= 60 ? 'Good keyword coverage' : atsScore >= 40 ? 'Moderate — add keywords' : 'Low — resume likely filtered out',
  };
  checks.push(atsCheck);
  if (atsScore < 30) blockers.push(`ATS score too low (${atsScore}/100) — resume will be filtered`);

  // 3. Priority check
  const priority = ats?.priority ?? 'LOW';
  const priorityCheck: QualityCheck = {
    name: 'Priority',
    passed: priority !== 'SKIP',
    score: priority === 'HIGH' ? 100 : priority === 'GOOD' ? 70 : priority === 'LOW' ? 40 : 0,
    reason: priority === 'SKIP' ? `Skipped: ${ats?.skipReason}` : `Priority: ${priority}`,
  };
  checks.push(priorityCheck);
  if (priority === 'SKIP') blockers.push(`Job flagged as SKIP: ${ats?.skipReason}`);

  // 4. Interview probability
  const interviewProb = ats?.interviewProbability ?? 30;
  const interviewCheck: QualityCheck = {
    name: 'Interview Probability',
    passed: interviewProb >= 30,
    score: interviewProb,
    reason: interviewProb >= 50 ? 'Good chances' : interviewProb >= 30 ? 'Moderate chances' : 'Very low interview chances',
  };
  checks.push(interviewCheck);

  // 5. Keyword coverage
  const kwPct = ats?.keywordMatchPct ?? 50;
  const kwCheck: QualityCheck = {
    name: 'Keyword Coverage',
    passed: kwPct >= 30,
    score: kwPct,
    reason: kwPct >= 60 ? 'Strong keyword match' : kwPct >= 30 ? 'Acceptable' : 'Too many missing keywords',
  };
  checks.push(kwCheck);

  const overallQuality = Math.round(
    checks.reduce((sum, c) => sum + c.score, 0) / checks.length
  );

  const approved = blockers.length === 0 && overallQuality >= 40;

  if (!approved) {
    logger.warn(`Quality gate BLOCKED application: ${blockers.join('; ')}`);
  }

  return { approved, overallQuality, checks, blockers };
}
