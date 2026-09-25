import { RankingService, RankedJob } from '../matching/ranking-service';
import { ApplicationTracker } from './application-tracker';
import logger from '../utils/logger';

export interface ApplyConfig {
  maxDailyApplications: number;
  minScoreThreshold: number;
  manualApproval: boolean;
  dryRun: boolean;
  cooldownMinMs: number;
  cooldownMaxMs: number;
  maxPerRun: number;
}

const DEFAULT_APPLY_CONFIG: ApplyConfig = {
  maxDailyApplications: parseInt(process.env.MAX_DAILY_APPLICATIONS || '15'),
  minScoreThreshold: parseInt(process.env.AUTO_APPLY_MIN_SCORE || '75'),
  manualApproval: process.env.MANUAL_APPROVAL !== 'false',  // default ON
  dryRun: process.env.DRY_RUN === 'true',
  cooldownMinMs: 60_000,
  cooldownMaxMs: 180_000,
  maxPerRun: 10,
};

export interface ApplyCandidate {
  job: RankedJob;
  applicationId: string | null;
  reason?: string;
}

/**
 * Decides WHICH jobs to apply to and enforces safety limits.
 * Never touches the browser — only decides.
 */
export class ApplyStrategy {
  private tracker: ApplicationTracker;
  private ranking: RankingService;
  private config: ApplyConfig;

  constructor(config?: Partial<ApplyConfig>) {
    this.tracker = new ApplicationTracker();
    this.ranking = new RankingService();
    this.config = { ...DEFAULT_APPLY_CONFIG, ...config };
  }

  getConfig(): ApplyConfig {
    return { ...this.config };
  }

  /**
   * Get candidates for this apply run.
   * Filters by: score threshold, daily limit, not already applied, not duplicate.
   */
  async getCandidates(userId: string): Promise<{
    candidates: ApplyCandidate[];
    dailyRemaining: number;
    skippedReasons: Record<string, number>;
  }> {
    const todayCount = await this.tracker.countTodayApplications(userId);
    const dailyRemaining = Math.max(0, this.config.maxDailyApplications - todayCount);

    if (dailyRemaining === 0) {
      logger.warn(`Daily limit reached (${this.config.maxDailyApplications}). No more applications today.`);
      return { candidates: [], dailyRemaining: 0, skippedReasons: { daily_limit: 1 } };
    }

    const rankedJobs = await this.ranking.getAutoApplyCandidates(userId);
    logger.info(`Found ${rankedJobs.length} jobs above threshold (${this.config.minScoreThreshold})`);

    const candidates: ApplyCandidate[] = [];
    const skippedReasons: Record<string, number> = {};
    const limit = Math.min(dailyRemaining, this.config.maxPerRun);

    for (const job of rankedJobs) {
      if (candidates.length >= limit) break;

      const alreadyApplied = await this.tracker.hasApplied(userId, job.jobId);
      if (alreadyApplied) {
        skippedReasons['already_applied'] = (skippedReasons['already_applied'] || 0) + 1;
        continue;
      }

      if (!job.jobUrl) {
        skippedReasons['no_job_url'] = (skippedReasons['no_job_url'] || 0) + 1;
        continue;
      }

      const appId = await this.tracker.createPending(userId, job.jobId, job.jobId, 'naukri');
      if (!appId) {
        skippedReasons['duplicate_blocked'] = (skippedReasons['duplicate_blocked'] || 0) + 1;
        continue;
      }

      if (!this.config.manualApproval) {
        await this.tracker.updateStatus(appId, 'approved');
      }

      candidates.push({ job, applicationId: appId });
    }

    logger.info(`Candidates this run: ${candidates.length} (remaining today: ${dailyRemaining - candidates.length})`);
    if (Object.keys(skippedReasons).length > 0) {
      logger.info(`Skipped: ${JSON.stringify(skippedReasons)}`);
    }

    return { candidates, dailyRemaining: dailyRemaining - candidates.length, skippedReasons };
  }

  /**
   * Random cooldown between applications.
   */
  getRandomCooldown(): number {
    return this.config.cooldownMinMs +
      Math.floor(Math.random() * (this.config.cooldownMaxMs - this.config.cooldownMinMs));
  }
}
