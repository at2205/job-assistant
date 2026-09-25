/**
 * Naukri Profile Updater v2 — Stable Modal Orchestration
 * ======================================================
 * Uses reverse-engineered Naukri DOM selectors:
 *   - Lightbox drawers: .lightbox.profileEditDrawer with flipOpen/flipClose
 *   - Headline: .resumeHeadlineEdit → #resumeHeadlineTxt → button.btn-dark-ot
 *   - Skills: .keySkillsEdit → #keySkillSugg → .waves-effect.chip → button.btn-dark-ot
 *   - Summary: .profileSummaryEdit → textarea → button.btn-dark-ot
 *   - Header: em.icon.edit → .profileEditDrawer.model_open → button.btn-dark-ot
 *
 * Also persists scraped jobs to PostgreSQL/Supabase and runs ATS analysis.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// ── Directories ─────────────────────────────────────────────────────
const SESSION_DIR = path.resolve(__dirname, 'sessions', 'naukri-session');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots', 'naukri-v2');
const RESULTS_DIR = path.resolve(__dirname, 'results');
const LOGS_DIR = path.resolve(__dirname, 'logs');

[SESSION_DIR, SCREENSHOTS_DIR, RESULTS_DIR, LOGS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Config ──────────────────────────────────────────────────────────
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const DB_URL = process.env.DATABASE_URL;
const USER_ID = 'a0000000-0000-0000-0000-000000000001'; // Aryan Tomar

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);
const delay = (min, max) => sleep(rand(min, max));
const ts = () => new Date().toISOString();

// ── Observability ───────────────────────────────────────────────────
const logEntries = [];
function log(level, msg, data = {}) {
  const entry = { ts: ts(), level, msg, ...data };
  logEntries.push(entry);
  const prefix = { info: '  ', warn: '  ⚠️', error: '  ❌', ok: '  ✅' }[level] || '  ';
  console.log(`${prefix} ${msg}`);
}

async function screenshot(page, name) {
  const fpath = path.join(SCREENSHOTS_DIR, `${name}-${Date.now()}.png`);
  await page.screenshot({ path: fpath, fullPage: false });
  log('info', `📸 ${name}`);
  return fpath;
}

function saveLogs() {
  const logPath = path.join(LOGS_DIR, `naukri-v2-${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify(logEntries, null, 2));
}

// ── Optimized Content ───────────────────────────────────────────────
const HEADLINE = 'Backend Engineer | Java · Spring Boot · Microservices · REST APIs | Full Stack (React/Next.js) | AI & Automation';

const SUMMARY = `Backend-focused software engineer with hands-on experience building scalable systems, REST APIs, and automation workflows using Java, Spring Boot, PostgreSQL, and microservices architecture.

Currently building JobFlow AI — an AI-powered career automation platform featuring Playwright browser automation, Groq LLM integration, ATS scoring engine, PostgreSQL/Supabase backend, and a Next.js analytics dashboard.

Key projects: ConnectVerse (real-time social platform with WebRTC), AEPS Agent Onboarding (fintech biometric with AES-256), mSwasth (healthcare portal, 500+ records), FindiInsure (insurance marketplace).

Core strengths: Java, Spring Boot, REST APIs, PostgreSQL, SQL, Microservices, React.js, Next.js, TypeScript, Docker, Playwright, Supabase, AI/LLM integration, system design, automation engineering.

Open to Backend Engineer, Full Stack Engineer, and SDE roles.`;

const SKILLS_TO_ADD = [
  'PostgreSQL', 'Microservices', 'Docker', 'TypeScript',
  'REST API', 'Redis', 'MongoDB', 'Maven', 'System Design',
  'Data Structures', 'Tailwind CSS', 'Node.js', 'Supabase',
  'Spring Security', 'JUnit', 'Agile', 'CI/CD', 'AWS',
];

// ── Job Search Config ───────────────────────────────────────────────
const JOB_SEARCHES = [
  { role: 'Java Developer', location: 'Noida', experience: '0-2' },
  { role: 'Spring Boot Developer', location: 'Noida', experience: '0-2' },
  { role: 'Backend Engineer', location: 'Bangalore', experience: '0-2' },
  { role: 'Full Stack Developer', location: 'Gurugram', experience: '0-2' },
  { role: 'Java Developer', location: 'Pune', experience: '0-2' },
  { role: 'Java Developer', location: 'Bangalore', experience: '0-2' },
  { role: 'Backend Engineer', location: 'Noida', experience: '0-2' },
  { role: 'Software Developer Java', location: 'Remote', experience: '0-2' },
];

// ── ATS Scoring (embedded) ──────────────────────────────────────────
const ATS_KW = ['java','python','javascript','typescript','spring boot','spring','react','angular','next.js','node.js','postgresql','mysql','mongodb','redis','docker','kubernetes','aws','azure','microservices','rest api','graphql','agile','system design','data structures','git','kafka','maven','hibernate','ci/cd','linux','jira'];
const USER_SKILLS = ['java','spring boot','rest api','microservices','postgresql','sql','react.js','next.js','typescript','javascript','docker','node.js','git','redis','mongodb','playwright','html','css','tailwind css','aws','system design','data structures','maven','junit','hibernate','spring security','kafka','ci/cd','agile','supabase'];

function atsScore(jobSkills, title) {
  const jk = [...new Set([...jobSkills.map(s=>s.toLowerCase()), ...ATS_KW.filter(k=>(title||'').toLowerCase().includes(k))])];
  if (!jk.length) return { score: 50, matched: [], missing: [], pct: 50 };
  const matched = jk.filter(k => USER_SKILLS.some(u => u.includes(k) || k.includes(u)));
  const missing = jk.filter(k => !matched.includes(k));
  let score = Math.round((matched.length / jk.length) * 100);
  if (matched.length >= 5) score = Math.min(100, score + 10);
  if (missing.length > 5) score = Math.max(0, score - 10);
  return { score, matched, missing, pct: Math.round((matched.length/jk.length)*100) };
}

function interviewProb(ats, expMatch, locMatch, days) {
  return Math.round(Math.min(100, ats*0.35 + (expMatch?25:5) + (locMatch?15:5) + (days<=2?20:days<=7?15:days<=14?10:5)));
}

function priority(ats, prob, title) {
  const t = (title||'').toLowerCase();
  if (t.includes('walk-in')||t.includes('mass hiring')) return 'SKIP';
  if (ats>=65 && prob>=55) return 'HIGH';
  if (ats>=45 && prob>=40) return 'GOOD';
  if (ats>=30) return 'LOW';
  return 'SKIP';
}

// ── Modal Orchestrator ──────────────────────────────────────────────

/**
 * Wait for a Naukri lightbox drawer to be open (flipOpen).
 */
