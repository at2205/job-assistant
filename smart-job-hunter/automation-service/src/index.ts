import dotenv from 'dotenv';
dotenv.config();

import { Command } from 'commander';
import { SessionManager } from './auth/session-manager';
import { LoginHandler } from './auth/login-handler';
import { JobFetcher } from './jobs/job-fetcher';
import { ScoringEngine } from './matching/scoring-engine';
import { RankingService } from './matching/ranking-service';
import { FeatureExtractor } from './matching/feature-extractor';
import { createAIClient } from './ai/ai-client';
import { ResumeGenerator, CoverLetterGenerator, AnswerGenerator } from './ai/generators';
import { ApplyEngine } from './apply/apply-engine';
import { ApplicationTracker } from './apply/application-tracker';
import { scrapeLinkedInJobs, storeApifyResults } from './platforms/apify-integration';
import { runMigrations, closePool } from './db/postgres-client';
import { startApiServer } from './api/server';
import { batchAnalyze, getATSStats } from './optimization/ats-engine';
import logger from './utils/logger';

const program = new Command();

program
  .name('job-hunter')
  .description('Smart Job Hunter AI — Automation Service')
  .version('1.0.0');

program
  .command('login')
  .description('Login to a job platform and save session')
  .requiredOption('-p, --platform <platform>', 'Platform name (naukri, linkedin)')
  .action(async (opts) => {
    const sessionManager = new SessionManager();
    const loginHandler = new LoginHandler(sessionManager);

    const platform = opts.platform.toLowerCase();
    const credentials = getCredentials(platform);

    if (!credentials.email || !credentials.password) {
      logger.error(`Missing credentials for ${platform}. Set ${platform.toUpperCase()}_EMAIL and ${platform.toUpperCase()}_PASSWORD in .env`);
      process.exit(1);
    }

    try {
      const result = await loginHandler.login(platform, credentials);
      logger.info(`Result: ${result.message}`);

      if (result.success) {
        logger.info('Session saved. Future runs will skip login.');
      }
    } catch (err: any) {
      logger.error(`Fatal error: ${err.message}`);
    } finally {
      await sessionManager.close();
    }
  });

program
  .command('validate')
  .description('Check if a saved session is still valid')
  .requiredOption('-p, --platform <platform>', 'Platform name')
  .action(async (opts) => {
    const sessionManager = new SessionManager();
    const { getPlatformConfig } = require('./config/platforms');

    const platform = opts.platform.toLowerCase();
    const config = getPlatformConfig(platform);

    try {
      const page = await sessionManager.getPage();
      const valid = await sessionManager.validateSession(platform, config, page);
      logger.info(`Session for ${platform}: ${valid ? 'VALID' : 'EXPIRED / INVALID'}`);
    } catch (err: any) {
      logger.error(`Validation error: ${err.message}`);
    } finally {
      await sessionManager.close();
    }
  });

program
  .command('logout')
  .description('Delete saved session for a platform')
  .requiredOption('-p, --platform <platform>', 'Platform name')
  .action((opts) => {
    const sessionManager = new SessionManager();
    sessionManager.deleteSession(opts.platform.toLowerCase());
    logger.info(`Session deleted for ${opts.platform}`);
  });

// ============================================
// Phase 2: Job Fetching
// ============================================

program
  .command('fetch-jobs')
  .description('Scrape jobs from a platform and store in PostgreSQL')
  .requiredOption('-p, --platform <platform>', 'Platform (naukri, linkedin)')
  .requiredOption('-r, --role <role>', 'Job role to search (e.g. "Java Developer")')
  .option('-l, --location <location>', 'Location filter (e.g. "Delhi NCR")')
  .option('-e, --experience <experience>', 'Experience in years (e.g. "2" or "2-5")')
  .option('-u, --user-id <userId>', 'User ID for tracking')
  .option('--max-pages <pages>', 'Max pages to scrape', '5')
  .action(async (opts) => {
    const sessionManager = new SessionManager();

    try {
      // Run DB migrations first
      logger.info('Checking database schema...');
      await runMigrations();

      const fetcher = new JobFetcher(sessionManager);
      const result = await fetcher.fetchJobs({
        platform: opts.platform.toLowerCase(),
        role: opts.role,
        location: opts.location,
        experience: opts.experience,
        userId: opts.userId,
        maxPages: parseInt(opts.maxPages),
      });

      if (result.success) {
        logger.info(`Done! ${result.newJobs} new jobs stored.`);
      } else {
        logger.error('Job fetch completed with errors.');
        process.exitCode = 1;
      }
    } catch (err: any) {
      logger.error(`Fatal error: ${err.message}`);
      process.exitCode = 1;
    } finally {
      await sessionManager.close();
      await closePool();
    }
  });

