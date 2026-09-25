import { Page } from 'playwright';
import { SessionManager } from '../auth/session-manager';
import { LoginHandler } from '../auth/login-handler';
import { getPlatformConfig, PlatformConfig } from '../config/platforms';
import { JobParser, RawJobData } from './job-parser';
import { JobNormalizer } from './job-normalizer';
import { DuplicateChecker } from './duplicate-checker';
import { JobRepository, JobRecord, UpsertResult } from '../db/job-repository';
import { randomDelay, sleep } from '../utils/retry';
import logger from '../utils/logger';

export interface FetchJobsParams {
  platform: string;
  userId?: string;
  role: string;          // "Java Developer", "Spring Boot"
  experience?: string;   // "2", "2-5"
  location?: string;     // "Delhi NCR"
  maxPages?: number;
}

export interface FetchJobsResult {
  success: boolean;
  totalScraped: number;
  newJobs: number;
  updatedJobs: number;
  skippedDuplicates: number;
  errors: number;
  pages: number;
  scrapeRunId?: string;
}

export class JobFetcher {
  private sessionManager: SessionManager;
  private loginHandler: LoginHandler;
  private parser: JobParser;
  private normalizer: JobNormalizer;
  private duplicateChecker: DuplicateChecker;
  private repository: JobRepository;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
    this.loginHandler = new LoginHandler(sessionManager);
    this.parser = new JobParser();
    this.normalizer = new JobNormalizer();
    this.repository = new JobRepository();
    this.duplicateChecker = new DuplicateChecker(this.repository);
  }

  /**
   * Main entry point: fetch jobs from a platform.
   *
   * Flow:
   * 1. Validate/restore session
   * 2. Navigate to search with filters
   * 3. Scrape pages (with pagination)
   * 4. Parse → Normalize → Dedup → Store
   * 5. Return summary
   */
  async fetchJobs(params: FetchJobsParams): Promise<FetchJobsResult> {
    const config = getPlatformConfig(params.platform);
    const maxPages = params.maxPages || parseInt(process.env.MAX_PAGES_PER_RUN || '5');

    const result: FetchJobsResult = {
      success: false,
      totalScraped: 0,
      newJobs: 0,
      updatedJobs: 0,
      skippedDuplicates: 0,
      errors: 0,
      pages: 0,
    };

    // Track scrape run in DB
    let scrapeRunId: string | undefined;
    try {
      scrapeRunId = await this.repository.createScrapeRun({
        user_id: params.userId || null,
        platform: params.platform,
        search_params: { role: params.role, experience: params.experience, location: params.location },
        jobs_found: 0,
        jobs_new: 0,
        jobs_updated: 0,
        jobs_skipped: 0,
        status: 'running',
      });
      result.scrapeRunId = scrapeRunId;
    } catch (err: any) {
      logger.warn(`Could not create scrape run record: ${err.message}`);
    }

    let page: Page | null = null;

    try {
      // Step 1: Ensure session is valid
      page = await this.ensureLoggedIn(params.platform, config);

      // Step 2: Navigate to search with filters
      await this.navigateToSearch(page, config, params);

      // Step 3: Paginate and scrape
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        logger.info(`--- Scraping page ${pageNum}/${maxPages} ---`);

        // Parse current page
        const rawJobs = await this.parser.parseJobCards(page);
        if (rawJobs.length === 0) {
          logger.info('No more jobs found. Stopping pagination.');
          break;
        }

        result.totalScraped += rawJobs.length;
        result.pages = pageNum;

        // Pre-filter duplicates
        const { newJobs, skippedCount } = await this.duplicateChecker.filterNew(
          params.platform,
          rawJobs
        );
        result.skippedDuplicates += skippedCount;

        // Normalize new jobs
        const normalizedJobs = this.normalizer.normalizeBatch(newJobs, params.platform);

        // Store in DB (upsert handles any remaining duplicates)
        if (normalizedJobs.length > 0) {
          const upsertResult = await this.repository.upsertJobs(normalizedJobs);
          result.newJobs += upsertResult.inserted;
          result.updatedJobs += upsertResult.updated;
          result.errors += upsertResult.errors;

          // Update cache
          this.duplicateChecker.markAsKnown(
            params.platform,
            normalizedJobs.map(j => j.external_job_id)
          );
        }

        // Check for next page
        if (pageNum < maxPages) {
          const hasNext = await this.parser.hasNextPage(page);
          if (!hasNext) {
            logger.info('No next page available. Done.');
            break;
          }

          // Human-like delay before next page
          const pageDelay = parseInt(process.env.PAGE_LOAD_DELAY_MS || '3000');
          await randomDelay(pageDelay, pageDelay * 2);

          const navigated = await this.parser.goToNextPage(page);
          if (!navigated) {
            logger.warn('Failed to navigate to next page. Stopping.');
            break;
          }

          // Wait after navigation
          await randomDelay(2000, 4000);
        }
      }

      result.success = true;

    } catch (err: any) {
      logger.error(`Job fetch failed: ${err.message}`);
      result.success = false;

      // Check if session expired mid-scrape
      if (err.message.includes('session') || err.message.includes('login')) {
        logger.warn('Session may have expired during scraping. Clearing saved session.');
        this.sessionManager.deleteSession(params.platform);
      }

      if (scrapeRunId) {
        await this.repository.completeScrapeRun(
          scrapeRunId,
          { jobs_found: result.totalScraped, jobs_new: result.newJobs, jobs_updated: result.updatedJobs, jobs_skipped: result.skippedDuplicates },
          'failed',
          err.message
        ).catch(() => {});
      }

      return result;
    }

    // Complete scrape run
    if (scrapeRunId) {
      await this.repository.completeScrapeRun(
        scrapeRunId,
        { jobs_found: result.totalScraped, jobs_new: result.newJobs, jobs_updated: result.updatedJobs, jobs_skipped: result.skippedDuplicates },
        'completed'
      ).catch(() => {});
    }

    this.logSummary(result);
    return result;
  }

  // ============================================
  // Private Methods
  // ============================================

  private async ensureLoggedIn(platform: string, config: PlatformConfig): Promise<Page> {
    const page = await this.sessionManager.getPage();

    // Try restoring session
    const isValid = await this.sessionManager.validateSession(platform, config, page);
    if (isValid) {
      logger.info('Session valid. Proceeding to scrape.');
      return page;
    }

    // Session invalid — re-login
    logger.info('Session invalid. Triggering login...');
    const credentials = {
      email: process.env[`${platform.toUpperCase()}_EMAIL`] || '',
      password: process.env[`${platform.toUpperCase()}_PASSWORD`] || '',
    };

    if (!credentials.email || !credentials.password) {
      throw new Error(`Missing credentials for ${platform} in .env`);
    }

    const loginResult = await this.loginHandler.login(platform, credentials);
    if (!loginResult.success) {
      throw new Error(`Login failed: ${loginResult.message}`);
    }

    return page;
  }

  /**
   * Navigate to platform's job search page with filters applied.
   * Uses URL-based search (more reliable than filling forms).
   */
  private async navigateToSearch(page: Page, config: PlatformConfig, params: FetchJobsParams): Promise<void> {
    if (params.platform === 'naukri') {
      await this.navigateNaukriSearch(page, params);
    } else {
      throw new Error(`Search navigation not implemented for: ${params.platform}`);
    }
  }

  private async navigateNaukriSearch(page: Page, params: FetchJobsParams): Promise<void> {
    // Build Naukri search URL (more reliable than form interaction)
    // Format: naukri.com/java-developer-jobs-in-delhi-ncr?experience=2
    const role = params.role.toLowerCase().replace(/\s+/g, '-');
    let searchUrl = `https://www.naukri.com/${role}-jobs`;

    if (params.location) {
      const loc = params.location.toLowerCase().replace(/\s+/g, '-');
      searchUrl += `-in-${loc}`;
    }

    const queryParams: string[] = [];
    if (params.experience) {
      queryParams.push(`experience=${params.experience}`);
    }
    // Sort by date for freshest listings
    queryParams.push('sortBy=date');

    if (queryParams.length > 0) {
      searchUrl += '?' + queryParams.join('&');
    }

    logger.info(`Navigating to: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await randomDelay(2000, 4000);

    // Scroll down to trigger lazy loading
    await this.simulateHumanScrolling(page);
  }

  /**
   * Scroll page like a human would browse — triggers lazy-loaded content.
   */
  private async simulateHumanScrolling(page: Page): Promise<void> {
    const scrollDelay = parseInt(process.env.SCROLL_DELAY_MS || '1500');

    for (let i = 0; i < 3; i++) {
      await page.evaluate((step) => {
        window.scrollBy(0, 300 + Math.random() * 400);
      }, i);
      await sleep(scrollDelay + Math.random() * 1000);
    }

    // Scroll back up slightly (human behavior)
    await page.evaluate(() => window.scrollBy(0, -100));
    await sleep(500);
  }

  private logSummary(result: FetchJobsResult): void {
    logger.info('='.repeat(50));
    logger.info('JOB FETCH SUMMARY');
    logger.info('='.repeat(50));
    logger.info(`Pages scraped:     ${result.pages}`);
    logger.info(`Total jobs found:  ${result.totalScraped}`);
    logger.info(`New jobs stored:   ${result.newJobs}`);
    logger.info(`Updated existing:  ${result.updatedJobs}`);
    logger.info(`Skipped (dupes):   ${result.skippedDuplicates}`);
    logger.info(`Errors:            ${result.errors}`);
    logger.info('='.repeat(50));
  }
}
