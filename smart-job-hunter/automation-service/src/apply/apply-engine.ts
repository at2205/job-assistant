import { SessionManager } from '../auth/session-manager';
import { ApplyStrategy, ApplyCandidate, ApplyConfig } from './apply-strategy';
import { ApplicationTracker } from './application-tracker';
import { FormHandler, FormContent } from './form-handler';
import { ContentRepository } from '../db/content-repository';
import { FeatureExtractor } from '../matching/feature-extractor';
import { ScoringEngine } from '../matching/scoring-engine';
import { ResumeGenerator, CoverLetterGenerator, AnswerGenerator } from '../ai/generators';
import { createAIClient } from '../ai/ai-client';
import { getPlatformConfig } from '../config/platforms';
import { query } from '../db/postgres-client';
import logger from '../utils/logger';
import * as readline from 'readline';

export interface ApplyRunResult {
  applied: number;
  failed: number;
  skipped: number;
  dailyTotal: number;
  details: Array<{
    jobTitle: string;
    company: string | null;
    score: number;
    status: 'applied' | 'failed' | 'skipped';
    reason?: string;
  }>;
}

/**
 * The main auto-apply orchestrator.
 *
 * Pipeline per job:
 *   1. Validate session
 *   2. Navigate to job URL
 *   3. Generate/load AI content
 *   4. Fill form
 *   5. Submit (or dry-run)
 *   6. Record result
 *   7. Cooldown
 */
export class ApplyEngine {
  private sessionManager: SessionManager;
  private strategy: ApplyStrategy;
  private tracker: ApplicationTracker;
  private formHandler: FormHandler;
  private contentRepo: ContentRepository;

  constructor(sessionManager: SessionManager, config?: Partial<ApplyConfig>) {
    this.sessionManager = sessionManager;
    this.strategy = new ApplyStrategy(config);
    this.tracker = new ApplicationTracker();
    this.formHandler = new FormHandler();
    this.contentRepo = new ContentRepository();
  }

  /**
   * Run the full apply pipeline.
   */
  async run(userId: string, platform: string): Promise<ApplyRunResult> {
    const config = this.strategy.getConfig();
    const result: ApplyRunResult = {
      applied: 0,
      failed: 0,
      skipped: 0,
      dailyTotal: 0,
      details: [],
    };

    logger.info('='.repeat(50));
    logger.info('AUTO-APPLY ENGINE STARTING');
    logger.info(`Platform: ${platform} | User: ${userId}`);
    logger.info(`Mode: ${config.dryRun ? 'DRY RUN' : 'LIVE'} | Manual approval: ${config.manualApproval}`);
    logger.info(`Daily limit: ${config.maxDailyApplications} | Min score: ${config.minScoreThreshold}`);
    logger.info('='.repeat(50));

    // 1. Validate session
    logger.info('Validating session...');
    const page = await this.sessionManager.getPage();
    const platformConfig = getPlatformConfig(platform);
    const sessionValid = await this.sessionManager.validateSession(platform, platformConfig, page);

    if (!sessionValid) {
      logger.error('Session invalid. Please run `login` first.');
      return result;
    }
    logger.info('Session valid.');

    // 2. Get candidates
    const { candidates, dailyRemaining, skippedReasons } = await this.strategy.getCandidates(userId);

    if (candidates.length === 0) {
      logger.info('No candidates for this run.');
      return result;
    }

    logger.info(`\nCandidates to process: ${candidates.length}`);

    // 3. Process each candidate
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const jobTitle = candidate.job.jobTitle || 'Unknown';
      const company = candidate.job.companyName || 'Unknown';

      logger.info(`\n[${ i + 1}/${candidates.length}] ${jobTitle} @ ${company} (Score: ${candidate.job.totalScore})`);

      // Manual approval gate
      if (config.manualApproval) {
        const approved = await this.promptForApproval(candidate);
        if (!approved) {
          logger.info('Skipped by user.');
          if (candidate.applicationId) {
            await this.tracker.updateStatus(candidate.applicationId, 'skipped');
          }
          result.skipped++;
          result.details.push({ jobTitle, company, score: candidate.job.totalScore, status: 'skipped', reason: 'User declined' });
          continue;
        }
        if (candidate.applicationId) {
          await this.tracker.updateStatus(candidate.applicationId, 'approved');
        }
      }

      // Apply to this job
      try {
        if (candidate.applicationId) {
          await this.tracker.updateStatus(candidate.applicationId, 'applying');
        }

        const applyResult = await this.applyToJob(page, userId, candidate, platform, config.dryRun);

        if (applyResult.success) {
          result.applied++;
          if (candidate.applicationId) {
            await this.tracker.updateStatus(candidate.applicationId, 'applied', {
              resumeUsed: applyResult.resumeContent,
              coverLetterUsed: applyResult.coverLetterContent,
              platformConfirmation: applyResult.confirmation,
            });
          }
          result.details.push({ jobTitle, company, score: candidate.job.totalScore, status: 'applied' });
        } else {
          result.failed++;
          if (candidate.applicationId) {
            await this.tracker.updateStatus(candidate.applicationId, 'failed', {
              failureReason: applyResult.error,
            });
          }
          result.details.push({ jobTitle, company, score: candidate.job.totalScore, status: 'failed', reason: applyResult.error });
        }
      } catch (err: any) {
        logger.error(`Unexpected error: ${err.message}`);
        result.failed++;
        if (candidate.applicationId) {
          await this.tracker.updateStatus(candidate.applicationId, 'failed', {
            failureReason: err.message,
          });
        }
        result.details.push({ jobTitle, company, score: candidate.job.totalScore, status: 'failed', reason: err.message });
      }

      // Cooldown between applications
      if (i < candidates.length - 1) {
        const cooldown = this.strategy.getRandomCooldown();
        logger.info(`Cooling down for ${Math.round(cooldown / 1000)}s...`);
        await sleep(cooldown);
      }
    }

