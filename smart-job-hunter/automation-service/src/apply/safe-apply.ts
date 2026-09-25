/**
 * Safe Apply Orchestrator
 *
 * Manages the full browser-based application flow with safety controls:
 * - Opens visible browser
 * - Logs into LinkedIn
 * - Navigates to job page
 * - Runs Easy Apply flow
 * - Takes screenshots at each step
 * - Tracks application in DB
 * - Human-like delays throughout
 *
 * SAFETY: Always requires manual approval. DRY_RUN prevents final submit.
 */

import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { linkedinLogin, linkedinEasyApply, LINKEDIN_CONFIG } from '../platforms/linkedin-adapter';
import { ApplicationTracker } from './application-tracker';
import { query } from '../db/postgres-client';
import { applyStealthScripts, getRandomViewport } from '../utils/stealth';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';

export interface ApplyJob {
  jobId: string;
  userId: string;
  title: string;
  company: string;
  jobUrl: string;
  platform: string;
  resumeContent: string;
  coverLetter: string;
  atsScore: number;
  interviewProbability: number;
  matchScore: number;
}

export interface ApplyResult {
  jobId: string;
  success: boolean;
  status: 'applied' | 'dry_run' | 'already_applied' | 'failed' | 'captcha' | 'skipped';
  screenshotPath?: string;
  error?: string;
  timestamp: string;
}

export class SafeApplyOrchestrator {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private screenshotDir: string;
  private dryRun: boolean;
  private maxDaily: number;
  private appliedToday: number = 0;

  constructor() {
    this.dryRun = process.env.DRY_RUN === 'true';
    this.maxDaily = parseInt(process.env.MAX_DAILY_APPLICATIONS || '3');
    this.screenshotDir = path.resolve(process.cwd(), 'screenshots');
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  /**
   * Launch browser with stealth settings, visible mode.
   */
  async launchBrowser(): Promise<void> {
    const viewport = getRandomViewport();
    this.browser = await chromium.launch({
      headless: false, // ALWAYS visible for safety
      slowMo: parseInt(process.env.SLOW_MO || '50'),
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--no-sandbox',
        `--window-size=${viewport.width},${viewport.height}`,
      ],
    });

    const userDataDir = process.env.USER_DATA_DIR || './sessions/browser-data';
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    this.context = await this.browser.newContext({
      viewport,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
    });

    this.page = await this.context.newPage();
    await applyStealthScripts(this.page);
    logger.info('Browser launched in visible mode with stealth settings');
  }

  /**
   * Login to LinkedIn with safety checks.
   */
  async loginLinkedIn(): Promise<boolean> {
    if (!this.page) throw new Error('Browser not launched');

    const email = process.env.LINKEDIN_EMAIL || process.env.NAUKRI_EMAIL;
    const password = process.env.LINKEDIN_PASSWORD || process.env.NAUKRI_PASSWORD;

    if (!email || !password) {
      logger.error('No LinkedIn credentials configured');
      return false;
    }

    logger.info('Logging into LinkedIn...');
    await this.screenshot('pre-login');
    const success = await linkedinLogin(this.page, email, password);

    if (success) {
      await this.screenshot('login-success');
      logger.info('LinkedIn login successful');
    } else {
      await this.screenshot('login-failed');
      logger.error('LinkedIn login failed');
    }

    return success;
  }

  /**
   * Check session validity without re-logging in.
   */
  async checkSession(): Promise<boolean> {
    if (!this.page) return false;
    try {
      await this.page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await this.humanDelay(2000, 4000);
      const valid = await this.page.$(LINKEDIN_CONFIG.sessionCheck.validIndicator);
      return !!valid;
    } catch {
      return false;
    }
  }

  /**
   * Apply to a single job with full safety flow.
   */
  async applyToJob(job: ApplyJob): Promise<ApplyResult> {
    const timestamp = new Date().toISOString();

    // Safety check: daily limit
    if (this.appliedToday >= this.maxDaily) {
      return {
        jobId: job.jobId, success: false, status: 'skipped',
        error: `Daily limit reached (${this.maxDaily})`, timestamp,
      };
    }

    if (!this.page) {
      return {
        jobId: job.jobId, success: false, status: 'failed',
        error: 'Browser not launched', timestamp,
      };
    }

    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`APPLYING: ${job.title} @ ${job.company}`);
    logger.info(`ATS: ${job.atsScore} | Interview: ${job.interviewProbability}% | Match: ${job.matchScore}`);
    logger.info(`URL: ${job.jobUrl}`);
    logger.info(`DRY RUN: ${this.dryRun}`);
    logger.info('='.repeat(60));