program
  .command('migrate')
  .description('Run database migrations')
  .action(async () => {
    try {
      await runMigrations();
      logger.info('Migrations complete.');
    } catch (err: any) {
      logger.error(`Migration failed: ${err.message}`);
    } finally {
      await closePool();
    }
  });

// ============================================
// Phase 3: Job Scoring & Ranking
// ============================================

program
  .command('score-jobs')
  .description('Score unscored jobs for a user based on profile match')
  .requiredOption('-u, --user-id <userId>', 'User UUID')
  .option('--rescore', 'Rescore ALL active jobs (not just unscored)', false)
  .option('--batch-size <size>', 'Number of jobs to score per run', '200')
  .action(async (opts) => {
    try {
      await runMigrations();
      const engine = new ScoringEngine();

      const result = opts.rescore
        ? await engine.rescoreAllJobs(opts.userId)
        : await engine.scoreUnscoredJobs(opts.userId, parseInt(opts.batchSize));

      logger.info(`Scored ${result.jobsScored} jobs. Avg: ${result.avgScore}. Above threshold: ${result.aboveThreshold}`);
    } catch (err: any) {
      logger.error(`Scoring failed: ${err.message}`);
      process.exitCode = 1;
    } finally {
      await closePool();
    }
  });

program
  .command('rank-jobs')
  .description('Show ranked jobs for a user')
  .requiredOption('-u, --user-id <userId>', 'User UUID')
  .option('--min-score <score>', 'Minimum score to show', '50')
  .option('--limit <limit>', 'Max results', '20')
  .action(async (opts) => {
    try {
      await runMigrations();
      const ranking = new RankingService();
      const { jobs, stats } = await ranking.getRankedJobs(opts.userId, {
        minScore: parseInt(opts.minScore),
        limit: parseInt(opts.limit),
        scoreFirst: true,
      });

      logger.info(`\nStats: ${stats.totalScored} scored, avg ${stats.avgScore}, ${stats.aboveThreshold} above threshold`);
      logger.info(`Distribution: ${JSON.stringify(stats.scoreDistribution)}\n`);

      for (const job of jobs) {
        const flag = job.autoApplyEligible ? ' [AUTO-APPLY]' : '';
        logger.info(
          `#${job.rank} [${job.totalScore}] ${job.tier.toUpperCase()} — ${job.jobTitle} @ ${job.companyName || '?'}${flag}`
        );
        logger.info(`   Skills: ${job.skillScore} | Exp: ${job.experienceScore} | Loc: ${job.locationScore} | Sal: ${job.salaryScore} | Recent: ${job.recencyScore}`);
        logger.info(`   ${job.jobUrl || ''}`);
      }

      if (jobs.length === 0) {
        logger.info('No jobs found above the minimum score.');
      }
    } catch (err: any) {
      logger.error(`Ranking failed: ${err.message}`);
      process.exitCode = 1;
    } finally {
      await closePool();
    }
  });