async function waitForDrawerOpen(page, drawerSelector, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const isOpen = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el && (el.classList.contains('flipOpen') || el.classList.contains('model_open'));
    }, drawerSelector);
    if (isOpen) return true;
    await sleep(300);
  }
  return false;
}

/**
 * Wait for drawer to close (flipClose).
 */
async function waitForDrawerClose(page, drawerSelector, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const isClosed = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return !el || el.classList.contains('flipClose') || !el.classList.contains('flipOpen');
    }, drawerSelector);
    if (isClosed) return true;
    await sleep(300);
  }
  return false;
}

/**
 * Detect toast/success notification after save.
 */
async function detectSaveSuccess(page, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await page.evaluate(() => {
      // Check for toast notifications
      const toasts = document.querySelectorAll('[class*="toast"], [class*="Toast"], [class*="snackbar"], [class*="success"], [class*="notification"]');
      for (const t of toasts) {
        if (t.offsetParent !== null && t.textContent?.toLowerCase().includes('success')) return 'toast';
      }
      // Check if drawer closed
      const openDrawers = document.querySelectorAll('.lightbox.flipOpen, .lightbox.model_open');
      if (openDrawers.length === 0) return 'drawer_closed';
      return null;
    });
    if (result) return result;
    await sleep(300);
  }
  return 'timeout';
}

// ── Profile Update Functions ────────────────────────────────────────

