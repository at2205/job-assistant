/**
 * Naukri Job Discovery + ATS Analysis Engine
 *
 * Steps:
 *   1. Login (persistent session)
 *   2. Search multiple role queries
 *   3. Scrape job cards from search results
 *   4. ATS-score each job against user profile
 *   5. Rank and categorize (HIGH / GOOD / LOW / SKIP)
 *   6. Generate shortlist with analysis
 *   7. Save structured results + screenshots
 */

import { chromium, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ────── Directories ──────
const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'screenshots', 'naukri-jobs');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const RESULTS_DIR = path.resolve(process.cwd(), 'results');
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

// ────── User profile for matching ──────
const USER_PROFILE = {
  skills: [
    'java', 'spring boot', 'rest api', 'microservices', 'postgresql', 'sql',
    'react.js', 'react', 'next.js', 'typescript', 'javascript', 'node.js',
    'docker', 'git', 'playwright', 'supabase', 'ai automation',
    'system design', 'html', 'css', 'tailwind css',
    'websocket', 'jwt', 'redis', 'mongodb', 'express.js', 'express',
  ],
  experienceYears: 2,
  preferredLocations: ['noida', 'new delhi', 'delhi', 'delhi ncr', 'gurugram', 'gurgaon', 'remote', 'work from home', 'hybrid'],
};

// ────── Search queries ──────
// Set NAUKRI_REMOTE=true (env) to search remote / work-from-home roles instead.
const REMOTE = /^(1|true|yes)$/i.test(process.env.NAUKRI_REMOTE || '');

const LOCATION_QUERIES = [
  // Priority 1: Noida
  { role: 'software developer', location: 'noida', experience: '0-2' },
  { role: 'software engineer', location: 'noida', experience: '0-2' },
  { role: 'SDE', location: 'noida', experience: '0-2' },
  { role: 'microservices developer', location: 'noida', experience: '0-3' },
  { role: 'react developer', location: 'noida', experience: '0-2' },
  { role: 'node.js developer', location: 'noida', experience: '0-2' },
  { role: 'API developer', location: 'noida', experience: '0-2' },
  // Priority 2: New Delhi / NCR
  { role: 'software developer', location: 'new delhi', experience: '0-2' },
  { role: 'software engineer', location: 'new delhi', experience: '0-2' },
  { role: 'SDE', location: 'new delhi', experience: '0-2' },
  { role: 'java developer', location: 'delhi ncr', experience: '0-2' },
  { role: 'backend developer', location: 'delhi ncr', experience: '0-2' },
  { role: 'full stack developer', location: 'delhi ncr', experience: '0-2' },
  // Priority 3: Gurugram
  { role: 'software developer', location: 'gurugram', experience: '0-2' },
  { role: 'backend developer', location: 'gurugram', experience: '0-2' },
];

// Naukri treats "remote" as a location filter (l=remote).
const REMOTE_QUERIES = [
  { role: 'software developer', location: 'remote', experience: '0-2' },
  { role: 'software engineer', location: 'remote', experience: '0-2' },
  { role: 'SDE', location: 'remote', experience: '0-2' },
  { role: 'java developer', location: 'remote', experience: '0-2' },
  { role: 'backend developer', location: 'remote', experience: '0-3' },
  { role: 'spring boot developer', location: 'remote', experience: '0-3' },
  { role: 'microservices developer', location: 'remote', experience: '0-3' },
  { role: 'react developer', location: 'remote', experience: '0-2' },
  { role: 'node.js developer', location: 'remote', experience: '0-2' },
  { role: 'full stack developer', location: 'remote', experience: '0-2' },
  { role: 'API developer', location: 'remote', experience: '0-2' },
  { role: 'javascript developer', location: 'remote', experience: '0-2' },
];

const RECENT = !!process.env.NAUKRI_JOB_AGE || /^(1|true|yes)$/i.test(process.env.NAUKRI_RECENT || '');

// Lean query set for recent mode: Noida-only, core roles — finishes fast and
// reliably reaches the save step even under heavy system load.
const RECENT_QUERIES = [
  { role: 'java developer', location: 'noida', experience: '0-3' },
  { role: 'software developer', location: 'noida', experience: '0-2' },
  { role: 'backend developer', location: 'noida', experience: '0-3' },
  { role: 'full stack developer', location: 'noida', experience: '0-2' },
  { role: 'react developer', location: 'noida', experience: '0-2' },
  { role: 'node.js developer', location: 'noida', experience: '0-2' },
];

