/**
 * Naukri Complete Profile Updater v3
 * ===================================
 * Final stable version with all reverse-engineered selectors.
 *
 * VERIFIED SELECTORS (from DOM inspection + screenshots):
 *   Headline:  .resumeHeadlineEdit → #resumeHeadlineTxt → button.btn-dark-ot
 *   Skills:    .keySkillsEdit → #keySkillSugg (input) → button.btn-dark-ot
 *   Summary:   .profileSummary .edit.icon → .profileSummaryEdit (lazy loads) → textarea → button.btn-dark-ot
 *   All modals use: .lightbox.profileEditDrawer with flipOpen/flipClose state
 *
 * Also: Job scraping, ATS analysis, and file-based persistence (DB fallback).
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ── Directories ─────────────────────────────────────────────────────
const SESSION_DIR = path.resolve(__dirname, 'sessions', 'naukri-session');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots', 'naukri-v3');
const RESULTS_DIR = path.resolve(__dirname, 'results');
const LOGS_DIR = path.resolve(__dirname, 'logs');

[SESSION_DIR, SCREENSHOTS_DIR, RESULTS_DIR, LOGS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const delay = (min, max) => sleep(min + Math.random() * (max - min));

// ── Logging ─────────────────────────────────────────────────────────
const logEntries = [];
function log(level, msg) {
  logEntries.push({ ts: new Date().toISOString(), level, msg });
  const icon = { ok: '✅', warn: '⚠️', error: '❌', info: '  ' }[level] || '  ';
  console.log(`${icon} ${msg}`);
}
async function snap(page, name) {
  const p = path.join(SCREENSHOTS_DIR, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

// ── Content ─────────────────────────────────────────────────────────
const HEADLINE = 'Backend Engineer | Java · Spring Boot · Microservices · REST APIs | Full Stack (React/Next.js) | Agentic AI (Claude) · Azure · Kafka | Portfolio: aryantomarresume.vercel.app';

const SUMMARY = `Backend-focused software engineer with hands-on experience building scalable systems, REST APIs, and automation workflows using Java, Spring Boot, PostgreSQL, and microservices architecture.

Currently building JobFlow AI — an AI-powered career automation platform featuring Playwright browser automation, Groq LLM integration, ATS scoring engine, PostgreSQL/Supabase backend, and a Next.js analytics dashboard.

Hands-on working experience with Agentic AI — designed and integrated Claude (Anthropic) into projects to build autonomous, tool-using agents that plan, reason, and execute multi-step workflows end to end.

Key projects: ConnectVerse (real-time social platform with WebRTC), AEPS Agent Onboarding (fintech biometric with AES-256), mSwasth (healthcare portal, 500+ records), FindiInsure (insurance marketplace).

Core stack: Java, Spring Boot, REST APIs, PostgreSQL, SQL, Microservices, React.js, Next.js, TypeScript, Docker, Kafka, Microsoft Azure (AKS, App Services), Playwright, Supabase, Agentic AI, Claude/LLM integration.

Open to Backend Engineer, Full Stack Engineer, and SDE roles.`;

const NEW_SKILLS = [
  'PostgreSQL', 'Microservices', 'Docker', 'TypeScript', 'REST API',
  'Redis', 'MongoDB', 'Maven', 'System Design', 'Data Structures',
  'Tailwind CSS', 'Node.js', 'Supabase', 'Spring Security', 'JUnit',
  'Agile', 'CI/CD', 'AWS',
  'Microsoft Azure', 'Agentic AI', 'Azure Kubernetes Service', 'Kafka', 'Azure App Services',
];

// ── Drawer helpers ──────────────────────────────────────────────────
async function waitDrawerOpen(page, sel, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const open = await page.evaluate(s => {
      const el = document.querySelector(s);
      return el && (el.classList.contains('flipOpen') || el.classList.contains('model_open'));
    }, sel);
    if (open) return true;
    await sleep(400);
  }
  return false;
}

async function waitDrawerHasContent(page, sel, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const has = await page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) return false;
      return el.querySelectorAll('input, textarea, button').length > 1;
    }, sel);
    if (has) return true;
    await sleep(500);
  }
  return false;
}

// ── Profile Update: Headline ────────────────────────────────────────
async function updateHeadline(page) {
  log('info', '📝 Updating headline...');

  await page.evaluate(() => {
    const w = [...document.querySelectorAll('.widgetHead')].find(w => w.textContent?.includes('Resume headline'));
    w?.querySelector('.edit')?.click();
  });

  if (!await waitDrawerOpen(page, '.resumeHeadlineEdit')) {
    log('error', 'Headline drawer failed to open');
    return false;
  }

  const ta = await page.$('#resumeHeadlineTxt');
  if (!ta) { log('error', 'Headline textarea not found'); return false; }

  await ta.click({ clickCount: 3 });
  await delay(200, 400);
  await ta.fill(HEADLINE);
  await delay(300, 600);

  await snap(page, 'headline-filled');

  const btn = await page.$('.resumeHeadlineEdit button.btn-dark-ot');
  if (btn) { await btn.click(); log('ok', 'Headline saved'); }

  // Ensure modal is fully closed before proceeding
  await delay(1500, 2500);
  await page.keyboard.press('Escape');
  await delay(500, 1000);

  await snap(page, 'headline-saved');
  return true;
}

// ── Profile Update: Skills ──────────────────────────────────────────
async function updateSkills(page) {
  log('info', '📝 Updating skills...');

  await page.evaluate(() => {
    document.querySelector('.keySkills')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await delay(1500, 2500);

  await page.evaluate(() => {
    const w = [...document.querySelectorAll('.widgetHead')].find(w => w.textContent?.includes('Key skill'));
    w?.querySelector('.edit')?.click();
  });

  if (!await waitDrawerOpen(page, '.keySkillsEdit')) {
    log('error', 'Skills drawer failed to open');
    return false;
  }
  await delay(500, 1000);

  // Get current skills
  const current = await page.evaluate(() => {
    return [...document.querySelectorAll('.keySkillsEdit .chip .tagTxt')].map(c => c.textContent?.trim()).filter(Boolean);
  });
  log('info', `Current: ${current.length} skills`);

  const currentLower = new Set(current.map(s => s.toLowerCase()));
  const toAdd = NEW_SKILLS.filter(s => !currentLower.has(s.toLowerCase()));
  log('info', `Adding: ${toAdd.length} new skills`);

  const input = await page.$('#keySkillSugg');
  if (!input) { log('error', 'Skills input not found'); return false; }

  for (const skill of toAdd) {
    await input.click();
    await input.fill('');
    await delay(150, 300);
    await page.keyboard.type(skill, { delay: 25 + Math.random() * 25 });
    await delay(600, 1000);

    // Click suggestion or press Enter
    const clicked = await page.evaluate(name => {
      const items = document.querySelectorAll('.keySkillSuggCont li, .suggest li');
      for (const li of items) {
        if (li.textContent?.toLowerCase().includes(name.toLowerCase())) { li.click(); return true; }
      }
      return false;
    }, skill);

    if (!clicked) await page.keyboard.press('Enter');
    await delay(300, 500);
  }

  await snap(page, 'skills-filled');

  const btn = await page.$('.keySkillsEdit button.btn-dark-ot');
  if (btn) { await btn.click(); log('ok', 'Skills saved'); }

  // Ensure modal is fully closed before proceeding
  await delay(1500, 2500);
  await page.keyboard.press('Escape');
  await delay(500, 1000);

  await snap(page, 'skills-saved');
  return true;
}

// ── Profile Update: Summary ─────────────────────────────────────────
async function updateSummary(page) {
  log('info', 'Updating profile summary...');

  // FULL-PAGE SCROLL to force lazy-load all sections (proven approach from v2)
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < pageHeight; y += 400) {
    await page.evaluate(yy => window.scrollTo(0, yy), y);
    await delay(200, 400);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(1000, 1500);

  // Scroll to profileSummary section
  const found = await page.evaluate(() => {
    const el = document.querySelector('.profileSummary');
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return true; }
    return false;
  });
  if (!found) { log('error', '.profileSummary section not found'); return false; }
  await delay(1000, 1500);

  // Click edit icon
  const clicked = await page.evaluate(() => {
    const section = document.querySelector('.profileSummary');
    if (!section) return false;
    const edit = section.querySelector('span.edit.icon');
    if (edit) { edit.click(); return true; }
    return false;
  });
  if (!clicked) { log('error', 'Summary edit icon not found'); return false; }
  log('info', 'Summary edit icon clicked');
  await delay(2000, 3000);

  // Wait for drawer with textarea
  const hasTextarea = await page.evaluate(() => {
    const drawer = document.querySelector('.profileSummaryEdit');
    return drawer && drawer.querySelector('textarea') ? true : false;
  });
  if (!hasTextarea) {
    // retry with wait
    await delay(2000, 3000);
    const retry = await page.evaluate(() => {
      const drawer = document.querySelector('.profileSummaryEdit');
      return drawer && drawer.querySelector('textarea') ? true : false;
    });
    if (!retry) { log('error', 'Summary textarea not found'); await snap(page, 'summary-no-textarea'); return false; }
  }

  log('ok', 'Summary textarea loaded');
  await snap(page, 'summary-modal-open');

  // Fill textarea using React-compatible setter
  const filled = await page.evaluate((text) => {
    const ta = document.querySelector('.profileSummaryEdit textarea, #profileSummaryTxt');
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, SUMMARY);
  if (!filled) { log('error', 'Failed to fill summary'); return false; }

  log('ok', 'Summary text filled');
  await delay(500, 1000);
  await snap(page, 'summary-filled');

  // Click Save
  const saved = await page.evaluate(() => {
    const drawer = document.querySelector('.profileSummaryEdit');
    if (drawer) {
      const btn = drawer.querySelector('button.btn-dark-ot');
      if (btn && !btn.disabled) { btn.click(); return true; }
    }
    // fallback: any open lightbox
    const lightboxes = document.querySelectorAll('.lightbox');
    for (const lb of lightboxes) {
      if (lb.classList.contains('flipClose')) continue;
      const btn = lb.querySelector('button.btn-dark-ot');
      if (btn && !btn.disabled) { btn.click(); return true; }
    }
    return false;
  });
  if (!saved) { log('error', 'Save button not found'); return false; }

  log('info', 'Summary save clicked');
  await delay(2000, 3000);

  // Handle confirmation dialog
  await page.evaluate(() => {
    const box = document.querySelector('.profileSummaryConfirmation, .res360editconfirmationBox');
    if (box && (box.offsetParent !== null || !box.classList.contains('flipClose'))) {
      const btns = box.querySelectorAll('button');
      for (const b of btns) {
        const t = b.textContent?.trim().toLowerCase();
        if (t && !t.includes('cancel') && !t.includes('no')) { b.click(); return; }
      }
    }
  });
  await delay(2000, 3000);

  // Ensure all modals are closed
  await page.keyboard.press('Escape');
  await delay(500, 1000);

  await snap(page, 'summary-after-save');
  log('ok', 'Summary update complete');
  return true;
}

// ── Job Search ──────────────────────────────────────────────────────
const SEARCHES = [
  { role: 'Java Developer', location: 'Noida', experience: '0-2' },
  { role: 'Spring Boot Developer', location: 'Noida', experience: '0-2' },
  { role: 'Backend Engineer', location: 'Bangalore', experience: '0-2' },
  { role: 'Full Stack Developer', location: 'Gurugram', experience: '0-2' },
  { role: 'Java Developer', location: 'Pune', experience: '0-2' },
  { role: 'Java Developer', location: 'Bangalore', experience: '0-2' },
  { role: 'Backend Engineer', location: 'Noida', experience: '0-2' },
  { role: 'Software Developer Java', location: 'Remote', experience: '0-2' },
];

async function scrapeJobs(page) {
  const all = [];
  const seen = new Set();

  for (const s of SEARCHES) {
    const q = encodeURIComponent(s.role).replace(/%20/g, '-');
    const url = `https://www.naukri.com/${q}-jobs?l=${encodeURIComponent(s.location)}&experience=${s.experience}`;

    log('info', `🔎 "${s.role}" in ${s.location}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000, 6000);

    const jobs = await page.evaluate(() => {
      const cards = document.querySelectorAll('.srp-jobtuple-wrapper, article.jobTuple, .cust-job-tuple');
      return [...cards].map(c => {
        const gt = s => { for (const sel of s.split(',')) { const el = c.querySelector(sel.trim()); if (el?.textContent?.trim()) return el.textContent.trim(); } return ''; };
        const title = gt('.title, a.title');
        if (!title) return null;
        const link = c.querySelector('.title a, a.title');
        const skills = [...c.querySelectorAll('.tags-gt a, .tag-li a')].map(e => e.textContent?.trim()).filter(Boolean);
        return {
          title, company: gt('.comp-name, a.comp-name'),
          experience: gt('.expwdth, .exp'), salary: gt('.sal, .salary'),
          location: gt('.loc, .location'), url: link?.href || '',
          postedDate: gt('.job-post-day, .date'), skills: [...new Set(skills)],
        };
      }).filter(Boolean);
    });

    for (const j of jobs) {
      if (j.url && !seen.has(j.url)) { seen.add(j.url); j.query = s.role; j.searchLoc = s.location; all.push(j); }
    }
    log('info', `  ${jobs.length} found (${all.length} unique total)`);
    await delay(4000, 7000);
  }
  return all;
}

// ── ATS Scoring ─────────────────────────────────────────────────────
const ATS_KW = ['java','python','javascript','typescript','spring boot','spring','react','angular','next.js','node.js','postgresql','mysql','mongodb','redis','docker','kubernetes','aws','azure','microservices','rest api','graphql','agile','system design','data structures','git','kafka','maven','hibernate','ci/cd','linux','jira'];
const MY_SKILLS = ['java','spring boot','rest api','microservices','postgresql','sql','react.js','next.js','typescript','javascript','docker','node.js','git','redis','mongodb','playwright','html','css','tailwind css','aws','system design','data structures','maven','junit','hibernate','spring security','kafka','ci/cd','agile','supabase','azure','microsoft azure','azure kubernetes service','aks','azure app services','app service','agentic ai','claude','llm'];

function analyze(job) {
  const jk = [...new Set([...job.skills.map(s => s.toLowerCase()), ...ATS_KW.filter(k => (job.title || '').toLowerCase().includes(k))])];
  const matched = jk.filter(k => MY_SKILLS.some(u => u.includes(k) || k.includes(u)));
  const missing = jk.filter(k => !matched.includes(k));
  let ats = jk.length ? Math.round((matched.length / jk.length) * 100) : 50;
  if (matched.length >= 5) ats = Math.min(100, ats + 10);
  if (missing.length > 5) ats = Math.max(0, ats - 10);

  const exp = (job.experience || '').toLowerCase();
  const expOk = /[012]|fresher/.test(exp);
  const locs = ['noida','gurugram','gurgaon','bangalore','bengaluru','pune','remote','delhi','ncr'];
  const locOk = locs.some(l => (job.location || '').toLowerCase().includes(l));

  const posted = (job.postedDate || '').toLowerCase();
  let days = 30;
  if (/today|just now|few hour/.test(posted)) days = 0;
  else if (/1 day|yesterday/.test(posted)) days = 1;
  else { const m = posted.match(/(\d+)\s*day/); if (m) days = parseInt(m[1]); }

  const prob = Math.round(Math.min(100, ats * 0.35 + (expOk ? 25 : 5) + (locOk ? 15 : 5) + (days <= 2 ? 20 : days <= 7 ? 15 : days <= 14 ? 10 : 5)));
  const t = (job.title || '').toLowerCase();
  const prio = (t.includes('walk-in') || t.includes('mass hiring')) ? 'SKIP' :
    (ats >= 65 && prob >= 55) ? 'HIGH' : (ats >= 45 && prob >= 40) ? 'GOOD' : ats >= 30 ? 'LOW' : 'SKIP';

  return { ...job, atsScore: ats, matchedKeywords: matched, missingKeywords: missing, interviewProbability: prob, priority: prio, expOk, locOk, recencyDays: days };
}

// ── DB Persistence (Local PostgreSQL) ────────────────────────────────
const USER_ID = 'a0000000-0000-0000-0000-000000000001';

async function getDbPool() {
  const DB_URL = process.env.DATABASE_URL;
  if (!DB_URL) throw new Error('DATABASE_URL not set');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DB_URL, max: 5, connectionTimeoutMillis: 8000 });
  await pool.query('SELECT 1');
  return pool;
}

async function persistToDB(jobs) {
  const pool = await getDbPool();
  log('ok', 'Local PostgreSQL connected');

  // Create scrape run
  const runRes = await pool.query(
    `INSERT INTO scrape_runs (user_id, platform, search_params, status)
     VALUES ($1, 'naukri', $2::jsonb, 'running') RETURNING id`,
    [USER_ID, JSON.stringify({ source: 'naukri-pipeline-v3', jobCount: jobs.length })]
  );
  const runId = runRes.rows[0].id;

  let ins = 0, upd = 0, atsCount = 0, errors = 0;
  for (const j of jobs) {
    try {
      const eid = (j.url || '').split('/').pop() || Buffer.from(`${j.title}|${j.company}`).toString('base64').substring(0, 200);
      const expMatch = (j.experience || '').match(/(\d+)\s*-\s*(\d+)/);
      const salMatch = (j.salary || '').match(/([\d.]+)\s*-\s*([\d.]+)/);

      const r = await pool.query(
        `INSERT INTO jobs (external_job_id, source_platform, title, company_name, location,
          experience_min, experience_max, salary_min, salary_max, salary_currency,
          job_url, skills, raw_data, scraped_at, last_seen_at)
         VALUES ($1, 'naukri', $2, $3, $4, $5, $6, $7, $8, 'INR', $9, $10::jsonb, $11::jsonb, NOW(), NOW())
         ON CONFLICT (external_job_id, source_platform) DO UPDATE SET
           title = EXCLUDED.title, last_seen_at = NOW(), is_active = TRUE
         RETURNING id, (xmax = 0) AS is_new`,
        [eid, j.title, j.company, j.location,
         expMatch ? +expMatch[1] : null, expMatch ? +expMatch[2] : null,
         salMatch ? Math.round(+salMatch[1] * 1e5) : null, salMatch ? Math.round(+salMatch[2] * 1e5) : null,
         j.url || '', JSON.stringify(j.skills || []),
         JSON.stringify({ query: j.query, posted: j.postedDate, searchLoc: j.searchLoc })]
      );
      if (r.rows[0]?.is_new) ins++; else upd++;

      // Persist ATS analysis
      if (j.atsScore !== undefined) {
        await pool.query(
          `INSERT INTO ats_analysis (job_id, user_id, ats_score, keyword_match_pct,
            matched_keywords, missing_keywords, priority, interview_probability)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
           ON CONFLICT DO NOTHING`,
          [r.rows[0].id, USER_ID, j.atsScore, j.atsScore,
           JSON.stringify(j.matchedKeywords || []), JSON.stringify(j.missingKeywords || []),
           j.priority || 'UNKNOWN', j.interviewProbability || 0]
        );
        atsCount++;
      }

      // Observability: log each persisted job
      await pool.query(
        `INSERT INTO ingestion_logs (scrape_run_id, platform, event_type, message, metadata)
         VALUES ($1, 'naukri', 'job_persisted', $2, $3::jsonb)`,
        [runId, `${j.title} @ ${j.company}`, JSON.stringify({ atsScore: j.atsScore, priority: j.priority })]
      );
    } catch (e) {
      errors++;
      await pool.query(
        `INSERT INTO ingestion_logs (scrape_run_id, platform, event_type, message, metadata)
         VALUES ($1, 'naukri', 'error', $2, $3::jsonb)`,
        [runId, e.message.substring(0, 200), JSON.stringify({ job: j.title })]
      ).catch(() => {});
    }
  }

  // Complete scrape run
  await pool.query(
    `UPDATE scrape_runs SET jobs_found = $2, jobs_new = $3, jobs_updated = $4, jobs_skipped = $5,
       status = 'completed', completed_at = NOW() WHERE id = $1`,
    [runId, jobs.length, ins, upd, errors]
  );

  // Persist scraping metrics
  for (const [name, val] of [['jobs_inserted', ins], ['jobs_updated', upd], ['ats_analyses', atsCount], ['errors', errors]]) {
    await pool.query(
      `INSERT INTO scraping_metrics (scrape_run_id, platform, metric_name, metric_value) VALUES ($1, 'naukri', $2, $3)`,
      [runId, name, val]
    );
  }

  log('ok', `DB: ${ins} new, ${upd} updated, ${atsCount} ATS scores, ${errors} errors`);
  await pool.end();
  return { db: true, inserted: ins, updated: upd, atsScores: atsCount, errors, scrapeRunId: runId };
}

// ── MAIN ────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  NAUKRI PIPELINE v3 — COMPLETE PROFILE + JOBS + PERSISTENCE');
  console.log('═'.repeat(70) + '\n');

  const results = { profile: {}, jobs: {}, db: {}, screenshots: [] };

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false, slowMo: 30,
    viewport: { width: 1920, height: 1080 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'en-IN', timezoneId: 'Asia/Kolkata',
  });

  const page = context.pages()[0] || await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); window.chrome = { runtime: {} }; });

  try {
    // ── LOGIN ──
    log('info', '━━━ STEP 1: LOGIN ━━━');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000, 5000);

    let loggedIn = !page.url().includes('/nlogin');
    if (!loggedIn) {
      await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await delay(2000, 3000);
      await page.fill('input[placeholder="Enter Email ID / Username"]', process.env.NAUKRI_EMAIL || '');
      await delay(400, 700);
      await page.fill('input[placeholder="Enter Password"]', process.env.NAUKRI_PASSWORD || '');
      await delay(400, 800);
      await page.click('button[type="submit"]');
      try {
        await page.waitForSelector('.nI-gNb-header__userImg, .user-img', { timeout: 15000 });
        loggedIn = true;
      } catch {
        if (await page.$('input[placeholder*="OTP"]')) {
          log('warn', '📱 OTP needed — enter manually (90s)');
          try { await page.waitForSelector('.nI-gNb-header__userImg', { timeout: 90000 }); loggedIn = true; } catch {}
        }
      }
    }

    log(loggedIn ? 'ok' : 'error', `Login: ${loggedIn ? 'SUCCESS' : 'FAILED'}`);
    if (!loggedIn) { await context.close(); return; }

    // ── PROFILE UPDATES ──
    log('info', '━━━ STEP 2: PROFILE UPDATES ━━━');

    // 2A: Headline
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000, 5000);
    await snap(page, 'BEFORE');
    results.profile.headline = await updateHeadline(page);
    await delay(3000, 4000);

    // 2B: Skills (reload to avoid stale DOM)
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000, 5000);
    results.profile.skills = await updateSkills(page);
    await delay(3000, 4000);

    // 2C: Summary (reload)
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000, 5000);
    results.profile.summary = await updateSummary(page);
    await delay(3000, 4000);

    // Final profile screenshot
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000, 5000);
    await snap(page, 'AFTER-top');
    for (let i = 0; i < 6; i++) { await page.evaluate(() => window.scrollBy(0, 500)); await delay(300, 500); }
    await snap(page, 'AFTER-scrolled');

    // Verify final state
    const finalProfile = await page.evaluate(() => {
      const gt = s => { for (const sel of s.split(',')) { const el = document.querySelector(sel.trim()); if (el?.textContent?.trim()) return el.textContent.trim(); } return ''; };
      return {
        headline: gt('.resumeHeadline .content, .resumeHeadline p, .resumeHeadline .txt'),
        summary: gt('.profileSummary .content, .profileSummary p, .profileSummary .txt').substring(0, 100),
        skillCount: document.querySelectorAll('.keySkills .chip, .keyskillList span').length,
        profileUpdated: gt('[class*="lastUpdated"], [class*="profileLastUpdated"]'),
      };
    });

    log('info', `Final headline: ${finalProfile.headline?.substring(0, 80) || '(empty)'}`);
    log('info', `Final summary: ${finalProfile.summary || '(empty)'}`);
    log('info', `Final skills: ${finalProfile.skillCount}`);
    results.profile.final = finalProfile;

    // ── JOB DISCOVERY ──
    log('info', '━━━ STEP 3: JOB DISCOVERY ━━━');
    const allJobs = await scrapeJobs(page);
    log('ok', `Total unique jobs: ${allJobs.length}`);

    // ── ATS ANALYSIS ──
    log('info', '━━━ STEP 4: ATS ANALYSIS ━━━');
    const analyzed = allJobs.map(analyze);
    analyzed.sort((a, b) => {
      const po = { HIGH: 0, GOOD: 1, LOW: 2, SKIP: 3 };
      return (po[a.priority] - po[b.priority]) || (b.atsScore - a.atsScore);
    });

    const high = analyzed.filter(j => j.priority === 'HIGH');
    const good = analyzed.filter(j => j.priority === 'GOOD');

    results.jobs = {
      total: allJobs.length, high: high.length, good: good.length,
      avgATS: Math.round(analyzed.reduce((a, j) => a + j.atsScore, 0) / analyzed.length),
      avgProb: Math.round(analyzed.reduce((a, j) => a + j.interviewProbability, 0) / analyzed.length),
    };

    // Print top 20
    console.log('\n  🏆 TOP 20:');
    const p = (s, n) => String(s || '').substring(0, n).padEnd(n);
    analyzed.filter(j => j.priority !== 'SKIP').slice(0, 20).forEach((j, i) => {
      console.log(`  ${p(i + 1, 3)} ${p(j.priority, 6)} ATS:${p(j.atsScore + '%', 5)} Prob:${p(j.interviewProbability + '%', 5)} ${p(j.title, 35)} ${p(j.company, 22)} ${(j.location || '').substring(0, 20)}`);
    });

    // ── PERSISTENCE ──
    log('info', '━━━ STEP 5: PERSISTENCE ━━━');
    results.db = await persistToDB(analyzed);

    // Save full results
    fs.writeFileSync(path.join(RESULTS_DIR, 'naukri-v3-results.json'), JSON.stringify({
      ...results, topJobs: analyzed.filter(j => j.priority !== 'SKIP').slice(0, 30),
    }, null, 2));

    // Save logs
    fs.writeFileSync(path.join(LOGS_DIR, `naukri-v3-${Date.now()}.json`), JSON.stringify(logEntries, null, 2));

    // ── FINAL REPORT ──
    console.log('\n' + '═'.repeat(70));
    console.log('  PIPELINE v3 COMPLETE');
    console.log('═'.repeat(70));
    console.log(`  Headline:    ${results.profile.headline ? '✅ Updated' : '❌ Failed'}`);
    console.log(`  Skills:      ${results.profile.skills ? '✅ Updated' : '❌ Failed'}`);
    console.log(`  Summary:     ${results.profile.summary ? '✅ Updated' : '❌ Failed'}`);
    console.log(`  Jobs found:  ${results.jobs.total}`);
    console.log(`  HIGH:        ${results.jobs.high}`);
    console.log(`  GOOD:        ${results.jobs.good}`);
    console.log(`  Avg ATS:     ${results.jobs.avgATS}%`);
    console.log(`  Avg Prob:    ${results.jobs.avgProb}%`);
    console.log(`  DB:          ${results.db.db ? 'PostgreSQL' : 'File'} — ${results.db.inserted} new, ${results.db.updated} updated`);
    console.log(`  ⚠️  NO APPLICATIONS SUBMITTED`);
    console.log('═'.repeat(70) + '\n');

  } catch (err) {
    log('error', `Fatal: ${err.message}`);
    await snap(page, 'fatal-error').catch(() => {});
  } finally {
    await sleep(3000);
    await context.close();
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