async function updateHeadline(page) {
  log('info', '📝 Updating headline...');
  log('info', `Target: "${HEADLINE}"`);

  // Click edit icon for Resume headline
  await page.evaluate(() => {
    const widgets = document.querySelectorAll('.widgetHead');
    for (const w of widgets) {
      if (w.textContent?.includes('Resume headline')) {
        const edit = w.querySelector('.edit');
        if (edit) edit.click();
      }
    }
  });

  // Wait for the drawer to open
  const opened = await waitForDrawerOpen(page, '.resumeHeadlineEdit');
  if (!opened) {
    log('error', 'Headline drawer did not open');
    return false;
  }
  log('ok', 'Headline drawer opened');
  await delay(500, 1000);

  // Clear and type new headline
  const textarea = await page.$('#resumeHeadlineTxt');
  if (!textarea) {
    log('error', 'Headline textarea not found');
    return false;
  }

  // Triple-click to select all, then type replacement
  await textarea.click({ clickCount: 3 });
  await delay(200, 400);
  await page.keyboard.press('Control+A');
  await delay(100, 200);

  // Type the new headline with human-like speed
  await textarea.fill(HEADLINE);
  await delay(500, 1000);

  await screenshot(page, 'headline-filled');

  // Click Save
  const saveBtn = await page.$('.resumeHeadlineEdit button.btn-dark-ot');
  if (!saveBtn) {
    log('error', 'Headline save button not found');
    return false;
  }

  await saveBtn.click();
  log('info', 'Save clicked');

  // Wait for save completion
  const saveResult = await detectSaveSuccess(page);
  log('info', `Save result: ${saveResult}`);

  await delay(1500, 2500);

  // Verify headline updated
  const verified = await page.evaluate((expected) => {
    const headlineEl = document.querySelector('.resumeHeadline .txt, .resumeHeadline p, .resumeHeadline .content');
    return headlineEl?.textContent?.trim()?.includes(expected.substring(0, 30)) || false;
  }, HEADLINE);

  if (verified) {
    log('ok', 'Headline verified on page');
  } else {
    log('warn', 'Headline may not have persisted — verify in screenshot');
  }

  await screenshot(page, 'headline-after-save');
  return true;
}