// Custom query set via env:
//   NAUKRI_ROLES="java developer,software engineer"  NAUKRI_CITIES="chandigarh,pune"
//   NAUKRI_EXP="0-3" (optional, default 0-5)
const CUSTOM_ROLES = (process.env.NAUKRI_ROLES || '').split(',').map(s => s.trim()).filter(Boolean);
const CUSTOM_CITIES = (process.env.NAUKRI_CITIES || '').split(',').map(s => s.trim()).filter(Boolean);
const CUSTOM = CUSTOM_ROLES.length > 0 && CUSTOM_CITIES.length > 0;
const CUSTOM_QUERIES = CUSTOM
  ? CUSTOM_CITIES.flatMap(location =>
      CUSTOM_ROLES.map(role => ({ role, location, experience: process.env.NAUKRI_EXP || '0-5' })))
  : [];

const SEARCH_QUERIES = CUSTOM
  ? CUSTOM_QUERIES
  : (REMOTE ? REMOTE_QUERIES : (RECENT ? RECENT_QUERIES : LOCATION_QUERIES));

const MAX_PAGES_PER_QUERY = RECENT ? 2 : 3;

// ────── ATS keyword categories ──────
const KEYWORD_CATEGORIES: Record<string, string[]> = {
  languages: ['java', 'python', 'javascript', 'typescript', 'golang', 'c++', 'kotlin', 'scala'],
  frameworks: ['spring boot', 'spring', 'react', 'angular', 'next.js', 'express', 'node.js', 'django', 'hibernate'],
  databases: ['postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'oracle', 'sql'],
  cloud: ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jenkins', 'ci/cd', 'devops'],
  concepts: ['microservices', 'rest api', 'graphql', 'agile', 'scrum', 'tdd', 'system design', 'data structures'],
  tools: ['git', 'jira', 'kafka', 'rabbitmq', 'maven', 'gradle', 'linux'],
};
const ALL_KEYWORDS = Object.values(KEYWORD_CATEGORIES).flat();

// ────── Selectors ──────
const SEL = {
  loginSuccess: '.nI-gNb-header__userImg, .user-img, [class*="user-name"], a.nI-gNb-drawer__hamburger, div.nI-gNb-header__right',
  emailField: 'input[placeholder="Enter Email ID / Username"]',
  passwordField: 'input[placeholder="Enter Password"]',
  submitButton: 'button[type="submit"]',
  otpField: 'input[placeholder="Enter OTP"]',
  jobCard: '.srp-jobtuple-wrapper, article.jobTuple, .cust-job-tuple',
  jobTitle: '.title, .row1 a.title, a.title',
  companyName: '.comp-name, .row2 .subTitle, a.comp-name, .comp-dtl-list a',
  experience: '.expwdth, .row3 .experience span, .exp',
  salary: '.sal, .row3 .salary span, .sal-wrap .ni-salary',
  location: '.loc, .row3 .location span, .locWdth, .loc-wrap .ni-location',
  jobLink: '.title a, .row1 a, a.title',
  postedDate: '.job-post-day, .row6 span.date, .posting-date',
  skills: '.tags-gt a, .row6 .tag-li a, .tag-list a',
  nextPage: 'a.fright, a[class*="next"]',
};

// ────── Utilities ──────
function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function randomDelay(min: number, max: number): Promise<void> {
  return sleep(min + Math.random() * (max - min));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function screenshot(page: Page, name: string): Promise<string> {
  const p = path.join(SCREENSHOTS_DIR, `jobs-${name}-${Date.now()}.png`);
  try {
    await page.screenshot({ path: p, fullPage: false, timeout: 15000 });
  } catch {
    // Screenshots are diagnostic only — never let one abort the scrape.
    return '';
  }
  return p;
}

/**
 * Navigate to a URL with retries. Naukri's first load is often slow and can
 * exceed a single timeout; retry with a longer budget and a more lenient
 * wait condition before giving up.
 */
async function gotoWithRetry(page: Page, url: string, attempts = 3): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      await page.goto(url, {
        waitUntil: i === 0 ? 'domcontentloaded' : 'commit',
        timeout: 60000,
      });
      return true;
    } catch (e: any) {
      if (i === attempts - 1) {
        log('NAV', `goto failed after ${attempts} tries: ${url} (${e.message})`);
        return false;
      }
      await sleep(3000 + i * 2000);
    }
  }
  return false;
}

