/**
 * Naukri Profile Premium Upgrade v4
 * ==================================
 * Comprehensive profile transformation:
 *   1. Audit current profile (before screenshots)
 *   2. Upgrade headline
 *   3. Rewrite summary
 *   4. Add/update projects (6 projects)
 *   5. Optimize skills
 *   6. Capture after screenshots
 *   7. Persist optimization data to PostgreSQL
 *
 * Reuses all proven patterns from v3 pipeline + summary-v2.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// ── Directories ──────────────────────────────────────────────────────
const SESSION_DIR = path.resolve(__dirname, 'sessions', 'naukri-session');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots', 'naukri-upgrade-v4');
const RESULTS_DIR = path.resolve(__dirname, 'results');

[SESSION_DIR, SCREENSHOTS_DIR, RESULTS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const delay = (min, max) => sleep(min + Math.random() * (max - min));

// ── Logging ──────────────────────────────────────────────────────────
const logEntries = [];
function log(level, msg) {
  logEntries.push({ ts: new Date().toISOString(), level, msg });
  const icon = { ok: '✅', warn: '⚠️', error: '❌', info: 'ℹ️', step: '🔧' }[level] || '  ';
  console.log(`${icon}  ${msg}`);
}

async function snap(page, name) {
  const p = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

async function snapFull(page, name) {
  const p = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  return p;
}

// ── PostgreSQL ───────────────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

async function persistOptimization(data) {
  try {
    await pool.query(`
      INSERT INTO ingestion_logs (platform, event_type, message, metadata, created_at)
      VALUES ('naukri', 'profile_optimization', $1, $2, NOW())
    `, [
      `Profile upgrade: headline, summary, ${data.projectsAdded} projects, ${data.skillsAdded} skills`,
      JSON.stringify(data)
    ]);
    log('ok', 'Optimization data persisted to PostgreSQL');
  } catch (err) {
    log('warn', `DB persist failed: ${err.message}`);
  }
}

// ── Drawer helpers (proven from v3) ──────────────────────────────────
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

async function scrollFullPage(page) {
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < pageHeight; y += 400) {
    await page.evaluate(yy => window.scrollTo(0, yy), y);
    await sleep(250);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(1000, 1500);
}

// ══════════════════════════════════════════════════════════════════════
// OPTIMIZED CONTENT
// ══════════════════════════════════════════════════════════════════════

const HEADLINE = 'Backend Engineer | Java · Spring Boot · REST APIs · PostgreSQL | Full Stack (React/Next.js) | Building Scalable SaaS & Automation Systems';

const SUMMARY = `Backend engineer specializing in Java, Spring Boot, and scalable API architecture. Currently building production systems that handle real workloads — from enterprise fintech portals to AI-powered automation platforms.

At FindiBankit, leading the migration of a legacy Struts-based admin portal (200+ APIs) to Spring Boot + Next.js for a multi-tier fintech distribution network handling AEPS, DMT, Micro ATM, and IRCTC transactions. Integrating RazorPay, FINO, HubSpot CRM, and AWS S3 with JWT-based RBAC and KYC workflows.

Built JobFlow AI — an end-to-end career intelligence platform featuring Playwright browser automation, PostgreSQL persistence, ATS scoring engine, recruiter analytics, and a Next.js dashboard. The system autonomously scrapes, scores, and ranks 150+ jobs with deterministic retry-safe workflows.

Core stack: Java, Spring Boot, PostgreSQL, REST APIs, Microservices, React.js, Next.js, TypeScript, Docker, Playwright, Redis, AWS.

Shipping code that solves real problems. Open to Backend, Full Stack, and Product Engineering roles.`;

const SKILLS_TO_ADD = [
  'Spring Security', 'JUnit', 'AWS S3', 'Redis',
  'CI/CD', 'Agile', 'Razorpay Integration', 'JWT Authentication',
  'Stored Procedures', 'Apache POI', 'Swagger',
  'Tailwind CSS', 'Supabase', 'WebRTC',
];

const PROJECTS = [
  {
    name: 'CAPS — Channel Administration & Payment System',
    description: 'Enterprise fintech admin portal managing multi-tier distribution network (Super Admin → Distributor → Agent) for AEPS, DMT, Micro ATM, bill payments, and IRCTC bookings. Migrated legacy Struts 2 to Spring Boot + Next.js. Built 200+ REST APIs with JWT RBAC, KYC management with AWS S3, trade balance & fund management, HubSpot CRM integration, RazorPay payment gateway, and Apache POI reporting.',
    url: 'https://caps.bankit.in/',
    tech: 'Java, Spring Boot, Next.js, MS SQL Server, AWS S3, JWT, REST APIs, HubSpot, RazorPay',
  },
  {
    name: 'JobFlow AI — Career Intelligence Platform',
    description: 'AI-powered career automation platform with Playwright browser orchestration, ATS scoring engine (150+ jobs analyzed), recruiter probability scoring, PostgreSQL persistence layer, Spring Boot API backend (51 endpoints), and Next.js analytics dashboard. Deterministic retry-safe workflows with full observability.',
    url: '',
    tech: 'Java, Spring Boot, PostgreSQL, Playwright, Next.js, TypeScript, Groq AI',
  },
  {
    name: 'ConnectVerse — Real-Time Social Platform',
    description: 'Full-stack social platform with WebRTC video calling, GitHub OAuth integration, threaded discussions, community systems, and Dockerized deployment. Real-time communication architecture with persistent messaging.',
    url: '',
    tech: 'Next.js, Spring Boot, PostgreSQL, WebRTC, Docker, OAuth',
  },
  {
    name: 'AEPS Agent Onboarding System',
    description: 'Fintech biometric onboarding pipeline with Aadhaar verification, AES-256 encryption for sensitive data, multi-channel KYC (Mobile + DS Agent), document storage on AWS S3, and agent activation workflows with audit trails.',
    url: '',
    tech: 'Java, Spring MVC, SQL Server, AJAX, AES-256 Encryption, REST APIs',
  },
  {
    name: 'mSwasth — Multilingual Healthcare Portal',
    description: 'Healthcare marketplace with multilingual support, payment gateway integration, dynamic PDF generation (iTextPDF), lead funnel persistence, and security hardening. Managed 500+ healthcare provider records.',
    url: '',
    tech: 'Next.js, React, TypeScript, Tailwind CSS, REST APIs',
  },
  {
    name: 'FindiInsure — Insurance Marketplace',
    description: 'Insurance comparison and purchase platform with OTP verification, checkout architecture, payment gateway workflows, responsive UI with mobile-first design, and secure transaction handling.',
    url: '',
    tech: 'Next.js, React, TypeScript, REST APIs',
  },
];

// ══════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  NAUKRI PROFILE PREMIUM UPGRADE v4');
  console.log('═══════════════════════════════════════════════════════\n');

  const results = {
    headlineUpdated: false,
    summaryUpdated: false,
    projectsAdded: 0,
    skillsAdded: 0,
    beforeScreenshots: [],
    afterScreenshots: [],
    errors: [],
    startedAt: new Date().toISOString(),
  };

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    slowMo: 30,
    viewport: { width: 1920, height: 1080 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });

  const page = context.pages()[0] || await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  try {
    // ── STEP 0: Navigate + Login check ─────────────────────────────
    log('step', 'STEP 0: Navigating to profile...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(4000, 6000);

    if (page.url().includes('/nlogin')) {
      log('info', 'Not logged in. Logging in...');
      await page.fill('input[placeholder="Enter Email ID / Username"]', process.env.NAUKRI_EMAIL);
      await delay(500, 1000);
      await page.fill('input[placeholder="Enter Password"]', process.env.NAUKRI_PASSWORD);
      await delay(500, 1000);
      await page.click('button[type="submit"]');
      await delay(5000, 8000);
      await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(4000, 6000);
    }

    log('ok', 'Profile page loaded');

    // ── STEP 1: BEFORE SCREENSHOTS + AUDIT ─────────────────────────
    log('step', 'STEP 1: Capturing BEFORE state...');
    results.beforeScreenshots.push(await snap(page, '01-BEFORE-top'));
    await scrollFullPage(page);
    results.beforeScreenshots.push(await snapFull(page, '01-BEFORE-full'));

    const audit = await page.evaluate(() => {
      const headline = document.querySelector('.resumeHeadline .txt, .resumeHeadline .heading')?.textContent?.trim() || '';
      const summary = document.querySelector('.profileSummary .prefill, .profileSummary .txt')?.textContent?.trim() || '';
      const skillEls = document.querySelectorAll('.keySkills .chip, .keySkills .tag, .key-skill .chip');
      const skills = [...skillEls].map(s => s.textContent?.trim()).filter(Boolean);
      const projectEls = document.querySelectorAll('.projects .project, [class*="project"] .heading');
      const projects = [...projectEls].map(p => p.textContent?.trim()).filter(Boolean);
      const completeness = document.querySelector('.profileCompleteness .percentage, [class*="completeness"] [class*="percent"]')?.textContent?.trim() || '';
      return { headline, summary: summary.substring(0, 200), skills, skillCount: skills.length, projects, projectCount: projects.length, completeness };
    });

    log('info', `Current headline: "${audit.headline?.substring(0, 80)}..."`);
    log('info', `Current skills: ${audit.skillCount} | Projects: ${audit.projectCount}`);
    log('info', `Profile completeness: ${audit.completeness}`);

    // ── STEP 2: UPGRADE HEADLINE ───────────────────────────────────
    log('step', 'STEP 2: Upgrading headline...');
    await page.evaluate(() => window.scrollTo(0, 0));
    await delay(1000, 1500);

    await page.evaluate(() => {
      const w = [...document.querySelectorAll('.widgetHead')].find(w => w.textContent?.includes('Resume headline'));
      w?.querySelector('.edit')?.click();
    });

    if (await waitDrawerOpen(page, '.resumeHeadlineEdit')) {
      const ta = await page.$('#resumeHeadlineTxt');
      if (ta) {
        await ta.click({ clickCount: 3 });
        await delay(200, 400);
        await ta.fill(HEADLINE);
        await delay(300, 600);
        await snap(page, '02-headline-filled');

        const btn = await page.$('.resumeHeadlineEdit button.btn-dark-ot');
        if (btn) { await btn.click(); results.headlineUpdated = true; log('ok', 'Headline upgraded'); }
        await delay(3000, 5000);
      }
    } else {
      log('error', 'Headline drawer failed');
      results.errors.push('headline_drawer_failed');
    }

    // ── STEP 3: REWRITE SUMMARY ────────────────────────────────────
    log('step', 'STEP 3: Rewriting summary...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(4000, 6000);
    await scrollFullPage(page);

    const summarySection = await page.evaluate(() => {
      const section = document.querySelector('.profileSummary');
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { found: true, hasEdit: !!section.querySelector('.edit, [class*="edit"]') };
      }
      return { found: false };
    });

    if (summarySection.found && summarySection.hasEdit) {
      await delay(500, 1000);
      await page.evaluate(() => {
        const section = document.querySelector('.profileSummary');
        section.querySelector('.edit, [class*="edit"]')?.click();
      });
      await delay(2500, 4000);

      const drawerReady = await page.evaluate(() => {
        const lightboxes = document.querySelectorAll('.lightbox');
        for (const lb of lightboxes) {
          if (lb.classList.contains('flipClose')) continue;
          if (lb.querySelector('textarea')) return true;
        }
        return false;
      });

      if (drawerReady) {
        await page.evaluate((text) => {
          const lightboxes = document.querySelectorAll('.lightbox');
          for (const lb of lightboxes) {
            if (lb.classList.contains('flipClose')) continue;
            const ta = lb.querySelector('textarea');
            if (ta) {
              const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
              setter.call(ta, text);
              ta.dispatchEvent(new Event('input', { bubbles: true }));
              ta.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }, SUMMARY);

        await delay(500, 1000);
        await snap(page, '03-summary-filled');

        const saved = await page.evaluate(() => {
          const lightboxes = document.querySelectorAll('.lightbox');
          for (const lb of lightboxes) {
            if (lb.classList.contains('flipClose')) continue;
            const btn = lb.querySelector('button.btn-dark-ot');
            if (btn && !btn.disabled) { btn.click(); return true; }
          }
          return false;
        });

        if (saved) {
          await delay(2500, 4000);
          // Handle any confirmation dialog
          await page.evaluate(() => {
            const boxes = document.querySelectorAll('[class*="confirmation"], [class*="Confirmation"]');
            for (const box of boxes) {
              if (box.offsetHeight > 0 || !box.classList.contains('flipClose')) {
                const btns = box.querySelectorAll('button');
                for (const b of btns) {
                  const t = b.textContent?.trim().toLowerCase();
                  if (t && !t.includes('cancel') && !t.includes('no') && !t.includes('close')) { b.click(); break; }
                }
              }
            }
          });
          await delay(2000, 3000);
          results.summaryUpdated = true;
          log('ok', 'Summary upgraded');
        }
      } else {
        log('error', 'Summary drawer did not open');
        results.errors.push('summary_drawer_failed');
      }
    } else {
      log('error', 'Profile summary section not found');
      results.errors.push('summary_section_not_found');
    }

    // ── STEP 4: ADD PROJECTS ───────────────────────────────────────
    log('step', 'STEP 4: Adding projects...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(4000, 6000);
    await scrollFullPage(page);

    for (let i = 0; i < PROJECTS.length; i++) {
      const proj = PROJECTS[i];
      log('info', `  Adding project ${i + 1}/${PROJECTS.length}: ${proj.name}`);

      try {
        // Click "Add project" link in sidebar or main content
        const addClicked = await page.evaluate(() => {
          // Try sidebar "Add" next to Projects
          const sidebarItems = document.querySelectorAll('.quickLinks li, .leftNav li, [class*="quickLink"] li');
          for (const li of sidebarItems) {
            if (li.textContent?.includes('Projects')) {
              const addLink = li.querySelector('a, span');
              if (addLink?.textContent?.includes('Add')) { addLink.click(); return 'sidebar'; }
            }
          }
          // Try "Add project" button in main content
          const addBtns = document.querySelectorAll('a, button, span');
          for (const btn of addBtns) {
            const t = btn.textContent?.trim().toLowerCase();
            if (t === 'add project' || t === 'add' && btn.closest('[class*="project"], [class*="Project"]')) {
              btn.click();
              return 'main';
            }
          }
          return null;
        });

        if (!addClicked) {
          log('warn', `  Could not find Add Project button for project ${i + 1}`);
          // Try direct URL approach
          await page.goto('https://www.naukri.com/mnjuser/profile?id=&altresid=', { waitUntil: 'domcontentloaded', timeout: 15000 });
          await delay(2000, 3000);
          await scrollFullPage(page);

          // Click the sidebar Projects → Add
          const retryClick = await page.evaluate(() => {
            // Try sidebar
            const items = document.querySelectorAll('li.collection-item, li');
            for (const li of items) {
              if (li.textContent?.includes('Project')) {
                const link = li.querySelector('a.addMore, a[href*="project"], .addMore');
                if (link) { link.click(); return true; }
              }
            }
            // Try any "Add" near projects heading
            const sections = document.querySelectorAll('.widgetHead, [class*="sectionHead"]');
            for (const s of sections) {
              if (s.textContent?.includes('Project')) {
                const addBtn = s.querySelector('a, button, .edit, .add');
                if (addBtn) { addBtn.click(); return true; }
              }
            }
            return false;
          });

          if (!retryClick) {
            log('warn', `  Still can't find Add Project — skipping remaining projects`);
            results.errors.push('add_project_button_not_found');
            break;
          }
        }

        await delay(2500, 4000);

        // Wait for project form to appear (lightbox or inline form)
        const formReady = await page.evaluate(() => {
          // Check for lightbox project form
          const lightboxes = document.querySelectorAll('.lightbox');
          for (const lb of lightboxes) {
            if (lb.classList.contains('flipClose')) continue;
            const inputs = lb.querySelectorAll('input, textarea');
            if (inputs.length > 0) return { type: 'lightbox', inputCount: inputs.length };
          }
          // Check for inline form
          const forms = document.querySelectorAll('form[class*="project"], [class*="projectForm"], [class*="addProject"]');
          if (forms.length > 0) return { type: 'form', inputCount: forms[0].querySelectorAll('input, textarea').length };
          return null;
        });

        if (!formReady) {
          log('warn', `  Project form did not appear for "${proj.name}"`);
          results.errors.push(`project_form_missing_${i}`);
          // Navigate back for next attempt
          await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 15000 });
          await delay(3000, 5000);
          await scrollFullPage(page);
          continue;
        }

        log('info', `  Form ready: ${formReady.type}, ${formReady.inputCount} inputs`);
        await snap(page, `04-project-${i + 1}-form`);

        // Fill project form — adapt to Naukri's project form structure
        const fillResult = await page.evaluate((project) => {
          const results = { filled: [] };

          // Find the active lightbox/form
          let container = null;
          const lightboxes = document.querySelectorAll('.lightbox');
          for (const lb of lightboxes) {
            if (!lb.classList.contains('flipClose') && lb.querySelectorAll('input, textarea').length > 0) {
              container = lb;
              break;
            }
          }
          if (!container) {
            container = document.querySelector('form[class*="project"], [class*="projectForm"], [class*="addProject"]');
          }
          if (!container) return { error: 'no_container' };

          // Project Name / Title
          const nameInput = container.querySelector('input[name*="name" i], input[name*="title" i], input[name*="projectTitle" i], input[id*="projectTitle" i], input[placeholder*="project" i], input[placeholder*="title" i]');
          if (nameInput) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(nameInput, project.name);
            nameInput.dispatchEvent(new Event('input', { bubbles: true }));
            nameInput.dispatchEvent(new Event('change', { bubbles: true }));
            results.filled.push('name');
          }

          // Description
          const descArea = container.querySelector('textarea[name*="desc" i], textarea[name*="detail" i], textarea[id*="projectDetails" i], textarea');
          if (descArea) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            setter.call(descArea, project.description);
            descArea.dispatchEvent(new Event('input', { bubbles: true }));
            descArea.dispatchEvent(new Event('change', { bubbles: true }));
            results.filled.push('description');
          }

          // Project URL (if field exists)
          if (project.url) {
            const urlInput = container.querySelector('input[name*="url" i], input[name*="link" i], input[placeholder*="url" i], input[placeholder*="link" i]');
            if (urlInput) {
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
              setter.call(urlInput, project.url);
              urlInput.dispatchEvent(new Event('input', { bubbles: true }));
              results.filled.push('url');
            }
          }

          // Get all input info for debugging
          const allInputs = container.querySelectorAll('input, textarea, select');
          results.allFields = [...allInputs].map(el => ({
            tag: el.tagName, type: el.type, name: el.name, id: el.id,
            placeholder: el.placeholder?.substring(0, 40),
            class: el.className?.substring(0, 40),
          }));

          return results;
        }, proj);

        log('info', `  Fill result: ${JSON.stringify(fillResult.filled || fillResult.error)}`);

        if (fillResult.allFields) {
          log('info', `  Form fields: ${fillResult.allFields.map(f => f.name || f.id || f.placeholder || f.tag).join(', ')}`);
        }

        await delay(500, 1000);
        await snap(page, `04-project-${i + 1}-filled`);

        // Click Save button
        const saved = await page.evaluate(() => {
          const lightboxes = document.querySelectorAll('.lightbox');
          for (const lb of lightboxes) {
            if (lb.classList.contains('flipClose')) continue;
            const btn = lb.querySelector('button.btn-dark-ot, button[type="submit"], button.primaryBtn');
            if (btn && !btn.disabled) { btn.click(); return { clicked: true, text: btn.textContent?.trim() }; }
          }
          // Try any visible save button
          const saveBtns = document.querySelectorAll('button');
          for (const btn of saveBtns) {
            const t = btn.textContent?.trim().toLowerCase();
            if ((t === 'save' || t === 'add project') && btn.offsetParent !== null) {
              btn.click();
              return { clicked: true, text: btn.textContent?.trim() };
            }
          }
          return { clicked: false };
        });

        if (saved.clicked) {
          log('ok', `  Project "${proj.name}" saved`);
          results.projectsAdded++;
        } else {
          log('warn', `  Save button not found for "${proj.name}"`);
          results.errors.push(`project_save_failed_${i}`);
        }

        await delay(3000, 5000);

        // Handle any confirmation dialogs
        await page.evaluate(() => {
          const btns = document.querySelectorAll('button');
          for (const b of btns) {
            const t = b.textContent?.trim().toLowerCase();
            if ((t === 'ok' || t === 'done' || t === 'continue') && b.offsetParent !== null) { b.click(); break; }
          }
        });
        await delay(1500, 2500);

        // Navigate back to profile for next project
        if (i < PROJECTS.length - 1) {
          await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 15000 });
          await delay(3000, 5000);
          await scrollFullPage(page);
        }

      } catch (projErr) {
        log('error', `  Project "${proj.name}" error: ${projErr.message}`);
        results.errors.push(`project_error_${i}: ${projErr.message}`);
        await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await delay(3000, 5000);
      }
    }

    // ── STEP 5: OPTIMIZE SKILLS ────────────────────────────────────
    log('step', 'STEP 5: Optimizing skills...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(4000, 6000);

    // Open skills editor
    await page.evaluate(() => {
      const w = [...document.querySelectorAll('.widgetHead')].find(w => w.textContent?.includes('Key skills'));
      w?.querySelector('.edit')?.click();
    });

    if (await waitDrawerOpen(page, '.keySkillsEdit')) {
      for (const skill of SKILLS_TO_ADD) {
        try {
          const input = await page.$('#keySkillSugg');
          if (!input) break;

          // Check if skill already exists
          const exists = await page.evaluate((sk) => {
            const chips = document.querySelectorAll('.keySkillsEdit .chip, .keySkillsEdit .tag, .keySkillsEdit .crossIcon');
            const parent = document.querySelector('.keySkillsEdit');
            return parent?.textContent?.toLowerCase().includes(sk.toLowerCase()) || false;
          }, skill);

          if (exists) continue;

          await input.click();
          await input.fill('');
          await delay(200, 400);

          // Type skill
          for (const ch of skill) {
            await input.type(ch, { delay: 30 + Math.random() * 50 });
          }
          await delay(800, 1200);

          // Try clicking suggestion or press Enter
          const suggClicked = await page.evaluate((sk) => {
            const suggestions = document.querySelectorAll('.keySkillSuggCont li, [class*="suggestor"] li, [class*="suggestion"] li');
            for (const s of suggestions) {
              if (s.textContent?.trim().toLowerCase().includes(sk.toLowerCase())) {
                s.click();
                return true;
              }
            }
            return false;
          }, skill);

          if (!suggClicked) {
            await page.keyboard.press('Enter');
          }

          results.skillsAdded++;
          await delay(400, 800);
        } catch (err) {
          // Skill add failed silently — continue
        }
      }

      await delay(500, 1000);
      await snap(page, '05-skills-updated');

      // Save
      const skillBtn = await page.$('.keySkillsEdit button.btn-dark-ot');
      if (skillBtn) { await skillBtn.click(); log('ok', `Skills optimized (${results.skillsAdded} new)`); }
      await delay(3000, 5000);
    } else {
      log('error', 'Skills drawer failed to open');
      results.errors.push('skills_drawer_failed');
    }

    // ── STEP 6: AFTER SCREENSHOTS ──────────────────────────────────
    log('step', 'STEP 6: Capturing AFTER state...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(4000, 6000);

    results.afterScreenshots.push(await snap(page, '06-AFTER-top'));
    await scrollFullPage(page);
    results.afterScreenshots.push(await snapFull(page, '06-AFTER-full'));

    // Scroll to projects section for screenshot
    await page.evaluate(() => {
      const section = document.querySelector('[class*="project"], .projects');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await delay(1000, 1500);
    results.afterScreenshots.push(await snap(page, '06-AFTER-projects'));

    // Scroll to summary for screenshot
    await page.evaluate(() => {
      const section = document.querySelector('.profileSummary');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await delay(1000, 1500);
    results.afterScreenshots.push(await snap(page, '06-AFTER-summary'));

    // ── Final audit ────────────────────────────────────────────────
    const finalAudit = await page.evaluate(() => {
      const headline = document.querySelector('.resumeHeadline .txt, .resumeHeadline .heading')?.textContent?.trim() || '';
      const skillEls = document.querySelectorAll('.keySkills .chip, .keySkills .tag, .key-skill .chip');
      const skills = [...skillEls].map(s => s.textContent?.trim()).filter(Boolean);
      const completeness = document.querySelector('.profileCompleteness .percentage, [class*="completeness"] [class*="percent"]')?.textContent?.trim() || '';
      return { headline, skillCount: skills.length, completeness };
    });

    results.finalHeadline = finalAudit.headline;
    results.finalSkillCount = finalAudit.skillCount;
    results.finalCompleteness = finalAudit.completeness;
    results.completedAt = new Date().toISOString();

    // ── STEP 7: PERSIST TO POSTGRESQL ──────────────────────────────
    log('step', 'STEP 7: Persisting optimization data...');
    await persistOptimization(results);

    // ── RESULTS ────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  UPGRADE RESULTS');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Headline updated: ${results.headlineUpdated ? '✅' : '❌'}`);
    console.log(`  Summary updated:  ${results.summaryUpdated ? '✅' : '❌'}`);
    console.log(`  Projects added:   ${results.projectsAdded}/${PROJECTS.length}`);
    console.log(`  Skills added:     ${results.skillsAdded}`);
    console.log(`  Errors:           ${results.errors.length}`);
    if (results.errors.length > 0) console.log(`    ${results.errors.join('\n    ')}`);
    console.log(`  Final headline:   "${results.finalHeadline?.substring(0, 80)}..."`);
    console.log(`  Final skills:     ${results.finalSkillCount}`);
    console.log(`  Completeness:     ${results.finalCompleteness}`);
    console.log('═══════════════════════════════════════════════════════\n');

    // Save results
    fs.writeFileSync(
      path.join(RESULTS_DIR, 'naukri-upgrade-v4-results.json'),
      JSON.stringify(results, null, 2)
    );

  } catch (err) {
    log('error', `Fatal: ${err.message}`);
    console.error(err);
    await snap(page, 'ERROR').catch(() => {});
  } finally {
    await sleep(3000);
    await pool.end().catch(() => {});
    await context.close();
  }
}

main().catch(console.error);
