import { chromium, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface JobResult {
  title: string;
  company: string;
  location: string;
  salary: string;
  url: string;
  posted: string;
}

// ── Config ─────────────────────────────────────────────────────────
// QUICK mode: fewer roles, Noida + Remote, 1 page, last 7 days — finishes fast.
const QUICK = /^(1|true|yes)$/i.test(process.env.INDEED_QUICK || '');

// Custom query set via env:
//   INDEED_ROLES="java developer,software engineer"  INDEED_CITIES="Hyderabad,Pune"
const CUSTOM_ROLES = (process.env.INDEED_ROLES || '').split(',').map(s => s.trim()).filter(Boolean);
const CUSTOM_CITIES = (process.env.INDEED_CITIES || '').split(',').map(s => s.trim()).filter(Boolean);
const CUSTOM = CUSTOM_ROLES.length > 0 && CUSTOM_CITIES.length > 0;

const DEFAULT_ROLES = QUICK
  ? ['Java Developer', 'Backend Developer', 'Full Stack Developer', 'Software Engineer', 'React Developer', 'Node.js Developer']
  : ['Java Developer', 'Spring Boot Developer', 'Backend Developer', 'Software Developer', 'Software Engineer',
     'Full Stack Developer', 'Node.js Developer', 'React Developer', 'API Developer', 'SDE'];

const DEFAULT_CITIES = QUICK
  ? ['Noida, Uttar Pradesh', 'Remote']
  : ['Noida, Uttar Pradesh', 'New Delhi, Delhi', 'Gurugram, Haryana', 'Remote'];

const ROLES = CUSTOM ? CUSTOM_ROLES : DEFAULT_ROLES;
const CITIES = CUSTOM ? CUSTOM_CITIES : DEFAULT_CITIES;

// Result pages per query (Indeed shows 10-15 cards/page). start = pageIdx * 10.
const MAX_PAGES = QUICK ? 1 : 3;
// Recency filter in days (fromage). QUICK = 7, else 14. Override via INDEED_FROMAGE.
const FROMAGE = process.env.INDEED_FROMAGE || (QUICK ? '7' : '14');
// Domain: in.indeed.com for India.
const BASE = 'https://in.indeed.com';

async function extractCards(page: Page) {
  return page.evaluate(() => {
    const out: any[] = [];
    const cards = document.querySelectorAll('div.job_seen_beacon, .cardOutline, [data-testid="slider_item"]');
    cards.forEach(card => {
      const titleEl = card.querySelector('h2.jobTitle a, a.jcs-JobTitle, h2.jobTitle span');
      const anchor = (card.querySelector('h2.jobTitle a, a.jcs-JobTitle') as HTMLAnchorElement) || null;
      const companyEl = card.querySelector('[data-testid="company-name"], span.companyName');
      const locationEl = card.querySelector('[data-testid="text-location"], div.companyLocation');
      const salaryEl = card.querySelector('[data-testid="attribute_snippet_testid"], .salary-snippet-container, .metadata.salary-snippet-container');
      const postedEl = card.querySelector('[data-testid="myJobsStateDate"], span.date');

      const title = titleEl?.textContent?.trim() || '';
      const company = companyEl?.textContent?.trim() || '';
      const location = locationEl?.textContent?.trim() || '';
      const salary = salaryEl?.textContent?.trim() || 'Not disclosed';
      const posted = postedEl?.textContent?.replace(/^Posted/i, '').trim() || '';

      // Build a stable job URL from the data-jk key when available.
      let url = anchor?.href || '';
      const jk = anchor?.getAttribute('data-jk') || card.querySelector('[data-jk]')?.getAttribute('data-jk') || '';
      if (jk) url = `https://in.indeed.com/viewjob?jk=${jk}`;

      if (title && url) out.push({ title, company, location, salary, url, posted });
    });
    return out;
  });
}

async function main() {
  console.log('============================================================');
  console.log('  INDEED JOB DISCOVERY ENGINE');
  console.log('============================================================\n');

  const userDataDir = path.resolve(process.cwd(), 'sessions', 'indeed-session');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1366, height: 900 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars', '--no-sandbox'],
  });

  const page = context.pages()[0] || await context.newPage();

  const allJobs: JobResult[] = [];
  const seenUrls = new Set<string>();
  const resultsDir = path.resolve(process.cwd(), 'results');
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
  const checkpointPath = path.join(resultsDir, 'indeed-checkpoint.json');

  let challengeWarned = false;

  for (const city of CITIES) {
    for (const role of ROLES) {
      let addedForQuery = 0;

      for (let pageIdx = 0; pageIdx < MAX_PAGES; pageIdx++) {
        const start = pageIdx * 10;
        const remote = /^remote$/i.test(city);
        const params = new URLSearchParams({ q: role, fromage: FROMAGE });
        if (!remote) params.set('l', city);
        if (remote) params.set('sc', '0kf:attr(DSQF7);'); // Indeed "Remote" filter token
        if (start > 0) params.set('start', String(start));
        const url = `${BASE}/jobs?${params.toString()}`;

        let ok = true;
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        } catch {
          ok = false;
        }
        await sleep(2500 + Math.random() * 2500);

        // Detect Cloudflare / captcha challenge and pause for manual solving once.
        const title = (await page.title()).toLowerCase();
        const isChallenge = title.includes('just a moment') || title.includes('verify') ||
          !!(await page.$('#challenge-form, iframe[src*="challenges.cloudflare"]'));
        if (isChallenge) {
          if (!challengeWarned) {
            console.log('⚠️  Indeed anti-bot challenge detected. Solve it in the open window...');
            challengeWarned = true;
          }
          await sleep(20000);
        }

        if (!ok) break;

        // Lazy-load: scroll a few times.
        for (let s = 0; s < 4; s++) {
          await page.evaluate(() => window.scrollBy(0, 900));
          await sleep(700);
        }

        const jobs = await extractCards(page);
        for (const job of jobs) {
          const clean = job.url.split('&')[0]; // keep the jk part only
          if (!seenUrls.has(clean)) {
            seenUrls.add(clean);
            allJobs.push({ ...job, url: clean });
            addedForQuery++;
          }
        }

        if (jobs.length === 0) break;
        await sleep(1500 + Math.random() * 2500);
      }

      console.log(`🔍 ${city} / "${role}" → +${addedForQuery} new (total ${allJobs.length})`);
      // Checkpoint after every query so progress survives a crash.
      fs.writeFileSync(checkpointPath, JSON.stringify({ timestamp: new Date().toISOString(), jobsSoFar: allJobs.length, allJobs }, null, 2));
      await sleep(1500 + Math.random() * 2000);
    }
  }

  console.log(`\n============================================================`);
  console.log(`  TOTAL UNIQUE JOBS FOUND: ${allJobs.length}`);
  console.log(`============================================================\n`);

  allJobs.forEach((j, i) => {
    console.log(`${i + 1}. ${j.title} @ ${j.company}`);
    console.log(`   📍 ${j.location}   💰 ${j.salary}   🕒 ${j.posted}`);
    console.log(`   ${j.url}\n`);
  });

  const filename = `indeed-jobs-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(resultsDir, filename),
    JSON.stringify({ timestamp: new Date().toISOString(), total: allJobs.length, jobs: allJobs }, null, 2)
  );
  console.log(`💾 Saved to results/${filename}`);

  console.log('\n  Browser stays open 20 seconds for review...');
  await sleep(20000);
  await context.close();
}

main().catch(e => { console.error(e); process.exit(1); });