program
  .command('explain-score')
  .description('Show detailed score breakdown for a specific job')
  .requiredOption('-u, --user-id <userId>', 'User UUID')
  .requiredOption('-j, --job-id <jobId>', 'Job UUID')
  .action(async (opts) => {
    try {
      await runMigrations();
      const ranking = new RankingService();
      const explanation = await ranking.explainJobRanking(opts.userId, opts.jobId);

      if (!explanation) {
        logger.error('Job not found.');
        return;
      }

      const s = explanation.score;
      logger.info(`\nJob Score: ${s.totalScore} (${explanation.tier})${explanation.autoApplyEligible ? ' [AUTO-APPLY ELIGIBLE]' : ''}`);
      logger.info(`\nBreakdown:`);
      logger.info(`  Skill:      ${s.skillScore.score}/100 — ${s.skillScore.reason}`);
      if (s.skillScore.matchedItems?.length) {
        logger.info(`              Matched: ${s.skillScore.matchedItems.join(', ')}`);
      }
      logger.info(`  Experience: ${s.experienceScore.score}/100 — ${s.experienceScore.reason}`);
      logger.info(`  Location:   ${s.locationScore.score}/100 — ${s.locationScore.reason}`);
      logger.info(`  Salary:     ${s.salaryScore.score}/100 — ${s.salaryScore.reason}`);
      logger.info(`  Recency:    ${s.recencyScore.score}/100 — ${s.recencyScore.reason}`);

      if (explanation.improvements.length > 0) {
        logger.info(`\nSuggestions:`);
        for (const imp of explanation.improvements) {
          logger.info(`  • ${imp}`);
        }
      }
    } catch (err: any) {
      logger.error(`Explain failed: ${err.message}`);
      process.exitCode = 1;
    } finally {
      await closePool();
    }
  });

// ============================================
// Phase 4: AI Content Generation
// ============================================

program
  .command('generate')
  .description('Generate tailored content for a job using AI')
  .requiredOption('-u, --user-id <userId>', 'User UUID')
  .requiredOption('-j, --job-id <jobId>', 'Job UUID')
  .requiredOption('-t, --type <type>', 'Content type: resume | cover_letter | answers')
  .option('-q, --question <question>', 'Application question (required for type=answers)')
  .option('--force', 'Force regeneration (ignore cache)', false)
  .option('--provider <provider>', 'Force a specific AI provider (ollama | groq | huggingface)')
  .action(async (opts) => {
    try {
      await runMigrations();

      const aiClient = createAIClient();
      if (opts.provider) {
        logger.info(`Forcing provider: ${opts.provider}`);
      }

      // Check available providers
      const available = await aiClient.getAvailableProviders();
      logger.info(`Available AI providers: ${available.join(', ') || 'NONE'}`);
      if (available.length === 0) {
        logger.error('No AI providers available. Start Ollama or set GROQ_API_KEY / HUGGINGFACE_API_KEY.');
        process.exitCode = 1;
        return;
      }

      // Load user + job features for prompt context
      const extractor = new FeatureExtractor();
      const userFeatures = await extractor.extractUserFeatures(opts.userId);
      const jobs = await extractor.extractJobsByIds([opts.jobId]);
      if (jobs.length === 0) {
        logger.error(`Job not found: ${opts.jobId}`);
        process.exitCode = 1;
        return;
      }

      // Get score for context enrichment
      const engine = new ScoringEngine();
      const score = engine.scoreOneJob(userFeatures, jobs[0]);

      const ctx = { user: userFeatures, job: jobs[0], score };
      const genOpts = { forceRegenerate: opts.force };

      let result: { content: string; cached: boolean; provider: string; qualityScore: number };

      switch (opts.type) {
        case 'resume':
          result = await new ResumeGenerator(aiClient).generate(ctx, opts.userId, genOpts);
          break;
        case 'cover_letter':
          result = await new CoverLetterGenerator(aiClient).generate(ctx, opts.userId, genOpts);
          break;
        case 'answers':
          if (!opts.question) {
            logger.error('--question is required for type=answers');
            process.exitCode = 1;
            return;
          }
          result = await new AnswerGenerator(aiClient).generate(ctx, opts.userId, opts.question, genOpts);
          break;
        default:
          logger.error(`Unknown type: ${opts.type}. Use: resume | cover_letter | answers`);
          process.exitCode = 1;
          return;
      }

      logger.info(`\n${'='.repeat(50)}`);
      logger.info(`Type: ${opts.type} | Provider: ${result.provider} | Quality: ${result.qualityScore}/100 | Cached: ${result.cached}`);
      logger.info('='.repeat(50));
      logger.info(`\n${result.content}\n`);
      logger.info('='.repeat(50));
    } catch (err: any) {
      logger.error(`Generation failed: ${err.message}`);
      process.exitCode = 1;
    } finally {
      await closePool();
    }
  });

