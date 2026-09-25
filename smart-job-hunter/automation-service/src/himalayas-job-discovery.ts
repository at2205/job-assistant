/**
 * Himalayas (https://himalayas.app) job discovery.
 *
 * Reuses the Google-login session saved by himalayas-manual-login.ts
 * (sessions/himalayas-session). Himalayas exposes dev-filtered category pages
 * (e.g. /jobs/software-engineer) that paginate via ?page=N with 20 jobs/page.
 * This scrapes a set of role categories across several pages, de-duplicates,
 * and writes results/himalayas-jobs-<ts>.json in the shape the ingest expects.
 *
 * Env:
 *   HIMALAYAS_QUICK=true       fewer categories, 1 page each (fast smoke run)
 *   HIMALAYAS_MAX_PAGES=N      pages per category (default 3, quick=1)
 *   HIMALAYAS_CATEGORIES="a,b" override category slugs (comma separated)
 *
 * Usage: npx tsx src/himalayas-job-discovery.ts
 */
import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface JobResult {
  title: string;
  company: string;
  location: string;
  url: string;
  posted: string;
  salary: string;
  remote: boolean;
}

async function main() {
  console.log('============================================================');
  console.log('  HIMALAYAS JOB DISCOVERY ENGINE');
  console.log('============================================================\n');

  const userDataDir = path.resolve(process.cwd(), 'sessions', 'himalayas-session');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1366, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--no-sandbox',
    ],
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    await run(page);
  } finally {
    await context.close().catch(() => {});
  }
}

