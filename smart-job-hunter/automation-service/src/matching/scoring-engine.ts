import { FeatureExtractor } from './feature-extractor';
import { JobScoreRepository } from '../db/job-score-repository';
import { loadScoringConfig, ScoringConfig } from './weights-config';
import {
  UserFeatures,
  JobFeatures,
  ScoreResult,
  scoreSkills,
  scoreExperience,
  scoreLocation,
  scoreSalary,
  scoreRecency,
} from './scoring-strategy';
import logger from '../utils/logger';

export interface ScoringRunResult {
  userId: string;
  jobsScored: number;
  newScores: number;
  updatedScores: number;
  avgScore: number;
  aboveThreshold: number;
  topJobs: Array<{ title: string; company: string | null; score: number }>;
}

export class ScoringEngine {
  private extractor: FeatureExtractor;
  private scoreRepo: JobScoreRepository;
  private config: ScoringConfig;

  constructor() {
    this.extractor = new FeatureExtractor();
    this.scoreRepo = new JobScoreRepository();
    this.config = loadScoringConfig();
  }

  /**
   * Score all unscored jobs for a user.
   * This is the main entry point.
   */
  async scoreUnscoredJobs(userId: string, batchSize: number = 200): Promise<ScoringRunResult> {
    logger.info(`Starting scoring run for user ${userId}`);

    // Load user features (cached for this run)
    const userFeatures = await this.extractor.extractUserFeatures(userId);
    logger.info(`User profile: ${userFeatures.skills.length} skills, ${userFeatures.experienceYears} yrs exp, ${userFeatures.preferredLocations.join('/')}`);

    // Load unscored jobs
    const jobs = await this.extractor.extractUnscoredJobs(userId, batchSize);
    logger.info(`Found ${jobs.length} unscored jobs`);

    if (jobs.length === 0) {
      logger.info('No unscored jobs. Nothing to do.');
      return {
        userId,
        jobsScored: 0,
        newScores: 0,
        updatedScores: 0,
        avgScore: 0,
        aboveThreshold: 0,
        topJobs: [],
      };
    }

    // Score each job
    const scores: ScoreResult[] = [];
    for (const job of jobs) {
      const score = this.scoreOneJob(userFeatures, job);
      scores.push(score);
    }

    // Store scores
    const { inserted, updated } = await this.scoreRepo.upsertScores(
      userId,
      scores,
      this.config.version
    );

    // Compute stats
    const totalScores = scores.map(s => s.totalScore);
    const avgScore = Math.round(totalScores.reduce((a, b) => a + b, 0) / totalScores.length * 10) / 10;
    const aboveThreshold = scores.filter(s => s.totalScore >= this.config.thresholds.autoApplyMinScore).length;

    // Top 5
    const topJobs = scores
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 5)
      .map(s => {
        const job = jobs.find(j => j.jobId === s.jobId)!;
        return { title: job.title, company: job.companyName, score: s.totalScore };
      });

    this.logSummary(scores, avgScore, aboveThreshold, topJobs);

    return {
      userId,
      jobsScored: scores.length,
      newScores: inserted,
      updatedScores: updated,
      avgScore,
      aboveThreshold,
      topJobs,
    };
  }

  /**
   * Rescore ALL active jobs for a user.
   * Useful when user updates their profile or weights change.
   */
  async rescoreAllJobs(userId: string): Promise<ScoringRunResult> {
    logger.info(`Rescoring ALL active jobs for user ${userId}`);

    const userFeatures = await this.extractor.extractUserFeatures(userId);
    const jobs = await this.extractor.extractAllActiveJobs(1000);

    const scores: ScoreResult[] = jobs.map(job => this.scoreOneJob(userFeatures, job));

    const { inserted, updated } = await this.scoreRepo.upsertScores(
      userId,
      scores,
      this.config.version
    );

    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s.totalScore, 0) / scores.length * 10) / 10
      : 0;
    const aboveThreshold = scores.filter(s => s.totalScore >= this.config.thresholds.autoApplyMinScore).length;

    return {
      userId,
      jobsScored: scores.length,
      newScores: inserted,
      updatedScores: updated,
      avgScore,
      aboveThreshold,
      topJobs: scores.sort((a, b) => b.totalScore - a.totalScore).slice(0, 5).map(s => {
        const job = jobs.find(j => j.jobId === s.jobId)!;
        return { title: job.title, company: job.companyName, score: s.totalScore };
      }),
    };
  }

  /**
   * Score a single job against user profile.
   * Pure function — no side effects.
   */
  scoreOneJob(user: UserFeatures, job: JobFeatures): ScoreResult {
    const w = this.config.weights;

    const skillScore = scoreSkills(user, job);
    const experienceScore = scoreExperience(user, job, this.config);
    const locationScore = scoreLocation(user, job);
    const salaryScore = scoreSalary(user, job, this.config);
    const recencyScore = scoreRecency(job, this.config);

    const totalScore = Math.round(
      skillScore.score * w.skill +
      experienceScore.score * w.experience +
      locationScore.score * w.location +
      salaryScore.score * w.salary +
      recencyScore.score * w.recency
    );

    return {
      jobId: job.jobId,
      totalScore: clamp(totalScore, 0, 100),
      skillScore,
      experienceScore,
      locationScore,
      salaryScore,
      recencyScore,
    };
  }

  /**
   * Get detailed score breakdown for a specific job.
   * Useful for debugging and UI display.
   */
  async explainScore(userId: string, jobId: string): Promise<ScoreResult | null> {
    const userFeatures = await this.extractor.extractUserFeatures(userId);
    const jobs = await this.extractor.extractJobsByIds([jobId]);

    if (jobs.length === 0) return null;

    return this.scoreOneJob(userFeatures, jobs[0]);
  }

  private logSummary(
    scores: ScoreResult[],
    avgScore: number,
    aboveThreshold: number,
    topJobs: Array<{ title: string; company: string | null; score: number }>
  ): void {
    logger.info('='.repeat(50));
    logger.info('SCORING SUMMARY');
    logger.info('='.repeat(50));
    logger.info(`Jobs scored:       ${scores.length}`);
    logger.info(`Average score:     ${avgScore}`);
    logger.info(`Above threshold:   ${aboveThreshold} (>= ${this.config.thresholds.autoApplyMinScore})`);
    logger.info('');
    logger.info('TOP 5 MATCHES:');
    for (const job of topJobs) {
      logger.info(`  ${job.score}  ${job.title} @ ${job.company || 'Unknown'}`);
    }
    logger.info('='.repeat(50));
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
