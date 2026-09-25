import { JobScoreRepository, StoredJobScore } from '../db/job-score-repository';
import { ScoringEngine } from './scoring-engine';
import { loadScoringConfig } from './weights-config';
import logger from '../utils/logger';

export interface RankedJob extends StoredJobScore {
  rank: number;
  tier: 'excellent' | 'good' | 'fair' | 'poor';
  autoApplyEligible: boolean;
}

export class RankingService {
  private scoreRepo: JobScoreRepository;
  private scoringEngine: ScoringEngine;
  private config = loadScoringConfig();

  constructor() {
    this.scoreRepo = new JobScoreRepository();
    this.scoringEngine = new ScoringEngine();
  }

  /**
   * Get ranked jobs list for a user.
   * Ensures scoring is done first (scores unscored jobs), then returns ranked list.
   */
  async getRankedJobs(
    userId: string,
    options: { minScore?: number; limit?: number; offset?: number; scoreFirst?: boolean } = {}
  ): Promise<{ jobs: RankedJob[]; stats: any }> {
    // Optionally score new jobs first
    if (options.scoreFirst !== false) {
      await this.scoringEngine.scoreUnscoredJobs(userId);
    }

    const minScore = options.minScore ?? this.config.thresholds.reviewMinScore;
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const scores = await this.scoreRepo.getTopJobs(userId, { minScore, limit, offset });
    const stats = await this.scoreRepo.getScoreStats(userId);

    const rankedJobs: RankedJob[] = scores.map((score, index) => ({
      ...score,
      rank: offset + index + 1,
      tier: this.getTier(score.totalScore),
      autoApplyEligible: score.totalScore >= this.config.thresholds.autoApplyMinScore,
    }));

    return { jobs: rankedJobs, stats };
  }

  /**
   * Get jobs ready for auto-apply (above threshold, not yet applied).
   */
  async getAutoApplyCandidates(userId: string): Promise<RankedJob[]> {
    const threshold = this.config.thresholds.autoApplyMinScore;
    const scores = await this.scoreRepo.getAutoApplyCandidates(userId, threshold);

    return scores.map((score, index) => ({
      ...score,
      rank: index + 1,
      tier: this.getTier(score.totalScore),
      autoApplyEligible: true,
    }));
  }

  /**
   * Get detailed explanation for why a job was ranked where it is.
   */
  async explainJobRanking(userId: string, jobId: string): Promise<{
    score: any;
    tier: string;
    autoApplyEligible: boolean;
    improvements: string[];
  } | null> {
    const score = await this.scoringEngine.explainScore(userId, jobId);
    if (!score) return null;

    const improvements = this.suggestImprovements(score);

    return {
      score,
      tier: this.getTier(score.totalScore),
      autoApplyEligible: score.totalScore >= this.config.thresholds.autoApplyMinScore,
      improvements,
    };
  }

  /**
   * Suggest what the user could do to improve match with a specific job.
   */
  private suggestImprovements(score: any): string[] {
    const suggestions: string[] = [];

    if (score.skillScore.score < 60) {
      const missing = score.skillScore.reason;
      suggestions.push(`Skill gap: ${missing}. Consider learning missing skills or highlighting related experience.`);
    }

    if (score.experienceScore.score < 70) {
      suggestions.push(`Experience gap: ${score.experienceScore.reason}`);
    }

    if (score.locationScore.score < 60) {
      suggestions.push(`Location mismatch: ${score.locationScore.reason}. Consider widening your location preferences.`);
    }

    if (score.salaryScore.score < 60) {
      suggestions.push(`Salary gap: ${score.salaryScore.reason}`);
    }

    return suggestions;
  }

  private getTier(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 50) return 'fair';
    return 'poor';
  }
}
