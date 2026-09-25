// =============================================
// Express API Server — connects frontend to automation-service
// =============================================
// Endpoints match what frontend/src/lib/api.ts expects:
//   GET  /api/dashboard/stats
//   GET  /api/jobs/ranked
//   GET  /api/jobs/:id
//   GET  /api/jobs/:id/score
//   GET  /api/content
//   POST /api/content/generate
//   GET  /api/applications
//   POST /api/applications/:id/approve
//   POST /api/applications/:id/skip
//   POST /api/applications/apply
//   GET  /api/settings
//   PUT  /api/settings
// =============================================

import express from 'express';
import cors from 'cors';
import { query } from '../db/postgres-client';
import { ScoringEngine } from '../matching/scoring-engine';
import { RankingService } from '../matching/ranking-service';
import { FeatureExtractor } from '../matching/feature-extractor';
import { ContentRepository } from '../db/content-repository';
import { ApplicationTracker } from '../apply/application-tracker';
import { JobScoreRepository } from '../db/job-score-repository';
import { createAIClient } from '../ai/ai-client';
import { ResumeGenerator, CoverLetterGenerator, AnswerGenerator } from '../ai/generators';
import { batchAnalyze, getATSStats, getATSAnalysis } from '../optimization/ats-engine';
import { checkApplicationQuality } from '../optimization/quality-gate';
import { InterviewPipeline, PipelineStage } from '../pipeline/interview-pipeline';
import { RecruiterManager } from '../pipeline/recruiter-manager';
import { FollowUpEngine } from '../pipeline/follow-up-engine';
import { InterviewPrepEngine } from '../pipeline/interview-prep';
import { CompanyIntelService } from '../pipeline/company-intel';
import { RejectionAnalyzer } from '../pipeline/rejection-analyzer';
import { ReminderService } from '../pipeline/reminder-service';
import { WeeklyReportGenerator } from '../pipeline/weekly-report';
import { CareerCoach } from '../pipeline/career-coach';
import { ApplicationAnalytics } from '../pipeline/application-analytics';
import { SafeApplyOrchestrator, ApplyJob } from '../apply/safe-apply';
import logger from '../utils/logger';

const app = express();
app.use(cors());
app.use(express.json());