async function run(page: import('playwright').Page) {
  const QUICK = /^(1|true|yes)$/i.test(process.env.HIMALAYAS_QUICK || '');

  // Dev-filtered Himalayas category pages (verified to paginate via ?page=N).
  const defaultCategories = QUICK ? [
    'software-engineer',
    'backend-engineer',
    'full-stack-developer',
  ] : [
    'software-engineer',
    'backend-engineer',
    'full-stack-developer',
    'java-developer',
    'software-development',
    'frontend-engineer',
    'node-js-developer',
    'react-developer',
    'devops-engineer',
    'python-developer',
  ];
  const categories = (process.env.HIMALAYAS_CATEGORIES
    ? process.env.HIMALAYAS_CATEGORIES.split(',').map(s => s.trim()).filter(Boolean)
    : defaultCategories);

  const MAX_PAGES = process.env.HIMALAYAS_MAX_PAGES
    ? parseInt(process.env.HIMALAYAS_MAX_PAGES, 10)
    : (QUICK ? 1 : 3);

  const allJobs: JobResult[] = [];
  const seenUrls = new Set<string>();

  // Session status (informational only — public listings scrape fine).
  await page.goto('https://himalayas.app/jobs', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  const loggedIn = await page.evaluate(() =>
    !!document.querySelector('a[href*="/logout"], a[href="/dashboard"], a[href="/profile"], button[aria-label*="account" i], img[alt*="avatar" i]')
  ).catch(() => false);
  console.log(loggedIn
    ? '✅ Google session detected.\n'
    : 'ℹ️  Google session not detected (scraping public listings anyway).\n   To sign in: npx tsx src/himalayas-manual-login.ts\n');

  for (const cat of categories) {
    let addedForCat = 0;

    for (let pageIdx = 1; pageIdx <= MAX_PAGES; pageIdx++) {
      const url = `https://himalayas.app/jobs/${cat}` + (pageIdx > 1 ? `?page=${pageIdx}` : '');
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      } catch {
        break;
      }
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
      const hasCards = await page.waitForSelector('a[href*="/companies/"][href*="/jobs/"]', { timeout: 12000 })
        .then(() => true).catch(() => false);
      if (!hasCards) break; // invalid slug / no results / no further pages
      // Nudge lazy images/content to render fully.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await sleep(1200 + Math.random() * 1000);

      const jobs = await extractJobs(page);
      if (jobs.length === 0) break;

      let newOnPage = 0;
      for (const job of jobs) {
        const cleanUrl = job.url.split('?')[0].replace(/\/$/, '');
        if (!/himalayas\.app\/companies\/[^/]+\/jobs\/[^/]+$/.test(cleanUrl)) continue;
        if (seenUrls.has(cleanUrl)) continue;
        seenUrls.add(cleanUrl);
        allJobs.push({ ...job, url: cleanUrl });
        newOnPage++;
        addedForCat++;
      }

      if (newOnPage === 0) break; // page only had duplicates → stop paging
      await sleep(1000 + Math.random() * 1200);
    }

    console.log(`🔍 ${cat} → +${addedForCat} new (total ${allJobs.length})`);
    await sleep(800 + Math.random() * 1000);
  }

  console.log(`\n============================================================`);
  console.log(`  TOTAL UNIQUE JOBS FOUND: ${allJobs.length}`);
  console.log(`============================================================\n`);

  [...allJobs].forEach((j, i) => {
    console.log(`${i + 1}. ${j.remote ? '🌍' : '🏢'} ${j.title} @ ${j.company}`);
    console.log(`   📍 ${j.location || 'Remote'}${j.salary ? ` | 💰 ${j.salary}` : ''}`);
    console.log(`   ${j.url}\n`);
  });

  const resultsDir = path.resolve(process.cwd(), 'results');
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

  const filename = `himalayas-jobs-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(resultsDir, filename),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      total: allJobs.length,
      jobs: allJobs,
    }, null, 2)
  );
  console.log(`💾 Saved to results/${filename}`);
}

/**
 * Extract job cards from the current Himalayas listing page.
 * Himalayas renders each job as an <article> containing anchors:
 *   - job link:  /companies/<company>/jobs/<slug>
 *   - company:   /companies/<company>
 * plus a <time> ("6 days ago") and a "Salary: $X – $Y per year" string and a
 * location like "United States only" / "AL, AD + 71 more".
 */
async function extractJobs(page: import('playwright').Page): Promise<JobResult[]> {
  return page.evaluate(() => {
    const out: any[] = [];
    const seen = new Set<string>();

    const cards = Array.from(document.querySelectorAll('article'))
      .filter(c => c.querySelector('a[href*="/companies/"][href*="/jobs/"]'));

    for (const card of cards) {
      const jobA = card.querySelector('a[href*="/companies/"][href*="/jobs/"]') as HTMLAnchorElement | null;
      if (!jobA) continue;
      const href = jobA.getAttribute('href') || '';
      const url = href.startsWith('http') ? href : `https://himalayas.app${href}`;
      const cleanUrl = url.split('?')[0].replace(/\/$/, '');
      if (!/\/companies\/[^/]+\/jobs\/[^/]+$/.test(cleanUrl)) continue;
      if (seen.has(cleanUrl)) continue;
      seen.add(cleanUrl);

      // Title: the anchor to this job whose text isn't the sr-only "View job".
      let title = '';
      card.querySelectorAll(`a[href="${href}"]`).forEach(a => {
        const t = a.textContent?.trim() || '';
        if (t && !/^view job$/i.test(t) && t.length > title.length) title = t;
      });
      if (!title) title = (jobA.textContent || '').replace(/^view job$/i, '').trim();

      // Company: anchor to /companies/<slug> with no further path segment.
      let company = '';
      card.querySelectorAll('a[href^="/companies/"]').forEach(a => {
        const h = a.getAttribute('href') || '';
        if (/^\/companies\/[^/]+$/.test(h) && !company) {
          company = (a.textContent || '').trim();
        }
      });

      const text = (card.textContent || '').replace(/\s+/g, ' ').trim();

      // Salary, e.g. "Salary: $80K – $120K per year".
      let salary = '';
      const sm = text.match(/Salary:\s*(.+?per\s+(?:year|month|hour|week|day))/i);
      if (sm) salary = sm[1].trim();

      // Location, e.g. "United States only" / "United Kingdom only" or region
      // codes "AL, AD + 71 more". Title-case country names avoid the leading
      // "View job" + avatar-initials noise in the concatenated text.
      let location = '';
      const lmOnly = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+only\b/);
      const lmMore = text.match(/([A-Z]{2}(?:,\s*[A-Z]{2})*)\s*\+\s*\d+\s+more/);
      if (lmOnly) location = `${lmOnly[1].trim()} only`;
      else if (lmMore) location = lmMore[0].replace(/\s+/g, ' ').trim();
      else if (/worldwide|anywhere/i.test(text)) location = 'Worldwide';

      const posted = card.querySelector('time')?.textContent?.trim() || '';

      if (title) {
        out.push({
          title,
          company,
          location,
          url: cleanUrl,
          posted,
          salary,
          remote: true,
        });
      }
    }
    return out;
  });
}

main().catch(e => { console.error(e); process.exit(1); });