    // Final stats
    const stats = await this.tracker.getStats(userId);
    result.dailyTotal = stats.todayCount;

    logger.info('\n' + '='.repeat(50));
    logger.info('APPLY RUN COMPLETE');
    logger.info(`Applied: ${result.applied} | Failed: ${result.failed} | Skipped: ${result.skipped}`);
    logger.info(`Total today: ${result.dailyTotal}/${config.maxDailyApplications}`);
    logger.info('='.repeat(50));

    return result;
  }

  /**
   * Apply to a single job.
   */
  private async applyToJob(
    page: any,
    userId: string,
    candidate: ApplyCandidate,
    platform: string,
    dryRun: boolean
  ): Promise<{ success: boolean; error?: string; resumeContent?: string; coverLetterContent?: string; confirmation?: string }> {

    const jobUrl = candidate.job.jobUrl;
    if (!jobUrl) {
      return { success: false, error: 'No job URL' };
    }

    // 1. Navigate to job page
    logger.info(`Navigating to: ${jobUrl}`);
    try {
      await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(randomBetween(2000, 4000)); // human reading time
    } catch (err: any) {
      return { success: false, error: `Navigation failed: ${err.message}` };
    }

    // 2. Check for CAPTCHA
    const pageText = await page.textContent('body') || '';
    if (/captcha/i.test(pageText) || /not.*robot/i.test(pageText)) {
      logger.warn('CAPTCHA detected! Pausing for manual intervention...');
      // Wait up to 2 minutes for manual resolution
      await this.waitForCaptchaResolution(page, 120_000);
    }

    // 3. Load or generate AI content
    const content = await this.prepareContent(userId, candidate);

    // 4. Look for apply button and click it
    const applyClicked = await this.clickApplyButton(page);
    if (!applyClicked) {
      return { success: false, error: 'Could not find or click Apply button' };
    }
    await sleep(randomBetween(1500, 3000));

    // 5. Fill form
    const formResult = await this.formHandler.fillAndSubmit(page, content, {
      dryRun,
      screenshotDir: 'sessions/screenshots',
    });

    if (dryRun) {
      logger.info(`DRY RUN: Would have submitted ${formResult.fieldsFilled} fields`);
      return { success: true, resumeContent: content.coverLetter, confirmation: 'DRY_RUN' };
    }

    if (formResult.submitted) {
      return {
        success: true,
        resumeContent: content.coverLetter?.substring(0, 200),
        coverLetterContent: content.coverLetter,
        confirmation: 'submitted',
      };
    }

    return {
      success: false,
      error: `Form fill: ${formResult.fieldsFilled} filled, ${formResult.fieldsErrored} errors, submit=${formResult.submitted}`,
    };
  }

  /**
   * Prepare content for form filling — loads cached or generates new.
   */
  private async prepareContent(userId: string, candidate: ApplyCandidate): Promise<FormContent> {
    const content: FormContent = {};

    // Load user profile for basic fields
    const userRes = await query(
      `SELECT name, email, phone, experience_years, expected_salary_min FROM users WHERE id = $1`,
      [userId]
    );
    if (userRes.rowCount && userRes.rowCount > 0) {
      const u = userRes.rows[0];
      content.name = u.name;
      content.email = u.email;
      content.phone = u.phone;
      content.experienceYears = u.experience_years?.toString();
      content.expectedSalary = u.expected_salary_min?.toString();
    }

    // Load cached AI-generated content
    const cached = await this.contentRepo.getForJob(userId, candidate.job.jobId);
    for (const c of cached) {
      if (c.contentType === 'cover_letter') content.coverLetter = c.content;
      if (c.contentType === 'answers') {
        try {
          content.answers = JSON.parse(c.content);
        } catch {
          content.answers = { default: c.content };
        }
      }
    }

    // If no cover letter cached, try to generate one
    if (!content.coverLetter) {
      try {
        const extractor = new FeatureExtractor();
        const userFeatures = await extractor.extractUserFeatures(userId);
        const jobs = await extractor.extractJobsByIds([candidate.job.jobId]);
        if (jobs.length > 0) {
          const scoringEngine = new ScoringEngine();
          const score = scoringEngine.scoreOneJob(userFeatures, jobs[0]);
          const ctx = { user: userFeatures, job: jobs[0], score };

          const aiClient = createAIClient();
          const gen = new CoverLetterGenerator(aiClient);
          const result = await gen.generate(ctx, userId);
          content.coverLetter = result.content;
        }
      } catch (err: any) {
        logger.warn(`AI generation failed, proceeding without: ${err.message}`);
      }
    }

    return content;
  }

  /**
   * Click the main Apply/Apply Now button on the job listing page.
   */
  private async clickApplyButton(page: any): Promise<boolean> {
    const selectors = [
      'button:has-text("Apply")',
      'button:has-text("Apply Now")',
      'button:has-text("Easy Apply")',
      'a:has-text("Apply on company")',
      '[class*="apply" i] button',
      '#apply-button',
      '.apply-btn',
    ];

    for (const sel of selectors) {
      try {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible()) {
          await btn.scrollIntoViewIfNeeded();
          await sleep(randomBetween(500, 1000));
          await btn.click();
          logger.info(`Clicked apply button: ${sel}`);
          return true;
        }
      } catch {
        continue;
      }
    }

    logger.warn('No apply button found on page');
    return false;
  }

  /**
   * Wait for CAPTCHA to be resolved manually.
   */
  private async waitForCaptchaResolution(page: any, timeoutMs: number): Promise<void> {
    const start = Date.now();
    logger.info('Waiting for CAPTCHA resolution (check your browser)...');

    while (Date.now() - start < timeoutMs) {
      await sleep(5000);
      const text = await page.textContent('body') || '';
      if (!/captcha/i.test(text) && !/not.*robot/i.test(text)) {
        logger.info('CAPTCHA appears resolved.');
        return;
      }
    }

    logger.warn('CAPTCHA timeout — proceeding anyway.');
  }

  /**
   * Interactive prompt for manual approval.
   */
  private async promptForApproval(candidate: ApplyCandidate): Promise<boolean> {
    const job = candidate.job;

    console.log('\n' + '-'.repeat(40));
    console.log(`  Job:      ${job.jobTitle}`);
    console.log(`  Company:  ${job.companyName || 'Unknown'}`);
    console.log(`  Score:    ${job.totalScore} (${job.tier})`);
    console.log(`  Location: ${job.location || '?'}`);
    console.log(`  URL:      ${job.jobUrl || '?'}`);
    console.log('-'.repeat(40));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    return new Promise<boolean>((resolve) => {
      rl.question('  Apply? (y/n/q=quit): ', (answer) => {
        rl.close();
        const a = answer.trim().toLowerCase();
        if (a === 'q') {
          logger.info('User quit the approval loop.');
          process.exit(0);
        }
        resolve(a === 'y' || a === 'yes');
      });
    });
  }
}

// ============================================
// Utility
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
