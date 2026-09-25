import logger from '../utils/logger';
import { query } from '../db/postgres-client';

/**
 * Apify integration — uses Apify Actors for scraping, feeds results
 * into our existing scoring/AI/apply pipeline.
 *
 * WHY use Apify for scraping:
 *   - Built-in proxy rotation (residential IPs)
 *   - Anti-detection handled at infrastructure level
 *   - Pre-built LinkedIn/Naukri actors maintained by community
 *   - Your account never touches the scraping browser
 *
 * WHY NOT use Apify for applying:
 *   - Applying requires YOUR session/cookies
 *   - Apify can't fill forms as you
 *   - Keep apply logic local for safety
 *
 * SETUP:
 *   1. Create free account at apify.com
 *   2. Get API token from Settings → Integrations
 *   3. Set APIFY_API_TOKEN in .env
 *   4. Find actor IDs from Apify Store (LinkedIn scraper, Naukri scraper)
 */

const APIFY_BASE_URL = 'https://api.apify.com/v2';

export interface ApifyConfig {
  apiToken: string;
  linkedinActorId: string;     // e.g., "anchor/linkedin-jobs-scraper"
  naukriActorId: string;       // custom or community actor
  maxResults: number;
  timeoutMs: number;
}

function getApifyConfig(): ApifyConfig {
  return {
    apiToken: process.env.APIFY_API_TOKEN || '',
    linkedinActorId: process.env.APIFY_LINKEDIN_ACTOR || 'hKByXkMQaC5Qt9UMN',  // curious_coder/linkedin-jobs-scraper
    naukriActorId: process.env.APIFY_NAUKRI_ACTOR || '',
    maxResults: parseInt(process.env.APIFY_MAX_RESULTS || '50'),
    timeoutMs: parseInt(process.env.APIFY_TIMEOUT_MS || '120000'),
  };
}

/**
 * Run an Apify actor and wait for results.
 */
async function runActor(actorId: string, input: Record<string, any>): Promise<any[]> {
  const config = getApifyConfig();

  if (!config.apiToken) {
    throw new Error('APIFY_API_TOKEN not set. Get one at apify.com → Settings → Integrations');
  }

  logger.info(`Starting Apify actor: ${actorId}`);

  // Start the actor run
  const startRes = await fetch(
    `${APIFY_BASE_URL}/acts/${actorId}/runs?token=${config.apiToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );

  if (!startRes.ok) {
    const errText = await startRes.text();
    throw new Error(`Apify start failed (${startRes.status}): ${errText}`);
  }

  const runData = await startRes.json();
  const runId = runData.data?.id;

  if (!runId) {
    throw new Error('Apify did not return a run ID');
  }

  logger.info(`Apify run started: ${runId}. Waiting for completion...`);

  // Poll for completion
  const startTime = Date.now();
  while (Date.now() - startTime < config.timeoutMs) {
    await sleep(5000);

    const statusRes = await fetch(
      `${APIFY_BASE_URL}/actor-runs/${runId}?token=${config.apiToken}`
    );
    const statusData = await statusRes.json();
    const status = statusData.data?.status;

    if (status === 'SUCCEEDED') {
      logger.info('Apify run completed successfully');
      break;
    }

    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error(`Apify run ${status}: ${statusData.data?.statusMessage || ''}`);
    }

    logger.debug(`Apify run status: ${status}...`);
  }

  // Fetch results from dataset
  const datasetRes = await fetch(
    `${APIFY_BASE_URL}/actor-runs/${runId}/dataset/items?token=${config.apiToken}&limit=${config.maxResults}`
  );

  if (!datasetRes.ok) {
    throw new Error(`Failed to fetch Apify results: ${datasetRes.status}`);
  }

  const items = await datasetRes.json();
  logger.info(`Fetched ${items.length} items from Apify`);

  return items;
}

// ============================================
// LinkedIn Job Scraper via Apify
// ============================================

export interface LinkedInJobInput {
  searchTerms: string;          // e.g., "Java Developer"
  location: string;             // e.g., "India"
  experienceLevel?: string[];   // ["ENTRY_LEVEL", "ASSOCIATE", "MID_SENIOR"]
  datePosted?: string;          // "past-24h", "past-week", "past-month"
  remoteFilter?: string;        // "remote", "on-site", "hybrid"
  maxResults?: number;
}

export async function scrapeLinkedInJobs(input: LinkedInJobInput): Promise<any[]> {
  const config = getApifyConfig();

  const actorInput = {
    urls: [
      `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(input.searchTerms)}&location=${encodeURIComponent(input.location)}`
    ],
    maxItems: input.maxResults || config.maxResults,
    parseCompanyDetails: false,
  };

  const results = await runActor(config.linkedinActorId, actorInput);

  // Normalize to our job schema
  return results.map((item: any) => normalizeLinkedInJob(item));
}

function normalizeLinkedInJob(raw: any): {
  externalJobId: string;
  title: string;
  companyName: string;
  location: string;
  skills: string[];
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  jobUrl: string;
  description: string;
  postedDate: string | null;
  sourcePlatform: string;
} {
  return {
    externalJobId: raw.jobId || raw.id || `li-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: raw.title || raw.jobTitle || '',
    companyName: raw.companyName || raw.company || '',
    location: raw.location || raw.jobLocation || '',
    skills: extractSkillsFromDescription(raw.description || ''),
    experienceMin: null,  // LinkedIn doesn't always provide structured experience
    experienceMax: null,
    salaryMin: parseSalary(raw.salary, 'min'),
    salaryMax: parseSalary(raw.salary, 'max'),
    jobUrl: raw.jobUrl || raw.url || raw.link || '',
    description: raw.description || '',
    postedDate: raw.postedAt || raw.publishedAt || null,
    sourcePlatform: 'linkedin',
  };
}