function log(section: string, msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${section}] ${msg}`);
}

// ────── ATS Analysis ──────
interface JobResult {
  title: string;
  company: string;
  experience: string;
  salary: string;
  location: string;
  url: string;
  skills: string[];
  postedDate: string;
  source: string;
  // ATS analysis
  atsScore: number;
  interviewProbability: number;
  skillMatchPct: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  priority: 'HIGH' | 'GOOD' | 'LOW' | 'SKIP';
  skipReason: string | null;
  suggestions: string[];
}

function analyzeJob(job: { title: string; company: string; experience: string; salary: string; location: string; skills: string[] }): Omit<JobResult, 'url' | 'postedDate' | 'source'> {
  const jobText = [job.title, job.company, ...job.skills].join(' ').toLowerCase();
  const userSkillSet = new Set(USER_PROFILE.skills);

  // Keyword extraction from job
  const jobKeywords = ALL_KEYWORDS.filter(kw => jobText.includes(kw));
  const jobSkillsLower = job.skills.map(s => s.toLowerCase());
  const allJobKeywords = [...new Set([...jobKeywords, ...jobSkillsLower])];

  // Match
  const matched = allJobKeywords.filter(k => userSkillSet.has(k));
  const missing = allJobKeywords.filter(k => !userSkillSet.has(k));
  const matchPct = allJobKeywords.length > 0 ? Math.round((matched.length / allJobKeywords.length) * 100) : 50;

  // Experience check
  let expScore = 50;
  const expMatch = job.experience.match(/(\d+)\s*-\s*(\d+)/);
  if (expMatch) {
    const minExp = parseInt(expMatch[1]);
    const maxExp = parseInt(expMatch[2]);
    if (USER_PROFILE.experienceYears >= minExp && USER_PROFILE.experienceYears <= maxExp) {
      expScore = 100;
    } else if (USER_PROFILE.experienceYears < minExp) {
      expScore = Math.max(0, 100 - (minExp - USER_PROFILE.experienceYears) * 25);
    } else {
      expScore = Math.max(30, 100 - (USER_PROFILE.experienceYears - maxExp) * 15);
    }
  }

  // Location check
  let locScore = 30;
  const jobLocLower = job.location.toLowerCase();
  for (const pref of USER_PROFILE.preferredLocations) {
    if (jobLocLower.includes(pref)) { locScore = 100; break; }
  }

  // ATS Score
  let atsScore = matchPct;
  if (matched.length >= 5) atsScore = Math.min(100, atsScore + 10);
  if (expScore >= 90) atsScore = Math.min(100, atsScore + 5);
  if (missing.length > 5) atsScore = Math.max(0, atsScore - 10);

  // Interview probability
  const totalScore = Math.round(matchPct * 0.40 + expScore * 0.25 + locScore * 0.15 + atsScore * 0.20);
  const interviewProb = Math.min(100, Math.round(totalScore * 0.85 + (matched.length >= 3 ? 10 : 0)));

  // Skip detection
  let skipReason: string | null = null;
  const titleLower = job.title.toLowerCase();
  if (titleLower.includes('walk-in') || titleLower.includes('walkin')) skipReason = 'Walk-in drive';
  if (titleLower.includes('urgent hiring') || titleLower.includes('mass hiring')) skipReason = 'Mass hiring';
  if (titleLower.includes('intern') && !titleLower.includes('engineer')) skipReason = 'Internship only';

  // Priority
  let priority: 'HIGH' | 'GOOD' | 'LOW' | 'SKIP';
  if (skipReason) {
    priority = 'SKIP';
  } else if (totalScore >= 70 && atsScore >= 55 && interviewProb >= 50) {
    priority = 'HIGH';
  } else if (totalScore >= 50 && atsScore >= 35) {
    priority = 'GOOD';
  } else if (totalScore >= 30) {
    priority = 'LOW';
  } else {
    priority = 'SKIP';
  }

  // Suggestions
  const suggestions: string[] = [];
  if (missing.length > 0 && missing.length <= 5) {
    suggestions.push(`Add to resume: ${missing.join(', ')}`);
  } else if (missing.length > 5) {
    suggestions.push(`Key gaps: ${missing.slice(0, 5).join(', ')} (+${missing.length - 5} more)`);
  }
  if (matchPct < 50) suggestions.push('Low keyword match — tailor resume for this role');
  if (expScore < 50) suggestions.push('Experience mismatch — highlight relevant project work');

  return {
    title: job.title,
    company: job.company,
    experience: job.experience,
    salary: job.salary,
    location: job.location,
    skills: job.skills,
    atsScore: Math.round(atsScore),
    interviewProbability: interviewProb,
    skillMatchPct: matchPct,
    matchedKeywords: matched,
    missingKeywords: missing,
    priority,
    skipReason,
    suggestions,
  };
}

// ────── Main ──────
async function main() {
  console.log('='.repeat(60));
  console.log('  NAUKRI JOB DISCOVERY + ATS ANALYSIS ENGINE');
  console.log('='.repeat(60));

  const email = process.env.NAUKRI_EMAIL;
  const password = process.env.NAUKRI_PASSWORD;

  if (!email || !password) {
    console.error('ERROR: Set NAUKRI_EMAIL and NAUKRI_PASSWORD in .env');
    process.exit(1);
  }

  const userDataDir = path.resolve(process.cwd(), 'sessions', 'naukri-session');
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 40,
    viewport: { width: 1920, height: 1080 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--no-sandbox',
    ],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });

  const page = context.pages()[0] || await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    (window as any).chrome = { runtime: {} };
  });

  const allJobs: JobResult[] = [];
  const screenshotLog: string[] = [];

  try {
    // ═══════ LOGIN ═══════
    log('AUTH', 'Checking session...');
    await gotoWithRetry(page, 'https://www.naukri.com/mnjuser/homepage');
    await randomDelay(3000, 5000);

    let isLoggedIn = false;
    const urlNow = page.url();
    if (!urlNow.includes('/nlogin/login') && !urlNow.includes('/login')) {
      const indicator = await page.$(SEL.loginSuccess);
      isLoggedIn = !!indicator;
    }

    if (!isLoggedIn) {
      log('AUTH', 'Not logged in. Attempting login...');
      await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await randomDelay(2000, 3000);

      await page.fill(SEL.emailField, email);
      await randomDelay(500, 1000);
      await page.fill(SEL.passwordField, password);
      await randomDelay(800, 1500);
      await page.click(SEL.submitButton);

      try {
        await page.waitForSelector(SEL.loginSuccess, { timeout: 15000 });
        isLoggedIn = true;
        log('AUTH', 'Login successful');
      } catch {
        const otpField = await page.$(SEL.otpField);
        if (otpField) {
          log('AUTH', 'OTP required. Please enter OTP. Waiting 120s...');
          try {
            await page.waitForSelector(SEL.loginSuccess, { timeout: 120000 });
            isLoggedIn = true;
          } catch {
            log('AUTH', 'OTP timeout.');
          }
        }
        if (!isLoggedIn) {
          log('AUTH', 'Waiting 5 min for manual login...');
          const deadline = Date.now() + 300000;
          while (Date.now() < deadline && !isLoggedIn) {
            await sleep(5000);
            const u = page.url();
            if (u.includes('/homepage') || u.includes('/profile') || u.includes('/dashboard')) isLoggedIn = true;
          }
        }
      }
    }

    if (!isLoggedIn) {
      log('AUTH', 'Login failed. Exiting.');
      await context.close();
      return;
    }

    screenshotLog.push(await screenshot(page, 'logged-in'));
    log('AUTH', 'Session active');

    // ═══════ SEARCH + SCRAPE ═══════
    const seenUrls = new Set<string>();

    for (const query of SEARCH_QUERIES) {
      const q = encodeURIComponent(query.role).replace(/%20/g, '-');
      let searchUrl = `https://www.naukri.com/${q}-jobs`;
      const params: string[] = [];
      if (query.location) params.push(`l=${encodeURIComponent(query.location)}`);
      if (query.experience) params.push(`experience=${query.experience}`);
      // Recency filter: NAUKRI_JOB_AGE = days since posting (1, 3, 7, 15).
      // Defaults to 1 (jobs posted in the last day) when NAUKRI_RECENT is set.
      const jobAge = process.env.NAUKRI_JOB_AGE
        || (/^(1|true|yes)$/i.test(process.env.NAUKRI_RECENT || '') ? '1' : '');
      if (jobAge) params.push(`jobAge=${jobAge}`);
      if (params.length) searchUrl += '?' + params.join('&');

      log('SEARCH', `Query: "${query.role}" in ${query.location || 'all'} (exp: ${query.experience || 'any'}${jobAge ? `, jobAge=${jobAge}d` : ''})`);

      for (let pageNum = 1; pageNum <= MAX_PAGES_PER_QUERY; pageNum++) {
        const pageUrl = pageNum > 1 ? `${searchUrl}&page=${pageNum}` : searchUrl;
        const ok = await gotoWithRetry(page, pageUrl);
        if (!ok) { log('SEARCH', `  Page ${pageNum}: navigation failed, skipping`); break; }
        await randomDelay(3000, 5000);

        if (pageNum === 1) {
          screenshotLog.push(await screenshot(page, `search-${q}`));
        }

        // Parse job cards
        const cards = await page.$$(SEL.jobCard);
        log('SEARCH', `  Page ${pageNum}: ${cards.length} cards`);

        for (const card of cards) {
          try {
            const title = await safeText(card, SEL.jobTitle);
            const company = await safeText(card, SEL.companyName);
            const experience = await safeText(card, SEL.experience);
            const salary = await safeText(card, SEL.salary);
            const location = await safeText(card, SEL.location);
            const postedDate = await safeText(card, SEL.postedDate);

            const linkEl = await card.$(SEL.jobLink);
            let url = linkEl ? (await linkEl.getAttribute('href')) || '' : '';
            if (url && !url.startsWith('http')) url = 'https://www.naukri.com' + url;

            const skillEls = await card.$$(SEL.skills);
            const skills: string[] = [];
            for (const el of skillEls) {
              const t = await el.textContent();
              if (t?.trim()) skills.push(t.trim());
            }

            if (!title || seenUrls.has(url)) continue;
            if (url) seenUrls.add(url);

            // ATS analysis
            const analysis = analyzeJob({ title, company, experience, salary, location, skills });

            allJobs.push({
              ...analysis,
              url,
              postedDate,
              source: `${query.role} | ${query.location}`,
            });
          } catch (err: any) {
            // skip malformed cards
          }
        }

        await randomDelay(3000, 7000); // rate limit between pages
      }

      await randomDelay(5000, 8000); // rate limit between queries

      // Checkpoint after each query so a mid-run failure preserves progress.
      try {
        const ckpt = path.join(RESULTS_DIR, `naukri-checkpoint${REMOTE ? '-remote' : ''}.json`);
        fs.writeFileSync(ckpt, JSON.stringify({
          timestamp: new Date().toISOString(),
          jobsSoFar: allJobs.length,
          allJobs,
        }, null, 2));
      } catch { /* checkpoint is best-effort */ }
    }

    log('SEARCH', `Total unique jobs scraped: ${allJobs.length}`);

    // ═══════ RANK + CATEGORIZE ═══════
    const sorted = allJobs.sort((a, b) => b.atsScore - a.atsScore);
    const highPriority = sorted.filter(j => j.priority === 'HIGH');
    const goodMatch = sorted.filter(j => j.priority === 'GOOD');
    const lowPriority = sorted.filter(j => j.priority === 'LOW');
    const skipped = sorted.filter(j => j.priority === 'SKIP');

    log('RANK', `HIGH PRIORITY: ${highPriority.length}`);
    log('RANK', `GOOD MATCH: ${goodMatch.length}`);
    log('RANK', `LOW PRIORITY: ${lowPriority.length}`);
    log('RANK', `SKIPPED: ${skipped.length}`);

    // ═══════ DISPLAY TOP 20 ═══════
    console.log('\n' + '='.repeat(70));
    console.log('  TOP 20 MATCHING JOBS');
    console.log('='.repeat(70));

    const top20 = [...highPriority, ...goodMatch].slice(0, 20);
    for (let i = 0; i < top20.length; i++) {
      const j = top20[i];
      console.log(`\n  #${i + 1} [${j.priority}] ${j.title}`);
      console.log(`     Company:    ${j.company}`);
      console.log(`     Location:   ${j.location}`);
      console.log(`     Salary:     ${j.salary || 'Not disclosed'}`);
      console.log(`     Exp:        ${j.experience}`);
      console.log(`     ATS Score:  ${j.atsScore}/100`);
      console.log(`     Interview:  ${j.interviewProbability}%`);
      console.log(`     Skills:     ${j.matchedKeywords.join(', ')}`);
      console.log(`     Missing:    ${j.missingKeywords.slice(0, 5).join(', ') || 'None'}`);
      console.log(`     URL:        ${j.url}`);
      if (j.suggestions.length > 0) {
        console.log(`     Tip:        ${j.suggestions[0]}`);
      }
    }

    // ═══════ AGGREGATE STATS ═══════
    const shortlisted = [...highPriority, ...goodMatch];
    const avgATS = shortlisted.length > 0 ? Math.round(shortlisted.reduce((s, j) => s + j.atsScore, 0) / shortlisted.length) : 0;
    const avgInterview = shortlisted.length > 0 ? Math.round(shortlisted.reduce((s, j) => s + j.interviewProbability, 0) / shortlisted.length) : 0;

    // Most commonly missing skills
    const missingCount: Record<string, number> = {};
    for (const j of shortlisted) {
      for (const kw of j.missingKeywords) {
        missingCount[kw] = (missingCount[kw] || 0) + 1;
      }
    }
    const topMissing = Object.entries(missingCount).sort((a, b) => b[1] - a[1]).slice(0, 10);

    console.log('\n' + '='.repeat(70));
    console.log('  ANALYSIS SUMMARY');
    console.log('='.repeat(70));
    console.log(`  Total jobs found:      ${allJobs.length}`);
    console.log(`  High priority:         ${highPriority.length}`);
    console.log(`  Good match:            ${goodMatch.length}`);
    console.log(`  Shortlisted:           ${shortlisted.length}`);
    console.log(`  Avg ATS score:         ${avgATS}/100`);
    console.log(`  Avg interview prob:    ${avgInterview}%`);
    console.log(`  Screenshots captured:  ${screenshotLog.length}`);
    console.log(`\n  TOP MISSING SKILLS (add to profile):`);
    for (const [kw, ct] of topMissing) {
      console.log(`    ${kw}: missing in ${ct} jobs`);
    }

    // ═══════ SAVE RESULTS ═══════
    const resultFile = path.join(RESULTS_DIR, `naukri-job-discovery${CUSTOM ? '-custom' : ''}${REMOTE ? '-remote' : ''}${/^(1|true|yes)$/i.test(process.env.NAUKRI_RECENT || '') || process.env.NAUKRI_JOB_AGE ? '-recent' : ''}-${Date.now()}.json`);
    fs.writeFileSync(resultFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        totalJobs: allJobs.length,
        highPriority: highPriority.length,
        goodMatch: goodMatch.length,
        lowPriority: lowPriority.length,
        skipped: skipped.length,
        avgATSScore: avgATS,
        avgInterviewProbability: avgInterview,
        topMissingSkills: topMissing.map(([kw, ct]) => ({ keyword: kw, count: ct })),
      },
      top20: top20.map(j => ({
        title: j.title, company: j.company, location: j.location,
        salary: j.salary, experience: j.experience, url: j.url,
        atsScore: j.atsScore, interviewProbability: j.interviewProbability,
        priority: j.priority, matchedKeywords: j.matchedKeywords,
        missingKeywords: j.missingKeywords, suggestions: j.suggestions,
      })),
      allJobs: sorted.map(j => ({
        title: j.title, company: j.company, location: j.location,
        salary: j.salary, experience: j.experience, url: j.url,
        atsScore: j.atsScore, interviewProbability: j.interviewProbability,
        priority: j.priority, skillMatchPct: j.skillMatchPct,
        matchedKeywords: j.matchedKeywords, missingKeywords: j.missingKeywords,
      })),
      screenshots: screenshotLog,
    }, null, 2));
    log('DONE', `Full results saved: ${resultFile}`);

    console.log('\n  DO NOT APPLY YET — review the shortlist first.');
    console.log('  Browser stays open 30 seconds for review...');
    await sleep(30000);

  } catch (err: any) {
    console.error(`\nERROR: ${err.message}`);
    await screenshot(page, 'error');
  } finally {
    await context.close();
    console.log('Browser closed.');
  }
}

async function safeText(parent: any, selector: string): Promise<string> {
  try {
    const el = await parent.$(selector);
    if (!el) return '';
    return (await el.textContent())?.trim() || '';
  } catch {
    return '';
  }
}

main().catch(console.error);
