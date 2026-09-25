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
  easyApply: boolean;
}

async function main() {
  console.log('============================================================');
  console.log('  LINKEDIN JOB DISCOVERY ENGINE');
  console.log('============================================================\n');

  const userDataDir = path.resolve(process.cwd(), 'sessions', 'li-session');

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

  // ── Search matrix ──────────────────────────────────────────────
  // f_WT = work type (1=onsite, 2=remote, 3=hybrid)
  // f_E  = experience (2=Entry, 3=Associate, 4=Mid-Senior)
  // f_TPR= time posted (r604800 = past week, r2592000 = past month)
  // QUICK mode (LINKEDIN_QUICK=true): fewer roles, Noida+Remote only, 1 page,
  // past week — completes fast even when LinkedIn is throttling.
  const QUICK = /^(1|true|yes)$/i.test(process.env.LINKEDIN_QUICK || '');

  // Custom query set via env:
  //   LINKEDIN_ROLES="java developer,software engineer"  LINKEDIN_CITIES="Hyderabad,Pune,Remote"
  const CUSTOM_ROLES = (process.env.LINKEDIN_ROLES || '').split(',').map(s => s.trim()).filter(Boolean);
  const CUSTOM_CITIES = (process.env.LINKEDIN_CITIES || '').split(',').map(s => s.trim()).filter(Boolean);
  const CUSTOM = CUSTOM_ROLES.length > 0 && CUSTOM_CITIES.length > 0;

  const defaultRoles = QUICK ? [
    'Java Developer',
    'Backend Developer',
    'Full Stack Developer',
    'Software Engineer',
    'React Developer',
    'Node.js Developer',
  ] : [
    'Java Developer',
    'Spring Boot Developer',
    'Backend Developer',
    'Software Developer',
    'Software Engineer',
    'Full Stack Developer',
    'Node.js Developer',
    'React Developer',
    'Javascript Developer',
    'API Developer',
    'Microservices Developer',
    'SDE',
  ];

  // Each location: display label + LinkedIn "location" query value + extra URL params.
  const defaultLocations: { label: string; loc: string; extra?: string }[] = QUICK ? [
    { label: 'Noida', loc: 'Noida, Uttar Pradesh, India', extra: '&distance=50' },
    { label: 'Remote India', loc: 'India', extra: '&f_WT=2' },
  ] : [
    { label: 'Noida', loc: 'Noida, Uttar Pradesh, India', extra: '&distance=50' },
    { label: 'New Delhi', loc: 'New Delhi, Delhi, India', extra: '&distance=40' },
    { label: 'Gurugram', loc: 'Gurugram, Haryana, India', extra: '&distance=40' },
    { label: 'Remote India', loc: 'India', extra: '&f_WT=2' },
  ];

  const roles = CUSTOM ? CUSTOM_ROLES : defaultRoles;
  const locations = CUSTOM
    ? CUSTOM_CITIES.map(c => /^remote$/i.test(c)
        ? { label: 'Remote India', loc: 'India', extra: '&f_WT=2' }
        : { label: c, loc: `${c}, India`, extra: '&distance=40' })
    : defaultLocations;

  // How many result pages to page through per search (25 jobs per page).
  // Override with LINKEDIN_MAX_PAGES (e.g. 1 to go faster when LinkedIn throttles).
  const MAX_PAGES = process.env.LINKEDIN_MAX_PAGES
    ? Math.max(1, parseInt(process.env.LINKEDIN_MAX_PAGES, 10) || 1)
    : (QUICK ? 1 : 3);
  // Quick mode = past week; full mode = past month.
  const TIME_FILTER = QUICK ? 'r604800' : 'r2592000';

  const allJobs: JobResult[] = [];
  const seenUrls = new Set<string>();
  const resultsDir = path.resolve(process.cwd(), 'results');
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
  const checkpointPath = path.join(resultsDir, 'linkedin-checkpoint.json');

  // Extract all job cards currently rendered on the page.
  async function extractCards() {
    return page.evaluate(() => {
      const cards = document.querySelectorAll('.jobs-search-results__list-item, .job-card-container, li.ember-view.occludable-update');
      const results: any[] = [];
      cards.forEach(card => {
        const titleEl = card.querySelector('.job-card-list__title, .job-card-container__link, a.job-card-list__title--link');
        const companyEl = card.querySelector('.job-card-container__primary-description, .artdeco-entity-lockup__subtitle, .job-card-container__company-name');
        const locationEl = card.querySelector('.job-card-container__metadata-item, .artdeco-entity-lockup__caption, .job-card-container__metadata-wrapper');
        const easyApplyEl = card.querySelector('.job-card-container__apply-method, li-icon[type="linkedin-bug"]');

        const title = titleEl?.textContent?.trim() || '';
        const company = companyEl?.textContent?.trim() || '';
        const location = locationEl?.textContent?.trim() || '';
        const url = (titleEl as HTMLAnchorElement)?.closest('a')?.href || (titleEl?.querySelector('a') as HTMLAnchorElement)?.href || '';
        const easyApply = !!easyApplyEl || card.innerHTML.includes('Easy Apply');

        if (title && url) results.push({ title, company, location, url, easyApply });
      });
      return results;
    });
  }

  let loginChecked = false;

  for (const { label, loc, extra } of locations) {
    for (const role of roles) {
      let addedForQuery = 0;

      for (let pageIdx = 0; pageIdx < MAX_PAGES; pageIdx++) {
        const start = pageIdx * 25;
        const searchUrl =
          `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(role)}` +
          `&location=${encodeURIComponent(loc)}` +
          `&f_TPR=${TIME_FILTER}&f_E=2%2C3%2C4&sortBy=R${extra || ''}` +
          (start > 0 ? `&start=${start}` : '');

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(3000 + Math.random() * 2000);

        // Check login state once at the very start.
        if (!loginChecked) {
          loginChecked = true;
          const isLoggedIn = await page.$('nav.global-nav') || await page.$('.jobs-search-results');
          if (!isLoggedIn) {
            console.log('⚠️  Not logged in to LinkedIn. Please login manually...');
            await sleep(30000);
          }
        }

        // Scroll to lazy-load all cards on this page.
        for (let scroll = 0; scroll < 6; scroll++) {
          await page.evaluate(() => window.scrollBy(0, 900));
          await sleep(900);
        }

        const jobs = await extractCards();

        let newOnPage = 0;
        for (const job of jobs) {
          const cleanUrl = job.url.split('?')[0];
          if (!seenUrls.has(cleanUrl)) {
            seenUrls.add(cleanUrl);
            allJobs.push({ ...job, url: cleanUrl, posted: 'past month' });
            newOnPage++;
            addedForQuery++;
          }
        }

        // If a page returns no cards at all, later pages won't either — stop paging.
        if (jobs.length === 0) break;

        await sleep(1500 + Math.random() * 2500);
      }

      console.log(`🔍 ${label} / "${role}" → +${addedForQuery} new (total ${allJobs.length})`);
      // Checkpoint after every query so progress survives a crash / early stop.
      fs.writeFileSync(checkpointPath, JSON.stringify({ timestamp: new Date().toISOString(), jobsSoFar: allJobs.length, allJobs }, null, 2));
      await sleep(1500 + Math.random() * 2000);
    }
  }

  console.log(`\n============================================================`);
  console.log(`  TOTAL UNIQUE JOBS FOUND: ${allJobs.length}`);
  console.log(`============================================================\n`);

  // Separate Easy Apply vs External
  const easyApply = allJobs.filter(j => j.easyApply);
  const external = allJobs.filter(j => !j.easyApply);

  console.log(`✅ Easy Apply: ${easyApply.length}`);
  console.log(`🔗 External Apply: ${external.length}\n`);

  // Print all jobs
  console.log('--- ALL JOBS (sorted by Easy Apply first) ---\n');
  [...easyApply, ...external].forEach((j, i) => {
    console.log(`${i + 1}. ${j.easyApply ? '⚡' : '🔗'} ${j.title} @ ${j.company}`);
    console.log(`   📍 ${j.location}`);
    console.log(`   ${j.url}\n`);
  });

  // Save results
  const filename = `linkedin-jobs-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(resultsDir, filename),
    JSON.stringify({ timestamp: new Date().toISOString(), total: allJobs.length, easyApply: easyApply.length, external: external.length, jobs: allJobs }, null, 2)
  );
  console.log(`\n💾 Saved to results/${filename}`);

  await context.close();
}

main().catch(e => { console.error(e); process.exit(1); });