program
  .command('ai-status')
  .description('Check which AI providers are currently available')
  .action(async () => {
    const aiClient = createAIClient();
    const available = await aiClient.getAvailableProviders();
    if (available.length === 0) {
      logger.info('No AI providers available.');
      logger.info('Setup options:');
      logger.info('  1. Ollama: Install & run `ollama serve`, then `ollama pull mistral`');
      logger.info('  2. Groq: Set GROQ_API_KEY in .env (free at console.groq.com)');
      logger.info('  3. HuggingFace: Set HUGGINGFACE_API_KEY in .env (free at huggingface.co)');
    } else {
      logger.info(`Available providers: ${available.join(', ')}`);
    }
  });

// ============================================
// Phase 5: Controlled Auto-Apply
// ============================================

program
  .command('auto-apply')
  .description('Apply to top-scoring jobs automatically')
  .requiredOption('-u, --user-id <userId>', 'User UUID')
  .requiredOption('-p, --platform <platform>', 'Platform (naukri)')
  .option('--dry-run', 'Fill forms but do NOT submit', false)
  .option('--no-manual-approval', 'Skip manual approval (auto-approve all)')
  .option('--max-daily <count>', 'Max applications per day', '15')
  .option('--min-score <score>', 'Min match score to apply', '75')
  .option('--max-per-run <count>', 'Max applications this run', '10')
  .action(async (opts) => {
    const sessionManager = new SessionManager();
    try {
      await runMigrations();

      const engine = new ApplyEngine(sessionManager, {
        dryRun: opts.dryRun,
        manualApproval: opts.manualApproval !== false,
        maxDailyApplications: parseInt(opts.maxDaily),
        minScoreThreshold: parseInt(opts.minScore),
        maxPerRun: parseInt(opts.maxPerRun),
      });

      const result = await engine.run(opts.userId, opts.platform.toLowerCase());

      // Print summary
      logger.info(`\nRun complete: ${result.applied} applied, ${result.failed} failed, ${result.skipped} skipped`);
      logger.info(`Today's total: ${result.dailyTotal}`);

      if (result.details.length > 0) {
        logger.info('\nDetails:');
        for (const d of result.details) {
          const icon = d.status === 'applied' ? '+' : d.status === 'failed' ? 'X' : '-';
          logger.info(`  [${icon}] ${d.jobTitle} @ ${d.company} (${d.score}) ${d.reason || ''}`);
        }
      }
    } catch (err: any) {
      logger.error(`Auto-apply failed: ${err.message}`);
      process.exitCode = 1;
    } finally {
      await sessionManager.close();
      await closePool();
    }
  });

program
  .command('apply-status')
  .description('Show application stats and history')
  .requiredOption('-u, --user-id <userId>', 'User UUID')
  .option('--pending', 'Show only pending approvals', false)
  .action(async (opts) => {
    try {
      await runMigrations();
      const tracker = new ApplicationTracker();

      if (opts.pending) {
        const pending = await tracker.getPendingApprovals(opts.userId);
        logger.info(`Pending approvals: ${pending.length}`);
        for (const app of pending) {
          logger.info(`  ${app.jobId} — ${app.status}`);
        }
      } else {
        const stats = await tracker.getStats(opts.userId);
        logger.info('\nApplication Stats:');
        logger.info(`  Total:     ${stats.total}`);
        logger.info(`  Applied:   ${stats.applied}`);
        logger.info(`  Failed:    ${stats.failed}`);
        logger.info(`  Pending:   ${stats.pending}`);
        logger.info(`  Today:     ${stats.todayCount}`);
      }
    } catch (err: any) {
      logger.error(`Status check failed: ${err.message}`);
      process.exitCode = 1;
    } finally {
      await closePool();
    }
  });