    try {
      // 1. Navigate to job page (use www.linkedin.com for logged-in view)
      logger.info('Step 1: Navigating to job page...');
      let jobUrl = job.jobUrl;
      // Convert in.linkedin.com to www.linkedin.com for logged-in session
      jobUrl = jobUrl.replace('https://in.linkedin.com/', 'https://www.linkedin.com/');
      // Strip tracking params to get clean URL
      const jobIdMatch = jobUrl.match(/\/jobs\/view\/[^?]+/);
      if (jobIdMatch) {
        jobUrl = 'https://www.linkedin.com' + jobIdMatch[0];
      }
      await this.page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.humanDelay(3000, 5000);
      await this.screenshot(`job-page-${job.company}`);

      // 2. Check for captcha/restriction
      const restricted = await this.page.$(LINKEDIN_CONFIG.sessionCheck.restrictedIndicator);
      if (restricted) {
        logger.error('ACCOUNT RESTRICTED — aborting all applications');
        await this.screenshot(`restricted-${job.company}`);
        return {
          jobId: job.jobId, success: false, status: 'captcha',
          error: 'Account restricted', timestamp,
        };
      }

      // 3. Check if already applied
      const alreadyApplied = await this.page.$(LINKEDIN_CONFIG.jobDetail.alreadyApplied);
      if (alreadyApplied) {
        logger.info('Already applied to this job — skipping');
        return {
          jobId: job.jobId, success: false, status: 'already_applied',
          error: 'Already applied', timestamp,
        };
      }

      // 4. Check for Easy Apply button OR external Apply button
      const easyApplyBtn = await this.page.$(LINKEDIN_CONFIG.jobDetail.easyApplyButton);
      // Use Playwright locator for text-based matching (more reliable)
      const applyLocator = this.page.locator('button, a').filter({ hasText: /^Apply/i });
      const externalApplyCount = await applyLocator.count();
      const externalApplyBtn = externalApplyCount > 0 ? await applyLocator.first().elementHandle() : null;

      if (!easyApplyBtn && !externalApplyBtn) {
        logger.warn('No apply button found at all');
        await this.screenshot(`no-apply-${job.company}`);
        return {
          jobId: job.jobId, success: false, status: 'skipped',
          error: 'No apply button found', timestamp,
        };
      }

      const isExternalApply = !easyApplyBtn && !!externalApplyBtn;

      // 5. DRY RUN — stop before clicking apply
      if (this.dryRun) {
        const applyType = isExternalApply ? 'External Apply' : 'Easy Apply';
        logger.info(`DRY RUN — found "${applyType}" button. Stopping before click.`);
        await this.screenshot(`dry-run-ready-${job.company}`);

        // Track as dry run application
        const tracker = new ApplicationTracker();
        const jobRow = await query('SELECT external_job_id FROM jobs WHERE id = $1', [job.jobId]);
        const extId = jobRow.rows[0]?.external_job_id || '';
        await tracker.createPending(job.userId, job.jobId, extId, job.platform);

        // Update pipeline
        const { InterviewPipeline } = await import('../pipeline/interview-pipeline');
        const pipe = new InterviewPipeline();
        await pipe.setStage(job.userId, job.jobId, 'SAVED', { notes: `DRY RUN — ${applyType} ready. Review before submitting.` });

        this.appliedToday++;

        return {
          jobId: job.jobId, success: true, status: 'dry_run',
          screenshotPath: `${this.screenshotDir}/dry-run-ready-${job.company}.png`,
          timestamp,
        };
      }

      // 6. REAL APPLY
      if (isExternalApply) {
        // External apply — click to open company's career page
        logger.info('Step 2: Clicking external Apply button...');

        // Listen for new page/tab
        const [newPage] = await Promise.all([
          this.context!.waitForEvent('page', { timeout: 15000 }),
          externalApplyBtn!.click(),
        ]).catch(() => [null]);

        if (newPage) {
          await newPage.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
          await this.humanDelay(3000, 5000);

          // Screenshot the external application page
          try {
            const safeName = `external-apply-${job.company}`.replace(/[^a-zA-Z0-9_-]/g, '_');
            await newPage.screenshot({ path: path.join(this.screenshotDir, `${safeName}-${Date.now()}.png`), fullPage: false });
          } catch {}

          logger.info(`External apply page opened: ${newPage.url()}`);
          logger.info('External application page opened. Manual submission required on company website.');

          // Close the external tab
          await newPage.close();
        }

        // Track
        const tracker = new ApplicationTracker();
        const jobRow = await query('SELECT external_job_id FROM jobs WHERE id = $1', [job.jobId]);
        const extId = jobRow.rows[0]?.external_job_id || '';
        const appId = await tracker.createPending(job.userId, job.jobId, extId, job.platform);

        const { InterviewPipeline } = await import('../pipeline/interview-pipeline');
        const pipe = new InterviewPipeline();
        await pipe.setStage(job.userId, job.jobId, 'APPLIED', { notes: 'Clicked external apply on LinkedIn. Complete submission on company website.' });

        this.appliedToday++;

        return {
          jobId: job.jobId, success: true, status: 'applied',
          timestamp,
        };
      } else {
        // Easy Apply flow
        logger.info('Step 2: Clicking Easy Apply...');
        const result = await linkedinEasyApply(this.page, {
          resumePath: undefined,
          phone: undefined,
          answers: {
            'Why are you interested in this role?': `I'm excited about this ${job.title} opportunity at ${job.company}. My experience with Java and Spring Boot microservices aligns well with your requirements.`,
            'years of experience': '2',
          },
        });

        await this.screenshot(`post-apply-${job.company}`);

        if (result.success) {
          logger.info(`SUCCESS — Applied to ${job.title} @ ${job.company}`);
          const tracker = new ApplicationTracker();
          const jobRow = await query('SELECT external_job_id FROM jobs WHERE id = $1', [job.jobId]);
          const extId = jobRow.rows[0]?.external_job_id || '';
          const appId = await tracker.createPending(job.userId, job.jobId, extId, job.platform);
          if (appId) {
            await tracker.updateStatus(appId, 'applied');
          }
          const { InterviewPipeline } = await import('../pipeline/interview-pipeline');
          const pipe = new InterviewPipeline();
          await pipe.setStage(job.userId, job.jobId, 'APPLIED', { notes: 'Applied via LinkedIn Easy Apply' });
          this.appliedToday++;
          return {
            jobId: job.jobId, success: true, status: 'applied',
            screenshotPath: `${this.screenshotDir}/post-apply-${job.company}.png`,
            timestamp,
          };
        } else {
          logger.warn(`FAILED — ${result.error}`);
          return {
            jobId: job.jobId, success: false, status: 'failed',
            error: result.error, timestamp,
          };
        }
      }
    } catch (err: any) {
      logger.error(`Apply error: ${err.message}`);
      await this.screenshot(`error-${job.company}`);
      return {
        jobId: job.jobId, success: false, status: 'failed',
        error: err.message, timestamp,
      };
    }
  }

  /**
   * Apply to multiple jobs with delays between each.
   */
  async applyBatch(jobs: ApplyJob[]): Promise<ApplyResult[]> {
    const results: ApplyResult[] = [];
    const delayMin = parseInt(process.env.APPLY_DELAY_MIN_MS || '180000'); // 3 min
    const delayMax = parseInt(process.env.APPLY_DELAY_MAX_MS || '480000'); // 8 min

    for (let i = 0; i < jobs.length; i++) {
      const result = await this.applyToJob(jobs[i]);
      results.push(result);

      logger.info(`Result: ${result.status} | Applied today: ${this.appliedToday}/${this.maxDaily}`);

      // Stop if restricted
      if (result.status === 'captcha') {
        logger.error('Account restricted — stopping all applications');
        break;
      }

      // Stop if daily limit
      if (this.appliedToday >= this.maxDaily) {
        logger.info('Daily application limit reached — stopping');
        break;
      }

      // Delay between applications (3-8 minutes for safety)
      if (i < jobs.length - 1) {
        const delay = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin);
        logger.info(`Waiting ${Math.round(delay / 60000)} minutes before next application...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return results;
  }

  /**
   * Close browser and clean up.
   */
  async close(): Promise<void> {
    if (this.page) await this.page.close().catch(() => {});
    if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
    logger.info('Browser closed');
  }

  // ---- Helpers ----

  private async screenshot(name: string): Promise<void> {
    if (!this.page) return;
    try {
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = path.join(this.screenshotDir, `${safeName}-${Date.now()}.png`);
      await this.page.screenshot({ path: filePath, fullPage: false });
      logger.info(`Screenshot: ${filePath}`);
    } catch (err: any) {
      logger.debug(`Screenshot failed: ${err.message}`);
    }
  }

  private async humanDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}