async function updateSkills(page) {
  log('info', `📝 Updating skills (adding ${SKILLS_TO_ADD.length} new)...`);

  // Scroll to skills and click edit
  await page.evaluate(() => {
    const el = document.querySelector('.keySkills');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await delay(1500, 2500);

  await page.evaluate(() => {
    const widgets = document.querySelectorAll('.widgetHead');
    for (const w of widgets) {
      if (w.textContent?.includes('Key skill')) {
        const edit = w.querySelector('.edit');
        if (edit) edit.click();
      }
    }
  });

  const opened = await waitForDrawerOpen(page, '.keySkillsEdit');
  if (!opened) {
    log('error', 'Skills drawer did not open');
    return false;
  }
  log('ok', 'Skills drawer opened');
  await delay(500, 1000);

  // Get current skills
  const currentSkills = await page.evaluate(() => {
    const chips = document.querySelectorAll('.keySkillsEdit .chip .tagTxt');
    return Array.from(chips).map(c => c.textContent?.trim()).filter(Boolean);
  });
  log('info', `Current skills (${currentSkills.length}): ${currentSkills.join(', ')}`);

  // Add only new skills
  const currentLower = new Set(currentSkills.map(s => s.toLowerCase()));
  const toAdd = SKILLS_TO_ADD.filter(s => !currentLower.has(s.toLowerCase()));
  log('info', `Skills to add: ${toAdd.length}`);

  const input = await page.$('#keySkillSugg');
  if (!input) {
    log('error', 'Skills input not found');
    return false;
  }

  let addedCount = 0;
  for (const skill of toAdd) {
    await input.click();
    await input.fill('');
    await delay(200, 400);

    // Type skill name
    await page.keyboard.type(skill, { delay: 30 + Math.random() * 30 });
    await delay(800, 1200);

    // Check for suggestion dropdown and click first match
    const suggestionClicked = await page.evaluate((skillName) => {
      const suggestions = document.querySelectorAll('.keySkillSuggCont li, .suggest li, [class*="suggest"] li');
      for (const s of suggestions) {
        if (s.textContent?.toLowerCase().includes(skillName.toLowerCase())) {
          s.click();
          return true;
        }
      }
      return false;
    }, skill);

    if (!suggestionClicked) {
      // Press Enter to add as free-text
      await page.keyboard.press('Enter');
    }

    await delay(400, 700);
    addedCount++;
    log('info', `  Added: ${skill}`);
  }

  await screenshot(page, 'skills-filled');

  // Click Save
  const saveBtn = await page.$('.keySkillsEdit button.btn-dark-ot');
  if (saveBtn) {
    await saveBtn.click();
    log('info', 'Skills save clicked');
    const result = await detectSaveSuccess(page);
    log('info', `Save result: ${result}`);
    await delay(1500, 2500);
  }

  // Verify
  const newCount = await page.evaluate(() => {
    const chips = document.querySelectorAll('.keySkills .chip, .keyskillList .chip, .keyskillList a');
    return chips.length;
  });
  log('ok', `Skills count after update: ${newCount} (was ${currentSkills.length})`);

  await screenshot(page, 'skills-after-save');
  return addedCount > 0;
}

async function updateSummary(page) {
  log('info', '📝 Updating profile summary...');

  // Click "Profile summary" in sidebar
  const clicked = await page.evaluate(() => {
    const links = document.querySelectorAll('a, .quickLinks span, .quick-links span');
    for (const a of links) {
      if (a.textContent?.trim().toLowerCase() === 'profile summary') {
        a.click();
        return true;
      }
    }
    // Fallback: scroll to summary section and look for edit/add
    const summarySection = document.querySelector('.profileSummary');
    if (summarySection) {
      summarySection.scrollIntoView({ behavior: 'smooth' });
      const edit = summarySection.querySelector('[class*="edit"], .icon');
      if (edit) { edit.click(); return true; }
    }
    return false;
  });

  if (!clicked) {
    log('warn', 'Profile summary link/edit not found');
    // Try scrolling to find it
    await page.evaluate(() => {
      const el = document.querySelector('.profileSummary');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await delay(1000, 2000);

    // Try clicking edit icon from section
    const editClicked = await page.evaluate(() => {
      const section = document.querySelector('.profileSummary');
      if (!section) return false;
      const edit = section.querySelector('[class*="edit"]');
      if (edit) { edit.click(); return true; }
      // Look for widgetHead with profile summary
      const widgets = document.querySelectorAll('.widgetHead');
      for (const w of widgets) {
        if (w.textContent?.toLowerCase().includes('profile summary')) {
          const e = w.querySelector('.edit');
          if (e) { e.click(); return true; }
        }
      }
      return false;
    });

    if (!editClicked) {
      log('error', 'Could not open summary edit');
      return false;
    }
  }

  await delay(2000, 3000);

  // Wait for summary edit drawer
  const opened = await page.evaluate(() => {
    const drawers = document.querySelectorAll('.lightbox.flipOpen, .lightbox.model_open');
    for (const d of drawers) {
      const ta = d.querySelector('textarea');
      if (ta) return true;
    }
    return false;
  });

  if (!opened) {
    log('warn', 'Summary drawer/textarea not detected');
    await screenshot(page, 'summary-no-modal');

    // Extra attempt: look for any visible textarea
    const found = await page.evaluate(() => {
      const tas = document.querySelectorAll('textarea');
      for (const ta of tas) {
        if (ta.offsetParent !== null && ta.offsetHeight > 50) return true;
      }
      return false;
    });

    if (!found) {
      log('error', 'No summary textarea found');
      return false;
    }
  }

  // Find and fill the textarea
  const filled = await page.evaluate((text) => {
    // Find the open drawer's textarea
    const drawers = document.querySelectorAll('.lightbox.flipOpen, .lightbox.model_open');
    for (const d of drawers) {
      const ta = d.querySelector('textarea');
      if (ta) {
        ta.value = text;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    // Fallback: any visible textarea
    const tas = document.querySelectorAll('textarea');
    for (const ta of tas) {
      if (ta.offsetParent !== null && ta.offsetHeight > 50) {
        ta.value = text;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }, SUMMARY);

  if (!filled) {
    log('error', 'Could not fill summary textarea');
    return false;
  }

  log('ok', 'Summary text filled');
  await delay(500, 1000);
  await screenshot(page, 'summary-filled');

  // Click Save
  const saved = await page.evaluate(() => {
    const drawers = document.querySelectorAll('.lightbox.flipOpen, .lightbox.model_open');
    for (const d of drawers) {
      const btn = d.querySelector('button.btn-dark-ot, button[type="submit"]');
      if (btn && !btn.disabled) { btn.click(); return true; }
    }
    return false;
  });

  if (saved) {
    log('info', 'Summary save clicked');
    await delay(2000, 3000);

    // Handle confirmation dialog (Naukri sometimes asks "Sure you want to replace...")
    const confirmed = await page.evaluate(() => {
      const confirmBox = document.querySelector('.profileSummaryConfirmation');
      if (confirmBox && confirmBox.offsetParent !== null) {
        const yesBtn = confirmBox.querySelector('button, .btn');
        if (yesBtn) { yesBtn.click(); return true; }
      }
      return false;
    });
    if (confirmed) {
      log('info', 'Confirmation dialog accepted');
      await delay(2000, 3000);
    }
  }

  await screenshot(page, 'summary-after-save');
  return true;
}

// ── PostgreSQL Job Persistence ──────────────────────────────────────

async function getDbPool() {
  if (!DB_URL) {
    log('error', 'DATABASE_URL not set');
    return null;
  }
  const pool = new Pool({
    connectionString: DB_URL,
    max: 3,
    idleTimeoutMillis: 15000,
    connectionTimeoutMillis: 10000,
  });
  // Test connection
  try {
    await pool.query('SELECT 1');
    log('ok', 'Database connected');
    return pool;
  } catch (err) {
    log('error', `Database connection failed: ${err.message}`);
    return null;
  }
}

async function persistJobs(pool, jobs) {
  if (!pool || jobs.length === 0) return { inserted: 0, updated: 0 };

  let inserted = 0, updated = 0, errors = 0;

  for (const job of jobs) {
    try {
      // Generate external_job_id from URL or title+company hash
      const externalId = job.url
        ? Buffer.from(job.url).toString('base64').substring(0, 200)
        : Buffer.from(`${job.title}|${job.company}`).toString('base64').substring(0, 200);

      // Parse experience
      const expText = (job.experience || '').replace(/[^0-9\-–]/g, '');
      const expParts = expText.split(/[-–]/);
      const expMin = parseInt(expParts[0]) || null;
      const expMax = parseInt(expParts[1]) || expMin;

      // Parse salary (crude — LPA conversion)
      let salMin = null, salMax = null;
      const salText = (job.salary || '').toLowerCase();
      const salMatch = salText.match(/([\d.]+)\s*-\s*([\d.]+)/);
      if (salMatch) {
        salMin = Math.round(parseFloat(salMatch[1]) * (salText.includes('lakh') || salText.includes('lpa') ? 1 : 1));
        salMax = Math.round(parseFloat(salMatch[2]) * (salText.includes('lakh') || salText.includes('lpa') ? 1 : 1));
      }

      const res = await pool.query(
        `INSERT INTO jobs (
          external_job_id, source_platform, title, company_name, location,
          experience_min, experience_max, salary_min, salary_max, salary_currency,
          job_url, skills, posted_date, raw_data, scraped_at, last_seen_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14::jsonb, NOW(), NOW())
        ON CONFLICT (external_job_id, source_platform) DO UPDATE SET
          title = EXCLUDED.title,
          company_name = COALESCE(EXCLUDED.company_name, jobs.company_name),
          location = COALESCE(EXCLUDED.location, jobs.location),
          skills = CASE WHEN EXCLUDED.skills != '[]'::jsonb THEN EXCLUDED.skills ELSE jobs.skills END,
          last_seen_at = NOW(), is_active = TRUE
        RETURNING id, (xmax = 0) AS is_new`,
        [
          externalId, 'naukri', job.title, job.company, job.location,
          expMin, expMax, salMin, salMax, 'INR',
          job.url || '', JSON.stringify(job.skills || []),
          null, JSON.stringify({ searchQuery: job.searchQuery, postedDate: job.postedDate }),
        ]
      );

      if (res.rows[0]?.is_new) inserted++; else updated++;
    } catch (err) {
      errors++;
      if (!err.message.includes('duplicate')) {
        log('warn', `Job persist error: ${err.message.substring(0, 80)}`);
      }
    }
  }

  log('ok', `Jobs persisted: ${inserted} new, ${updated} updated, ${errors} errors`);
  return { inserted, updated, errors };
}

async function persistATSScores(pool, analyzedJobs) {
  if (!pool || analyzedJobs.length === 0) return 0;

  let count = 0;
  for (const job of analyzedJobs) {
    if (!job.dbId) continue;
    try {
      await pool.query(
        `INSERT INTO job_scores (user_id, job_id, skill_score, experience_score, location_score, salary_score, recency_score, total_score, score_breakdown)
         VALUES ($1, $2, $3, $4, $5, 50, $6, $7, $8::jsonb)
         ON CONFLICT (user_id, job_id) DO UPDATE SET
           skill_score = EXCLUDED.skill_score, experience_score = EXCLUDED.experience_score,
           location_score = EXCLUDED.location_score, recency_score = EXCLUDED.recency_score,
           total_score = EXCLUDED.total_score, score_breakdown = EXCLUDED.score_breakdown, scored_at = NOW()`,
        [
          USER_ID, job.dbId,
          job.atsScore, job.experienceMatch ? 80 : 30,
          job.locationMatch ? 90 : 40,
          job.recencyDays <= 3 ? 90 : job.recencyDays <= 7 ? 70 : 40,
          job.atsScore,
          JSON.stringify({ matched: job.matchedKeywords, missing: job.missingKeywords, priority: job.priority }),
        ]
      );

      // ATS analysis
      await pool.query(
        `INSERT INTO ats_analysis (user_id, job_id, ats_score, keyword_match_pct, matched_keywords, missing_keywords, priority, interview_probability)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)
         ON CONFLICT (user_id, job_id) DO UPDATE SET
           ats_score = EXCLUDED.ats_score, keyword_match_pct = EXCLUDED.keyword_match_pct,
           matched_keywords = EXCLUDED.matched_keywords, missing_keywords = EXCLUDED.missing_keywords,
           priority = EXCLUDED.priority, interview_probability = EXCLUDED.interview_probability, analyzed_at = NOW()`,
        [
          USER_ID, job.dbId, job.atsScore, job.matchPct,
          JSON.stringify(job.matchedKeywords), JSON.stringify(job.missingKeywords),
          job.priority, job.interviewProbability,
        ]
      );

      count++;
    } catch (err) {
      // Silently skip constraint violations
    }
  }

  log('ok', `ATS scores persisted: ${count}`);
  return count;
}

async function createScrapeRun(pool, searchParams, jobsFound, jobsNew, jobsUpdated) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO scrape_runs (user_id, platform, search_params, jobs_found, jobs_new, jobs_updated, status, completed_at)
       VALUES ($1, 'naukri', $2::jsonb, $3, $4, $5, 'completed', NOW())`,
      [USER_ID, JSON.stringify(searchParams), jobsFound, jobsNew, jobsUpdated]
    );
  } catch (err) {
    log('warn', `Scrape run log failed: ${err.message.substring(0, 60)}`);
  }
}

// ── Job Scraping ────────────────────────────────────────────────────
async function scrapeJobs(page) {
  const allJobs = [];
  const seenUrls = new Set();

  for (const search of JOB_SEARCHES) {
    const query = encodeURIComponent(search.role).replace(/%20/g, '-');
    const url = `https://www.naukri.com/${query}-jobs?l=${encodeURIComponent(search.location)}&experience=${search.experience}`;

    log('info', `🔎 "${search.role}" in ${search.location}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000, 6000);

    const jobs = await page.evaluate(() => {
      const cards = document.querySelectorAll('.srp-jobtuple-wrapper, article.jobTuple, .cust-job-tuple');
      const results = [];
      cards.forEach(card => {
        const gt = (s) => { for (const sel of s.split(',')) { const el = card.querySelector(sel.trim()); if (el?.textContent?.trim()) return el.textContent.trim(); } return ''; };
        const title = gt('.title, a.title');
        if (!title) return;
        const linkEl = card.querySelector('.title a, a.title');
        const skills = [];
        card.querySelectorAll('.tags-gt a, .tag-li a, .skill').forEach(el => { const t = el.textContent?.trim(); if (t) skills.push(t); });
        results.push({
          title, company: gt('.comp-name, a.comp-name'),
          experience: gt('.expwdth, .exp'), salary: gt('.sal, .salary'),
          location: gt('.loc, .location'), url: linkEl?.href || '',
          postedDate: gt('.job-post-day, .date'), skills: [...new Set(skills)],
        });
      });
      return results;
    });

    for (const job of jobs) {
      if (job.url && !seenUrls.has(job.url)) {
        seenUrls.add(job.url);
        job.searchQuery = search.role;
        job.searchLocation = search.location;
        allJobs.push(job);
      }
    }

    log('info', `  Found: ${jobs.length} (unique total: ${allJobs.length})`);
    await delay(4000, 8000);
  }

  return allJobs;
}

// ── MAIN ────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  NAUKRI PROFILE OPTIMIZER v2 + JOB PERSISTENCE PIPELINE');
  console.log('═'.repeat(70) + '\n');

  const results = {
    login: null, profileUpdates: [], jobStats: {}, dbStats: {}, screenshots: [],
  };

  // Database
  const pool = await getDbPool();

  // Browser
  log('info', '🚀 Launching browser...');
  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false, slowMo: 30,
    viewport: { width: 1920, height: 1080 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'en-IN', timezoneId: 'Asia/Kolkata',
  });

  const page = context.pages()[0] || await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
  });

  try {
    // ═══════════════════════════════════════════════════════════════
    // STEP 1: LOGIN
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '─'.repeat(50));
    log('info', 'STEP 1: LOGIN');

    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000, 5000);

    let loggedIn = !page.url().includes('/nlogin');
    if (!loggedIn) {
      log('info', 'Logging in...');
      await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await delay(2000, 3000);

      await page.fill('input[placeholder="Enter Email ID / Username"]', process.env.NAUKRI_EMAIL || '');
      await delay(500, 800);
      await page.fill('input[placeholder="Enter Password"]', process.env.NAUKRI_PASSWORD || '');
      await delay(500, 1000);
      await page.click('button[type="submit"]');

      try {
        await page.waitForSelector('.nI-gNb-header__userImg, .user-img, [class*="user-name"]', { timeout: 15000 });
        loggedIn = true;
      } catch {
        // OTP check
        const otp = await page.$('input[placeholder*="OTP"]');
        if (otp) {
          log('warn', '📱 OTP required — enter manually (90s timeout)');
          try {
            await page.waitForSelector('.nI-gNb-header__userImg', { timeout: 90000 });
            loggedIn = true;
          } catch { log('error', 'OTP timeout'); }
        }
      }
    }

    results.login = loggedIn ? 'SUCCESS' : 'FAILED';
    log(loggedIn ? 'ok' : 'error', `Login: ${results.login}`);
    await screenshot(page, 'login-result');

    if (!loggedIn) {
      log('error', 'Cannot proceed without login');
      saveLogs(); await context.close(); if (pool) await pool.end(); return;
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: PROFILE UPDATES
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '─'.repeat(50));
    log('info', 'STEP 2: PROFILE UPDATES');

    // Navigate to profile
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000, 5000);
    await screenshot(page, 'profile-BEFORE');

    // 2A: Headline
    const headlineUpdated = await updateHeadline(page);
    results.profileUpdates.push({ field: 'headline', success: headlineUpdated });
    await delay(2000, 3000);

    // Reload profile for next edit (avoids stale DOM)
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000, 5000);

    // 2B: Skills
    const skillsUpdated = await updateSkills(page);
    results.profileUpdates.push({ field: 'skills', success: skillsUpdated });
    await delay(2000, 3000);

    // Reload
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000, 5000);

    // 2C: Summary
    const summaryUpdated = await updateSummary(page);
    results.profileUpdates.push({ field: 'summary', success: summaryUpdated });
    await delay(2000, 3000);

    // Final profile state
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000, 5000);
    await screenshot(page, 'profile-AFTER');

    // Scroll for full capture
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await delay(400, 700);
    }
    await screenshot(page, 'profile-AFTER-scrolled');

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: JOB DISCOVERY + PERSISTENCE
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '─'.repeat(50));
    log('info', 'STEP 3: JOB DISCOVERY + DB PERSISTENCE');

    const allJobs = await scrapeJobs(page);
    log('ok', `Total unique jobs: ${allJobs.length}`);

    // Persist to DB
    const persistResult = await persistJobs(pool, allJobs);
    results.dbStats.jobsPersisted = persistResult;

    // Create scrape run record
    await createScrapeRun(pool, { searches: JOB_SEARCHES }, allJobs.length, persistResult.inserted, persistResult.updated);

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: ATS ANALYSIS + RANKING
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '─'.repeat(50));
    log('info', 'STEP 4: ATS ANALYSIS + RANKING');

    const preferredLocs = ['noida','gurugram','gurgaon','bangalore','bengaluru','pune','remote','delhi','ncr'];

    const analyzedJobs = allJobs.map(job => {
      const ats = atsScore(job.skills, job.title);
      const expText = (job.experience || '').toLowerCase();
      const expMatch = /[012]|fresher/.test(expText);
      const locMatch = preferredLocs.some(l => (job.location || '').toLowerCase().includes(l));
      const posted = (job.postedDate || '').toLowerCase();
      let days = 30;
      if (/today|just now|few hour/.test(posted)) days = 0;
      else if (/1 day|yesterday/.test(posted)) days = 1;
      else { const m = posted.match(/(\d+)\s*day/); if (m) days = parseInt(m[1]); }

      const prob = interviewProb(ats.score, expMatch, locMatch, days);
      const prio = priority(ats.score, prob, job.title);

      return {
        ...job, atsScore: ats.score, matchedKeywords: ats.matched,
        missingKeywords: ats.missing, matchPct: ats.pct,
        interviewProbability: prob, priority: prio,
        experienceMatch: expMatch, locationMatch: locMatch, recencyDays: days,
      };
    });

    // Get DB IDs for persisted jobs
    if (pool) {
      for (const job of analyzedJobs) {
        try {
          const externalId = job.url
            ? Buffer.from(job.url).toString('base64').substring(0, 200)
            : Buffer.from(`${job.title}|${job.company}`).toString('base64').substring(0, 200);
          const res = await pool.query(
            'SELECT id FROM jobs WHERE external_job_id = $1 AND source_platform = $2',
            [externalId, 'naukri']
          );
          if (res.rows[0]) job.dbId = res.rows[0].id;
        } catch {}
      }
    }

    // Persist ATS scores
    const atsCount = await persistATSScores(pool, analyzedJobs);
    results.dbStats.atsScoresPersisted = atsCount;

    // Sort and categorize
    const pOrder = { HIGH: 0, GOOD: 1, LOW: 2, SKIP: 3 };
    analyzedJobs.sort((a, b) => (pOrder[a.priority] - pOrder[b.priority]) || (b.atsScore - a.atsScore));

    const high = analyzedJobs.filter(j => j.priority === 'HIGH');
    const good = analyzedJobs.filter(j => j.priority === 'GOOD');

    results.jobStats = {
      total: allJobs.length, high: high.length, good: good.length,
      avgATS: Math.round(analyzedJobs.reduce((a,j) => a+j.atsScore, 0) / analyzedJobs.length),
      avgProb: Math.round(analyzedJobs.reduce((a,j) => a+j.interviewProbability, 0) / analyzedJobs.length),
    };

    // Print top 20
    console.log('\n  🏆 TOP 20 MATCHING JOBS:');
    const pad = (s, n) => String(s||'').substring(0, n).padEnd(n);
    console.log('  ' + pad('#', 3) + pad('Prio', 6) + pad('ATS', 5) + pad('Prob', 5) + pad('Title', 35) + pad('Company', 25) + 'Location');
    console.log('  ' + '─'.repeat(90));
    analyzedJobs.filter(j => j.priority !== 'SKIP').slice(0, 20).forEach((j, i) => {
      console.log('  ' + pad(i+1, 3) + pad(j.priority, 6) + pad(j.atsScore+'%', 5) + pad(j.interviewProbability+'%', 5) + pad(j.title, 35) + pad(j.company, 25) + (j.location||'').substring(0, 20));
    });

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: FINAL SUMMARY
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('  PIPELINE COMPLETE');
    console.log('═'.repeat(70));
    console.log(`  Login:              ${results.login}`);
    console.log(`  Headline updated:   ${results.profileUpdates[0]?.success}`);
    console.log(`  Skills updated:     ${results.profileUpdates[1]?.success}`);
    console.log(`  Summary updated:    ${results.profileUpdates[2]?.success}`);
    console.log(`  Jobs discovered:    ${results.jobStats.total}`);
    console.log(`  HIGH priority:      ${results.jobStats.high}`);
    console.log(`  GOOD match:         ${results.jobStats.good}`);
    console.log(`  Avg ATS score:      ${results.jobStats.avgATS}%`);
    console.log(`  Avg interview prob: ${results.jobStats.avgProb}%`);
    console.log(`  Jobs → DB:          ${persistResult.inserted} new, ${persistResult.updated} updated`);
    console.log(`  ATS scores → DB:    ${atsCount}`);
    console.log(`  ⚠️  NO APPLICATIONS SUBMITTED`);
    console.log('═'.repeat(70) + '\n');

    // Save results
    fs.writeFileSync(path.join(RESULTS_DIR, 'naukri-v2-results.json'), JSON.stringify({ ...results, topJobs: analyzedJobs.slice(0, 20) }, null, 2));
    saveLogs();

  } catch (err) {
    log('error', `Fatal: ${err.message}`);
    await screenshot(page, 'error').catch(() => {});
    saveLogs();
  } finally {
    await sleep(3000);
    await context.close();
    if (pool) await pool.end();
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