program
  .command('retry-failed')
  .description('Retry failed applications')
  .requiredOption('-u, --user-id <userId>', 'User UUID')
  .requiredOption('-p, --platform <platform>', 'Platform (naukri)')
  .option('--dry-run', 'Dry run mode', false)
  .action(async (opts) => {
    const sessionManager = new SessionManager();
    try {
      await runMigrations();
      const tracker = new ApplicationTracker();
      const retriable = await tracker.getRetriable(opts.userId);

      logger.info(`Found ${retriable.length} retriable applications`);

      if (retriable.length === 0) return;

      const engine = new ApplyEngine(sessionManager, {
        dryRun: opts.dryRun,
        manualApproval: true,
        maxPerRun: 5,
      });

      await engine.run(opts.userId, opts.platform.toLowerCase());
    } catch (err: any) {
      logger.error(`Retry failed: ${err.message}`);
      process.exitCode = 1;
    } finally {
      await sessionManager.close();
      await closePool();
    }
  });

// ============================================
// Apify Integration (Cloud Scraping)
// ============================================

program
  .command('apify-scrape')
  .description('Scrape jobs using Apify cloud actors (safer for LinkedIn)')
  .requiredOption('-p, --platform <platform>', 'Platform: linkedin')
  .requiredOption('-r, --role <role>', 'Job role (e.g. "Java Developer")')
  .option('-l, --location <location>', 'Location', 'India')
  .option('--max-results <count>', 'Max jobs to fetch', '50')
  .action(async (opts) => {
    try {
      await runMigrations();

      const platform = opts.platform.toLowerCase();
      if (platform !== 'linkedin') {
        logger.error('Apify scraping currently supports: linkedin');
        process.exitCode = 1;
        return;
      }

      logger.info(`Scraping ${platform} via Apify for: ${opts.role} in ${opts.location}`);

      const jobs = await scrapeLinkedInJobs({
        searchTerms: opts.role,
        location: opts.location || 'India',
        maxResults: parseInt(opts.maxResults),
      });

      const { inserted, skipped } = await storeApifyResults(jobs);
      logger.info(`Done! ${inserted} new jobs stored, ${skipped} duplicates skipped.`);
    } catch (err: any) {
      logger.error(`Apify scrape failed: ${err.message}`);
      process.exitCode = 1;
    } finally {
      await closePool();
    }
  });

// ============================================
// ATS Analysis + Interview Optimization
// ============================================

program
  .command('analyze')
  .description('Run ATS analysis and interview probability scoring on all scored jobs')
  .requiredOption('-u, --user-id <userId>', 'User UUID')
  .action(async (opts) => {
    try {
      await runMigrations();
      const { analyzed, highPriority } = await batchAnalyze(opts.userId);
      logger.info(`Analyzed ${analyzed} jobs. ${highPriority} HIGH priority.`);

      const stats = await getATSStats(opts.userId);
      logger.info(`\nATS ANALYSIS SUMMARY`);
      logger.info(`  Total analyzed: ${stats.analyzed}`);
      logger.info(`  HIGH priority:  ${stats.highPriority}`);
      logger.info(`  GOOD match:     ${stats.goodMatch}`);
      logger.info(`  Avg ATS score:  ${stats.avgATS}`);
      logger.info(`  Avg Interview:  ${stats.avgInterview}%`);
      if (stats.topMissing.length > 0) {
        logger.info(`\n  Top missing skills (learn these!):`);
        for (const skill of stats.topMissing.slice(0, 7)) {
          logger.info(`    - ${skill}`);
        }
      }
    } catch (err: any) {
      logger.error(`Analysis failed: ${err.message}`);
      process.exitCode = 1;
    } finally {
      await closePool();
    }
  });

// ============================================
// API Server
// ============================================

program
  .command('serve')
  .description('Start the API server for the dashboard')
  .option('--port <port>', 'Port to listen on', '8080')
  .action(async (opts) => {
    try {
      await runMigrations();
      startApiServer(parseInt(opts.port));
    } catch (err: any) {
      logger.error(`Server failed: ${err.message}`);
      process.exitCode = 1;
    }
  });

function getCredentials(platform: string): { email: string; password: string } {
  const prefix = platform.toUpperCase();
  return {
    email: process.env[`${prefix}_EMAIL`] || '',
    password: process.env[`${prefix}_PASSWORD`] || '',
  };
}

program.parse(process.argv);