// ---- Dashboard Stats ----
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const scoreRepo = new JobScoreRepository();
    const tracker = new ApplicationTracker();

    const [scoreStats, appStats, totalJobs] = await Promise.all([
      scoreRepo.getScoreStats(userId),
      tracker.getStats(userId),
      query('SELECT COUNT(*) AS cnt FROM jobs'),
    ]);

    // Try to get ATS stats (may not exist yet)
    let atsStats = null;
    try { atsStats = await getATSStats(userId); } catch {}

    res.json({
      totalJobs: parseInt(totalJobs.rows[0].cnt),
      scoredJobs: scoreStats.totalScored,
      avgScore: scoreStats.avgScore,
      aboveThreshold: scoreStats.aboveThreshold,
      totalApplications: appStats.total,
      appliedToday: appStats.todayCount,
      successRate: appStats.total > 0 ? Math.round((appStats.applied / appStats.total) * 100) : 0,
      scoreDistribution: scoreStats.scoreDistribution,
      ats: atsStats,
    });
  } catch (err: any) {
    logger.error(`Dashboard stats error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Ranked Jobs ----
app.get('/api/jobs/ranked', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const minScore = parseInt(req.query.minScore as string) || 0;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const ranking = new RankingService();
    const { jobs, stats } = await ranking.getRankedJobs(userId, {
      minScore,
      limit,
      offset,
      scoreFirst: false, // don't auto-score on every API call
    });

    // Map to frontend format
    const mapped = jobs.map(j => ({
      id: j.jobId,
      externalJobId: '',
      title: j.jobTitle || 'Unknown',
      companyName: j.companyName || null,
      location: j.location || null,
      experienceMin: null,
      experienceMax: null,
      salaryMin: null,
      salaryMax: null,
      skills: [],
      jobDescription: null,
      jobUrl: j.jobUrl || null,
      postedDate: null,
      scrapedAt: j.scoredAt,
      sourcePlatform: 'linkedin',
      isActive: true,
      score: {
        id: j.id,
        userId: j.userId,
        jobId: j.jobId,
        totalScore: j.totalScore,
        skillScore: j.skillScore,
        experienceScore: j.experienceScore,
        locationScore: j.locationScore,
        salaryScore: j.salaryScore,
        recencyScore: j.recencyScore,
        scoreBreakdown: j.scoreBreakdown,
        scoredAt: j.scoredAt,
      },
      rank: j.rank,
      tier: j.tier,
      autoApplyEligible: j.autoApplyEligible,
    }));

    res.json({ jobs: mapped, total: stats.totalScored });
  } catch (err: any) {
    logger.error(`Ranked jobs error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Prioritized jobs (MUST be before /api/jobs/:id) ----
app.get('/api/jobs/prioritized', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const priority = req.query.priority as string;
    const limit = parseInt(req.query.limit as string) || 20;

    let sql = `SELECT js.*, j.title AS job_title, j.company_name, j.job_url, j.location,
                      a.ats_score, a.keyword_match_pct, a.matched_keywords, a.missing_keywords,
                      a.priority, a.interview_probability, a.skip_reason
               FROM job_scores js
               JOIN jobs j ON j.id = js.job_id
               LEFT JOIN ats_analysis a ON a.job_id = js.job_id AND a.user_id = js.user_id
               WHERE js.user_id = $1`;
    const params: any[] = [userId];

    if (priority) {
      sql += ` AND a.priority = $2`;
      params.push(priority);
    } else {
      sql += ` AND (a.priority IS NULL OR a.priority != 'SKIP')`;
    }

    sql += ` ORDER BY COALESCE(a.interview_probability, 0) DESC, js.total_score DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(sql, params);

    res.json(result.rows.map((r: any) => ({
      jobId: r.job_id,
      title: r.job_title,
      company: r.company_name,
      location: r.location,
      jobUrl: r.job_url,
      totalScore: parseFloat(r.total_score),
      atsScore: r.ats_score ? parseFloat(r.ats_score) : null,
      keywordMatchPct: r.keyword_match_pct ? parseFloat(r.keyword_match_pct) : null,
      matchedKeywords: r.matched_keywords || [],
      missingKeywords: r.missing_keywords || [],
      priority: r.priority || 'UNANALYZED',
      interviewProbability: r.interview_probability ? parseFloat(r.interview_probability) : null,
      skipReason: r.skip_reason,
    })));
  } catch (err: any) {
    logger.error(`Prioritized jobs error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Job Detail ----
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM jobs WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const row = result.rows[0];
    res.json({
      id: row.id,
      externalJobId: row.external_job_id,
      title: row.title,
      companyName: row.company_name,
      location: row.location,
      experienceMin: row.experience_min,
      experienceMax: row.experience_max,
      salaryMin: row.salary_min,
      salaryMax: row.salary_max,
      skills: row.skills || [],
      jobDescription: row.job_description,
      jobUrl: row.job_url,
      postedDate: row.posted_date,
      scrapedAt: row.scraped_at,
      sourcePlatform: row.source_platform,
      isActive: row.is_active !== false,
    });
  } catch (err: any) {
    logger.error(`Job detail error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Job Score ----
app.get('/api/jobs/:id/score', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const engine = new ScoringEngine();
    const score = await engine.explainScore(userId, req.params.id);

    if (!score) return res.status(404).json({ error: 'Score not found' });

    res.json(score);
  } catch (err: any) {
    logger.error(`Job score error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Generated Content ----
app.get('/api/content', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const jobId = req.query.jobId as string;
    if (!userId || !jobId) return res.status(400).json({ error: 'userId and jobId required' });

    const repo = new ContentRepository();
    const content = await repo.getForJob(userId, jobId);

    res.json(content.map(c => ({
      id: c.id,
      contentType: c.contentType,
      content: c.content,
      providerUsed: c.providerUsed,
      qualityScore: c.qualityScore,
      createdAt: c.createdAt,
    })));
  } catch (err: any) {
    logger.error(`Content fetch error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Generate Content ----
app.post('/api/content/generate', async (req, res) => {
  try {
    const { userId, jobId, type, force } = req.body;
    if (!userId || !jobId || !type) return res.status(400).json({ error: 'userId, jobId, type required' });

    const aiClient = createAIClient();
    const available = await aiClient.getAvailableProviders();
    if (available.length === 0) {
      return res.status(503).json({ error: 'No AI providers available. Start Ollama or set GROQ_API_KEY.' });
    }

    const extractor = new FeatureExtractor();
    const userFeatures = await extractor.extractUserFeatures(userId);
    const jobs = await extractor.extractJobsByIds([jobId]);
    if (jobs.length === 0) return res.status(404).json({ error: 'Job not found' });

    const engine = new ScoringEngine();
    const score = engine.scoreOneJob(userFeatures, jobs[0]);
    const ctx = { user: userFeatures, job: jobs[0], score };
    const genOpts = { forceRegenerate: force || false };

    let result: any;
    switch (type) {
      case 'resume':
        result = await new ResumeGenerator(aiClient).generate(ctx, userId, genOpts);
        break;
      case 'cover_letter':
        result = await new CoverLetterGenerator(aiClient).generate(ctx, userId, genOpts);
        break;
      case 'answers':
        result = await new AnswerGenerator(aiClient).generate(ctx, userId, 'Why do you want this role?', genOpts);
        break;
      default:
        return res.status(400).json({ error: `Unknown type: ${type}` });
    }

    res.json({
      id: 'generated',
      contentType: type,
      content: result.content,
      providerUsed: result.provider,
      qualityScore: result.qualityScore,
      createdAt: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error(`Content generate error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Applications ----
app.get('/api/applications', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const status = req.query.status as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    let sql = `SELECT ja.*, j.title AS job_title, j.company_name, js.total_score
               FROM job_applications ja
               JOIN jobs j ON j.id = ja.job_id
               LEFT JOIN job_scores js ON js.job_id = ja.job_id AND js.user_id = ja.user_id
               WHERE ja.user_id = $1`;
    const params: any[] = [userId];

    if (status) {
      sql += ` AND ja.status = $2`;
      params.push(status);
    }

    sql += ` ORDER BY ja.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    const countResult = await query(
      `SELECT COUNT(*) AS cnt FROM job_applications WHERE user_id = $1${status ? ' AND status = $2' : ''}`,
      status ? [userId, status] : [userId]
    );

    res.json({
      applications: result.rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        jobId: row.job_id,
        status: row.status,
        resumeUsed: row.resume_used,
        coverLetterUsed: row.cover_letter_used,
        appliedAt: row.applied_at,
        failureReason: row.failure_reason,
        retryCount: row.retry_count,
        createdAt: row.created_at,
        jobTitle: row.job_title,
        companyName: row.company_name,
        totalScore: row.total_score ? parseFloat(row.total_score) : null,
      })),
      total: parseInt(countResult.rows[0].cnt),
    });
  } catch (err: any) {
    logger.error(`Applications error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Approve Application ----
app.post('/api/applications/:id/approve', async (req, res) => {
  try {
    const tracker = new ApplicationTracker();
    await tracker.updateStatus(req.params.id, 'approved');
    res.json({ success: true });
  } catch (err: any) {
    logger.error(`Approve error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Skip Application ----
app.post('/api/applications/:id/skip', async (req, res) => {
  try {
    const tracker = new ApplicationTracker();
    await tracker.updateStatus(req.params.id, 'skipped');
    res.json({ success: true });
  } catch (err: any) {
    logger.error(`Skip error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Trigger Apply (dry-run or real) ----
app.post('/api/applications/apply', async (req, res) => {
  try {
    const { userId, jobId } = req.body;
    if (!userId || !jobId) return res.status(400).json({ error: 'userId, jobId required' });

    // Create a pending application
    const tracker = new ApplicationTracker();

    // Get job info
    const jobResult = await query('SELECT external_job_id, source_platform FROM jobs WHERE id = $1', [jobId]);
    if (jobResult.rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const job = jobResult.rows[0];
    const appId = await tracker.createPending(userId, jobId, job.external_job_id, job.source_platform);

    if (!appId) {
      return res.status(409).json({ error: 'Already applied to this job' });
    }

    res.json({
      id: appId,
      userId,
      jobId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error(`Apply error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Settings ----
app.get('/api/settings', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    // Return current settings from env/defaults
    res.json({
      autoApplyEnabled: false,
      manualApproval: process.env.MANUAL_APPROVAL !== 'false',
      maxDailyApplications: parseInt(process.env.MAX_DAILY_APPLICATIONS || '5'),
      minScoreThreshold: parseInt(process.env.AUTO_APPLY_MIN_SCORE || '80'),
      dryRunMode: process.env.DRY_RUN !== 'false',
      preferredAiProvider: process.env.AI_PROVIDER || 'groq',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    // Settings are env-based for now. Return what was sent.
    const { userId, ...settings } = req.body;
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Scrape trigger (for dashboard) ----
app.post('/api/scrape', async (req, res) => {
  try {
    const { platform, role, location, maxResults } = req.body;

    const { scrapeLinkedInJobs, storeApifyResults } = await import('../platforms/apify-integration');
    const jobs = await scrapeLinkedInJobs({
      searchTerms: role || 'Java Developer',
      location: location || 'India',
      maxResults: maxResults || 50,
    });

    const { inserted, skipped } = await storeApifyResults(jobs);
    res.json({ inserted, skipped, total: jobs.length });
  } catch (err: any) {
    logger.error(`Scrape error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Score trigger ----
app.post('/api/score', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const engine = new ScoringEngine();
    const result = await engine.scoreUnscoredJobs(userId);
    res.json(result);
  } catch (err: any) {
    logger.error(`Score error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- ATS Analysis trigger ----
app.post('/api/analyze', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const result = await batchAnalyze(userId);
    const stats = await getATSStats(userId);
    res.json({ ...result, stats });
  } catch (err: any) {
    logger.error(`Analyze error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- ATS Stats (MUST be before /api/ats/:jobId) ----
app.get('/api/ats/stats', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const stats = await getATSStats(userId);
    res.json(stats);
  } catch (err: any) {
    logger.error(`ATS stats error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- ATS Analysis for a single job ----
app.get('/api/ats/:jobId', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const analysis = await getATSAnalysis(userId, req.params.jobId);
    if (!analysis) return res.status(404).json({ error: 'Not analyzed yet' });
    res.json(analysis);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Application Quality Check ----
app.post('/api/quality-check', async (req, res) => {
  try {
    const { userId, jobId } = req.body;
    if (!userId || !jobId) return res.status(400).json({ error: 'userId and jobId required' });

    // Auto-fetch totalScore from DB
    const scoreRow = await query('SELECT total_score FROM job_scores WHERE user_id = $1 AND job_id = $2', [userId, jobId]);
    const totalScore = scoreRow.rows[0]?.total_score ?? 0;

    const result = await checkApplicationQuality(userId, jobId, totalScore);
    res.json(result);
  } catch (err: any) {
    logger.error(`Quality check error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// CAREER OPERATING SYSTEM ENDPOINTS
// =============================================

// ---- Interview Pipeline ----
app.get('/api/pipeline', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const stage = req.query.stage as PipelineStage | undefined;
    const pipeline = new InterviewPipeline();
    const entries = await pipeline.getAll(userId, stage);
    res.json(entries);
  } catch (err: any) {
    logger.error(`Pipeline error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pipeline/analytics', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const pipeline = new InterviewPipeline();
    const analytics = await pipeline.getAnalytics(userId);
    res.json(analytics);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pipeline/:jobId/history', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const pipeline = new InterviewPipeline();
    const entry = await pipeline.getEntry(userId, req.params.jobId);
    if (!entry) return res.status(404).json({ error: 'Not in pipeline' });
    const history = await pipeline.getHistory(entry.id);
    res.json({ entry, history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pipeline/stage', async (req, res) => {
  try {
    const { userId, jobId, stage, notes, feedback, applicationId } = req.body;
    if (!userId || !jobId || !stage) return res.status(400).json({ error: 'userId, jobId, stage required' });
    const pipeline = new InterviewPipeline();
    const entry = await pipeline.setStage(userId, jobId, stage, { applicationId, notes, feedback });
    res.json(entry);
  } catch (err: any) {
    logger.error(`Pipeline stage error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pipeline/detect-ghosted', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const pipeline = new InterviewPipeline();
    const count = await pipeline.markGhosted(userId);
    res.json({ ghosted: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Recruiters ----
app.get('/api/recruiters', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const mgr = new RecruiterManager();
    const recruiters = await mgr.getAll(userId);
    res.json(recruiters);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/recruiters/top', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const mgr = new RecruiterManager();
    res.json(await mgr.getTopRecruiters(userId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/recruiters/:id', async (req, res) => {
  try {
    const mgr = new RecruiterManager();
    const recruiter = await mgr.getById(req.params.id);
    if (!recruiter) return res.status(404).json({ error: 'Not found' });
    const interactions = await mgr.getInteractions(req.params.id);
    res.json({ recruiter, interactions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/recruiters', async (req, res) => {
  try {
    const { userId, ...data } = req.body;
    if (!userId || !data.name) return res.status(400).json({ error: 'userId and name required' });
    const mgr = new RecruiterManager();
    const recruiter = await mgr.create(userId, data);
    res.json(recruiter);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/recruiters/:id', async (req, res) => {
  try {
    const mgr = new RecruiterManager();
    const updated = await mgr.update(req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/recruiters/:id/interactions', async (req, res) => {
  try {
    const { userId, ...data } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const mgr = new RecruiterManager();
    const interaction = await mgr.addInteraction({ ...data, recruiterId: req.params.id, userId });
    res.json(interaction);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Follow-ups ----
app.get('/api/follow-ups', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const status = req.query.status as string | undefined;
    const engine = new FollowUpEngine();
    res.json(await engine.getDrafts(userId, status));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/follow-ups/generate', async (req, res) => {
  try {
    const { userId, type, ...context } = req.body;
    if (!userId || !type) return res.status(400).json({ error: 'userId and type required' });
    const engine = new FollowUpEngine();
    const draft = await engine.generateDraft(userId, type, context);
    res.json(draft);
  } catch (err: any) {
    logger.error(`Follow-up generate error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/follow-ups/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const engine = new FollowUpEngine();
    await engine.updateStatus(req.params.id, status);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/follow-ups/:id', async (req, res) => {
  try {
    const { content, subject } = req.body;
    const engine = new FollowUpEngine();
    await engine.updateContent(req.params.id, content, subject);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Interview Prep ----
app.get('/api/prep/:jobId', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const engine = new InterviewPrepEngine();
    res.json(await engine.getAllForJob(userId, req.params.jobId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prep/generate', async (req, res) => {
  try {
    const { userId, jobId, prepType, force } = req.body;
    if (!userId || !jobId || !prepType) return res.status(400).json({ error: 'userId, jobId, prepType required' });

    // Get job context
    const jobRes = await query('SELECT title, company_name, skills, job_description FROM jobs WHERE id = $1', [jobId]);
    if (jobRes.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    const j = jobRes.rows[0];

    const engine = new InterviewPrepEngine();
    const result = await engine.generate(userId, jobId, prepType, {
      jobTitle: j.title, companyName: j.company_name,
      skills: j.skills || [], jobDescription: j.job_description,
    }, force);
    res.json(result);
  } catch (err: any) {
    logger.error(`Prep generate error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prep/full', async (req, res) => {
  try {
    const { userId, jobId } = req.body;
    if (!userId || !jobId) return res.status(400).json({ error: 'userId and jobId required' });
    const jobRes = await query('SELECT title, company_name, skills, job_description FROM jobs WHERE id = $1', [jobId]);
    if (jobRes.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    const j = jobRes.rows[0];
    const engine = new InterviewPrepEngine();
    const results = await engine.generateFullPrep(userId, jobId, {
      jobTitle: j.title, companyName: j.company_name,
      skills: j.skills || [], jobDescription: j.job_description,
    });
    res.json(results);
  } catch (err: any) {
    logger.error(`Full prep error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Company Intelligence ----
app.get('/api/companies', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const svc = new CompanyIntelService();
    res.json(await svc.getAll(userId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/companies/high-responders', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const svc = new CompanyIntelService();
    res.json(await svc.getHighResponders(userId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/companies/refresh', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const svc = new CompanyIntelService();
    const count = await svc.refreshAll(userId);
    res.json({ companies: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Rejection Analysis ----
app.get('/api/rejections', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const analyzer = new RejectionAnalyzer();
    res.json(await analyzer.getAll(userId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/rejections/patterns', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const analyzer = new RejectionAnalyzer();
    res.json(await analyzer.getPatterns(userId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rejections/analyze', async (req, res) => {
  try {
    const { userId, jobId } = req.body;
    if (!userId || !jobId) return res.status(400).json({ error: 'userId and jobId required' });
    const analyzer = new RejectionAnalyzer();
    res.json(await analyzer.analyze(userId, jobId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rejections/batch', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const analyzer = new RejectionAnalyzer();
    res.json(await analyzer.batchAnalyze(userId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Reminders / Calendar ----
app.get('/api/reminders', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const svc = new ReminderService();
    res.json(await svc.getAll(userId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reminders/upcoming', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const days = parseInt(req.query.days as string) || 7;
    const svc = new ReminderService();
    res.json(await svc.getUpcoming(userId, days));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reminders/overdue', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const svc = new ReminderService();
    res.json(await svc.getOverdue(userId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reminders', async (req, res) => {
  try {
    const svc = new ReminderService();
    const reminder = await svc.create(req.body);
    res.json(reminder);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reminders/:id/complete', async (req, res) => {
  try {
    const svc = new ReminderService();
    await svc.complete(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/reminders/:id', async (req, res) => {
  try {
    const svc = new ReminderService();
    await svc.delete(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reminders/ical', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const svc = new ReminderService();
    const ical = await svc.exportICal(userId);
    res.type('text/calendar').send(ical);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Application Analytics ----
app.get('/api/analytics', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const svc = new ApplicationAnalytics();
    res.json(await svc.getSummary(userId));
  } catch (err: any) {
    logger.error(`Analytics error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Weekly Reports ----
app.get('/api/reports/weekly', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const gen = new WeeklyReportGenerator();
    res.json(await gen.getHistory(userId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reports/weekly/generate', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const gen = new WeeklyReportGenerator();
    res.json(await gen.generate(userId));
  } catch (err: any) {
    logger.error(`Weekly report error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Career Coach ----
app.get('/api/coach/readiness', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const coach = new CareerCoach();
    const score = await coach.getLatestReadiness(userId);
    res.json({ readinessScore: score });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/coach/history', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const type = req.query.type as string | undefined;
    const coach = new CareerCoach();
    res.json(await coach.getHistory(userId, type as any));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/coach/advice', async (req, res) => {
  try {
    const { userId, type } = req.body;
    if (!userId || !type) return res.status(400).json({ error: 'userId and type required' });
    const coach = new CareerCoach();
    res.json(await coach.getAdvice(userId, type));
  } catch (err: any) {
    logger.error(`Coach error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Enrich jobs with real data ----
app.post('/api/jobs/enrich', async (req, res) => {
  try {
    const { jobs } = req.body; // [{id, skills, description, expMin, expMax}]
    if (!jobs?.length) return res.status(400).json({ error: 'jobs array required' });
    for (const j of jobs) {
      await query(
        `UPDATE jobs SET skills = $1::jsonb, job_description = $2, experience_min = $3, experience_max = $4 WHERE id = $5`,
        [JSON.stringify(j.skills), j.description, j.expMin, j.expMax, j.id]
      );
    }
    res.json({ updated: jobs.length });
  } catch (err: any) {
    logger.error(`Enrich error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Force re-score specific jobs ----
app.post('/api/jobs/rescore', async (req, res) => {
  try {
    const { userId, jobIds } = req.body;
    if (!userId || !jobIds?.length) return res.status(400).json({ error: 'userId and jobIds required' });
    // Delete old scores and ATS analysis
    for (const id of jobIds) {
      await query('DELETE FROM job_scores WHERE user_id = $1 AND job_id = $2', [userId, id]);
      await query('DELETE FROM ats_analysis WHERE user_id = $1 AND job_id = $2', [userId, id]);
    }
    // Re-score
    const engine = new ScoringEngine();
    const scoreResult = await engine.scoreUnscoredJobs(userId);
    // Re-analyze
    const atsResult = await batchAnalyze(userId);
    const stats = await getATSStats(userId);
    res.json({ rescored: jobIds.length, scoring: scoreResult, ats: atsResult, stats });
  } catch (err: any) {
    logger.error(`Rescore error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ---- Safe Apply (Browser-based) ----
let applyOrchestrator: SafeApplyOrchestrator | null = null;

app.post('/api/apply/launch', async (_req, res) => {
  try {
    if (applyOrchestrator) {
      return res.json({ status: 'already_running', message: 'Browser session already active' });
    }
    applyOrchestrator = new SafeApplyOrchestrator();
    await applyOrchestrator.launchBrowser();
    const loggedIn = await applyOrchestrator.loginLinkedIn();
    res.json({ status: loggedIn ? 'ready' : 'login_failed', loggedIn });
  } catch (err: any) {
    logger.error(`Launch error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/apply/execute', async (req, res) => {
  try {
    const { userId, jobIds } = req.body;
    if (!userId || !jobIds?.length) return res.status(400).json({ error: 'userId and jobIds required' });
    if (!applyOrchestrator) return res.status(400).json({ error: 'Browser not launched. Call /api/apply/launch first.' });

    // Build ApplyJob objects from DB
    const jobs: ApplyJob[] = [];
    for (const jobId of jobIds) {
      const jobRes = await query(`
        SELECT j.id, j.title, j.company_name, j.job_url, j.source_platform,
               js.total_score, a.ats_score, a.interview_probability
        FROM jobs j
        LEFT JOIN job_scores js ON js.job_id = j.id AND js.user_id = $1
        LEFT JOIN ats_analysis a ON a.job_id = j.id AND a.user_id = $1
        WHERE j.id = $2
      `, [userId, jobId]);

      if (jobRes.rows.length === 0) continue;
      const r = jobRes.rows[0];

      // Get generated content
      const contentRes = await query(
        `SELECT content_type, content FROM generated_content WHERE user_id = $1 AND job_id = $2 ORDER BY created_at DESC`,
        [userId, jobId]
      );
      const resume = contentRes.rows.find((c: any) => c.content_type === 'resume');
      const cover = contentRes.rows.find((c: any) => c.content_type === 'cover_letter');

      jobs.push({
        jobId: r.id,
        userId,
        title: r.title,
        company: r.company_name,
        jobUrl: r.job_url,
        platform: r.source_platform || 'linkedin',
        resumeContent: resume?.content || '',
        coverLetter: cover?.content || '',
        atsScore: Number(r.ats_score) || 0,
        interviewProbability: Number(r.interview_probability) || 0,
        matchScore: Number(r.total_score) || 0,
      });
    }

    if (jobs.length === 0) return res.status(404).json({ error: 'No valid jobs found' });

    // Execute apply flow
    const results = await applyOrchestrator.applyBatch(jobs);
    res.json({ results, appliedCount: results.filter(r => r.success).length });
  } catch (err: any) {
    logger.error(`Apply execute error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/apply/close', async (_req, res) => {
  try {
    if (applyOrchestrator) {
      await applyOrchestrator.close();
      applyOrchestrator = null;
    }
    res.json({ status: 'closed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/apply/status', async (_req, res) => {
  res.json({
    browserActive: !!applyOrchestrator,
    dryRun: process.env.DRY_RUN === 'true',
    maxDaily: parseInt(process.env.MAX_DAILY_APPLICATIONS || '3'),
    manualApproval: process.env.MANUAL_APPROVAL === 'true',
  });
});

// ---- Health ----
app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'unhealthy' });
  }
});

export function startApiServer(port: number = 8080): void {
  app.listen(port, () => {
    logger.info(`API server started on http://localhost:${port}`);
    logger.info(`Dashboard: http://localhost:3000`);
  });
}

export { app };