// ============================================
// Store Apify Results in PostgreSQL
// ============================================

export async function storeApifyResults(jobs: any[], userId?: string): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const job of jobs) {
    try {
      const res = await query(
        `INSERT INTO jobs (
          external_job_id, title, company_name, location, skills,
          experience_min, experience_max, salary_min, salary_max,
          job_url, job_description, posted_date, source_platform, scraped_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        ON CONFLICT (external_job_id, source_platform) DO NOTHING
        RETURNING id`,
        [
          job.externalJobId, job.title, job.companyName, job.location,
          JSON.stringify(job.skills), job.experienceMin, job.experienceMax,
          job.salaryMin, job.salaryMax, job.jobUrl,
          job.description, job.postedDate, job.sourcePlatform,
        ]
      );

      if (res.rowCount && res.rowCount > 0) {
        inserted++;
      } else {
        skipped++;
      }
    } catch (err: any) {
      logger.warn(`Failed to store job "${job.title}": ${err.message}`);
      skipped++;
    }
  }

  logger.info(`Apify results stored: ${inserted} new, ${skipped} skipped`);
  return { inserted, skipped };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Extract skills from job description text using keyword matching.
 */
function extractSkillsFromDescription(description: string): string[] {
  const knownSkills = [
    'java', 'spring boot', 'spring', 'react', 'reactjs', 'next.js', 'nextjs',
    'node.js', 'nodejs', 'typescript', 'javascript', 'python', 'go', 'golang',
    'postgresql', 'mysql', 'mongodb', 'redis', 'kafka', 'rabbitmq',
    'docker', 'kubernetes', 'aws', 'gcp', 'azure', 'terraform',
    'rest api', 'graphql', 'grpc', 'microservices',
    'git', 'ci/cd', 'jenkins', 'github actions',
    'html', 'css', 'tailwind', 'sass',
    'sql', 'nosql', 'elasticsearch',
    'spring security', 'jwt', 'oauth',
    'junit', 'jest', 'selenium', 'playwright',
    'agile', 'scrum',
  ];

  const descLower = description.toLowerCase();
  const found: string[] = [];

  for (const skill of knownSkills) {
    if (descLower.includes(skill)) {
      found.push(skill);
    }
  }

  return [...new Set(found)];
}

function parseSalary(salaryStr: string | null | undefined, type: 'min' | 'max'): number | null {
  if (!salaryStr) return null;

  // Try to extract numbers from salary string
  const numbers = salaryStr.match(/[\d,.]+/g);
  if (!numbers || numbers.length === 0) return null;

  const parsed = numbers.map(n => parseFloat(n.replace(/,/g, '')));

  if (type === 'min') return Math.min(...parsed);
  return Math.max(...parsed);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
