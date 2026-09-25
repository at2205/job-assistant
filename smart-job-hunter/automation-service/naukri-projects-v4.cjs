/**
 * Naukri Project Adder v4 — final fix for custom dropdowns
 *
 * Key findings from DOM inspection:
 * - Year dropdown: DIV.ddwn#projStartYear → INPUT#projStartYearFor → UL with years
 * - Month dropdown: DIV.ddwn#projStartMonth → INPUT#projStartMonthFor → UL with months
 * - Employment: DIV.ddwn#eduExpId → suggestor input
 * - All are custom "ddwn singleSelect" components
 * - Clicking the INPUT opens a UL list below it, items are <li>
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const SESSION_DIR = path.resolve(__dirname, 'sessions', 'naukri-session');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots', 'naukri-projects-v4');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const delay = (min, max) => sleep(min + Math.random() * (max - min));

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

const PROJECTS = [
  {
    title: 'CAPS — Channel Administration & Payment System',
    client: 'BankIT',
    year: '2024', month: 'Oct',
    finished: false,
    description: 'Enterprise fintech admin portal managing multi-tier distribution network for AEPS, DMT, Micro ATM, bill payments, and IRCTC bookings. Migrated legacy Struts 2 to Spring Boot + Next.js. Built 200+ REST APIs with JWT RBAC, KYC management with AWS S3, trade balance and fund management, HubSpot CRM integration, RazorPay payment gateway. Tech: Java, Spring Boot, Next.js, MS SQL Server, AWS S3, JWT, HubSpot, RazorPay.',
  },
  {
    title: 'JobFlow AI — Career Intelligence Platform',
    client: 'Personal Project',
    year: '2025', month: 'Mar',
    finished: false,
    description: 'AI-powered career automation platform with Playwright browser orchestration, ATS scoring engine (150+ jobs analyzed), recruiter probability scoring, PostgreSQL persistence, Spring Boot API backend (51 endpoints), and Next.js analytics dashboard. Retry-safe workflows with full observability. Tech: Java, Spring Boot, PostgreSQL, Playwright, Next.js, TypeScript, Groq AI.',
  },
  {
    title: 'ConnectVerse — Real-Time Social Platform',
    client: 'Personal Project',
    year: '2024', month: 'Jul',
    finished: true, endYear: '2024', endMonth: 'Sep',
    description: 'Full-stack social platform with WebRTC peer-to-peer video calling, GitHub OAuth integration, threaded discussions, community systems, and Dockerized deployment. Real-time communication architecture with persistent messaging. Tech: Next.js, Spring Boot, PostgreSQL, WebRTC, Docker, OAuth.',
  },
  {
    title: 'AEPS Agent Onboarding System',
    client: 'BankIT',
    year: '2024', month: 'Aug',
    finished: true, endYear: '2024', endMonth: 'Oct',
    description: 'Fintech biometric onboarding pipeline with Aadhaar verification, AES-256 encryption for sensitive data, multi-channel KYC (Mobile and DS Agent), document storage on AWS S3, and agent activation workflows with audit trails. Tech: Java, Spring MVC, SQL Server, AJAX, AES-256 Encryption, REST APIs.',
  },
  {
    title: 'mSwasth — Multilingual Healthcare Portal',
    client: 'FindiBankit',
    year: '2024', month: 'May',
    finished: true, endYear: '2024', endMonth: 'Jul',
    description: 'Healthcare marketplace with multilingual support, payment gateway integration, dynamic PDF generation with iTextPDF, lead funnel persistence, and security hardening. Managed 500+ healthcare provider records. Tech: Next.js, React, TypeScript, Tailwind CSS, REST APIs.',
  },
  {
    title: 'FindiInsure — Insurance Marketplace',
    client: 'FindiBankit',
    year: '2024', month: 'Jun',
    finished: true, endYear: '2024', endMonth: 'Aug',
    description: 'Insurance comparison and purchase platform with OTP verification, checkout architecture, payment gateway workflows, responsive mobile-first UI, and secure transaction handling. Tech: Next.js, React, TypeScript, REST APIs.',
  },
];

/**
 * Select a value from Naukri's custom "ddwn singleSelect" dropdown.
 * Uses Playwright native clicks to ensure React state updates.
 * Structure: li.pickVal > a[data-id="..."] > " value " <i class="icon">
 */
async function selectNaukriDropdown(page, inputId, value) {
  // Step 1: Click the input to open the dropdown list
  await page.click(`#${inputId}`);
  await sleep(1500);

  // Step 2: Get parent ddwn ID
  const ddwnId = await page.evaluate((inputId) => {
    const input = document.getElementById(inputId);
    return input?.closest('.ddwn')?.id || null;
  }, inputId);

  if (!ddwnId) return { error: 'ddwn_not_found' };

  // Step 3: Click using getByText with exact match (handles " value " spacing)
  try {
    await page.locator(`#${ddwnId} li`).getByText(value, { exact: true }).click({ timeout: 3000 });
    await sleep(500);
    return { selected: true, text: value };
  } catch {
    const available = await page.evaluate((ddwnId) => {
      const ddwn = document.getElementById(ddwnId);
      return [...(ddwn?.querySelectorAll('li') || [])].slice(0, 10).map(i => i.textContent?.trim());
    }, ddwnId);
    return { selected: false, available };
  }
}

async function addProject(page, proj, index) {
  console.log(`\n── Project ${index + 1}/${PROJECTS.length}: ${proj.title} ──`);

  // Open "Add project" form
  // First scroll to Projects section
  await page.evaluate(() => {
    const els = document.querySelectorAll('.widgetHead, [class*="sectionHead"]');
    for (const el of els) {
      if (el.textContent?.includes('Project')) { el.scrollIntoView({ block: 'start' }); break; }
    }
  });
  await delay(1000, 1500);

  // Try multiple approaches to click "Add project"
  let clicked = false;
  // Approach 1: Playwright text-based click on "Add project" link
  try {
    await page.getByText('Add project', { exact: true }).click({ timeout: 3000 });
    clicked = true;
  } catch {}

  // Approach 2: sidebar li with Projects + Add
  if (!clicked) {
    clicked = await page.evaluate(() => {
      const lis = document.querySelectorAll('li');
      for (const li of lis) {
        if (li.textContent?.includes('Projects') && li.textContent?.includes('Add')) {
          const link = li.querySelector('a');
          if (link) { link.click(); return true; }
        }
      }
      // Fallback: any "Add project" text
      const links = document.querySelectorAll('a, span');
      for (const el of links) {
        if (el.textContent?.trim().toLowerCase() === 'add project') { el.click(); return true; }
      }
      return false;
    });
  }

  if (!clicked) {
    console.log('  ❌ Could not find Add Project button');
    return false;
  }
  await delay(2500, 3500);

  // Verify form opened
  const formOpen = await page.evaluate(() => {
    const lbs = document.querySelectorAll('.lightbox');
    for (const lb of lbs) {
      if (!lb.classList.contains('flipClose') && lb.querySelector('#projectTitle')) return true;
    }
    return false;
  });

  if (!formOpen) {
    console.log('  ❌ Form did not open');
    return false;
  }

  // 1. Fill Title (using Playwright's native fill for reliability)
  try {
    await page.click('.lightbox:not(.flipClose) #projectTitle');
    await page.fill('.lightbox:not(.flipClose) #projectTitle', proj.title);
  } catch {
    await page.evaluate((t) => {
      const inp = document.querySelector('.lightbox:not(.flipClose) #projectTitle');
      if (inp) { inp.value = t; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    }, proj.title);
  }
  await delay(300, 500);
  console.log('  ✅ Title');

  // 2. Select Employment/Education tag
  const eduResult = await selectNaukriDropdown(page, 'eduExpIdFor', 'Java Developer at FindiBankit');
  if (!eduResult.selected) {
    // Try alternate text formats
    const alt1 = await selectNaukriDropdown(page, 'eduExpIdFor', 'Java Developer - FindiBankit');
    if (!alt1.selected) {
      // Select first available non-placeholder option
      await page.click('#eduExpIdFor');
      await sleep(1000);
      try {
        await page.locator('#eduExpId li.pickVal').first().click({ timeout: 3000 });
      } catch {
        console.log('  ⚠️ Employment tag fallback failed');
      }
    }
  }
  await delay(300, 500);
  console.log(`  ✅ Employment tag`);

  // 3. Fill Client (using Playwright locator for the client input)
  try {
    await page.click('.lightbox:not(.flipClose) input[placeholder*="client" i]');
    await page.fill('.lightbox:not(.flipClose) input[placeholder*="client" i]', proj.client);
  } catch {
    // Fallback: find by iterating inputs
    await page.evaluate((client) => {
      const lbs = document.querySelectorAll('.lightbox');
      for (const lb of lbs) {
        if (lb.classList.contains('flipClose')) continue;
        const inputs = lb.querySelectorAll('input');
        for (const inp of inputs) {
          if (inp.placeholder?.toLowerCase().includes('client')) {
            const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            s.call(inp, client);
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            break;
          }
        }
      }
    }, proj.client);
  }
  await delay(300, 500);
  console.log('  ✅ Client');

  // 4. Set Finished status if needed
  if (proj.finished) {
    await page.evaluate(() => {
      const lbs = document.querySelectorAll('.lightbox');
      for (const lb of lbs) {
        if (lb.classList.contains('flipClose')) continue;
        // The radio buttons for project status
        const labels = lb.querySelectorAll('label, span');
        for (const l of labels) {
          if (l.textContent?.trim() === 'Finished') { l.click(); break; }
        }
      }
    });
    await delay(300, 500);
  }

  // 5. Select Year — using the ddwn dropdown pattern
  console.log(`  Selecting year ${proj.year}...`);
  const yearResult = await selectNaukriDropdown(page, 'projStartYearFor', proj.year);
  console.log(`  Year: ${JSON.stringify(yearResult)}`);
  await delay(500, 800);

  // 6. Select Month
  console.log(`  Selecting month ${proj.month}...`);
  const monthResult = await selectNaukriDropdown(page, 'projStartMonthFor', proj.month);
  console.log(`  Month: ${JSON.stringify(monthResult)}`);
  await delay(500, 800);

  // 6b. Close any open dropdown by clicking the form heading
  await page.evaluate(() => {
    const lb = document.querySelector('.lightbox:not(.flipClose)');
    if (lb) {
      const h = lb.querySelector('h2, .heading, .headCont, .subHead');
      if (h) h.click();
    }
  });
  await delay(500, 800);

  // 6c. If finished, select end year/month too
  if (proj.finished) {
    const endYr = await selectNaukriDropdown(page, 'projEndYearFor', proj.endYear || proj.year);
    await delay(300, 500);
    const endMo = await selectNaukriDropdown(page, 'projEndMonthFor', proj.endMonth || proj.month);
    await delay(300, 500);
    console.log(`  End date: ${JSON.stringify(endYr)}, ${JSON.stringify(endMo)}`);
    // Close dropdown again
    await page.evaluate(() => {
      const lb = document.querySelector('.lightbox:not(.flipClose)');
      if (lb) { const h = lb.querySelector('h2, .heading, .headCont'); if (h) h.click(); }
    });
    await delay(500, 800);
  }

  // 7. Fill Description — scroll to textarea, try native fill, fallback to type
  await page.evaluate(() => {
    const lb = document.querySelector('.lightbox:not(.flipClose)');
    const ta = lb?.querySelector('#projectDetails, textarea');
    if (ta) ta.scrollIntoView({ block: 'center' });
  });
  await delay(300, 500);

  try {
    await page.click('.lightbox:not(.flipClose) #projectDetails', { timeout: 3000 });
    await delay(200, 300);
    await page.fill('.lightbox:not(.flipClose) #projectDetails', proj.description, { timeout: 5000 });
  } catch {
    // Dropdown may be overlaying — close it and retry
    await page.evaluate(() => {
      const lb = document.querySelector('.lightbox:not(.flipClose)');
      if (lb) { const h = lb.querySelector('h2, .heading, .headCont'); if (h) h.click(); }
    });
    await delay(500, 800);
    try {
      await page.click('.lightbox:not(.flipClose) #projectDetails', { timeout: 3000 });
      await delay(200, 300);
      await page.fill('.lightbox:not(.flipClose) #projectDetails', proj.description, { timeout: 5000 });
    } catch (e2) {
      console.log(`  ⚠️ Description fill failed: ${e2.message.substring(0, 80)}`);
      // Last resort: evaluate with focus/blur
      await page.evaluate((desc) => {
        const lb = document.querySelector('.lightbox:not(.flipClose)');
        const ta = lb?.querySelector('#projectDetails, textarea');
        if (ta) {
          ta.focus();
          const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          s.call(ta, desc);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
          ta.dispatchEvent(new Event('blur', { bubbles: true }));
        }
      }, proj.description);
    }
  }
  await delay(300, 500);
  console.log('  ✅ Description');

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `p${index + 1}-filled.png`) });

  // 8. Save
  await page.evaluate(() => {
    const lbs = document.querySelectorAll('.lightbox');
    for (const lb of lbs) {
      if (lb.classList.contains('flipClose')) continue;
      const btns = lb.querySelectorAll('button');
      for (const btn of btns) {
        if (btn.textContent?.trim() === 'Save') { btn.click(); return; }
      }
    }
  });
  await delay(3000, 5000);

  // Check success (form closed = saved)
  const formClosed = await page.evaluate(() => {
    const lbs = document.querySelectorAll('.lightbox');
    for (const lb of lbs) {
      if (!lb.classList.contains('flipClose') && lb.querySelector('#projectTitle')) return false;
    }
    return true;
  });

  if (formClosed) {
    console.log(`  ✅ SAVED`);

    // Dismiss any success dialog
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        const t = b.textContent?.trim().toLowerCase();
        if ((t === 'ok' || t === 'done' || t === 'got it') && b.offsetParent !== null) { b.click(); break; }
      }
    });
    await delay(1500, 2500);
    return true;
  }

  console.log('  ❌ Form still open');
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `p${index + 1}-fail.png`) });

  // Cancel and move on
  await page.evaluate(() => {
    const lbs = document.querySelectorAll('.lightbox');
    for (const lb of lbs) {
      if (lb.classList.contains('flipClose')) continue;
      for (const btn of lb.querySelectorAll('button')) {
        if (btn.textContent?.trim() === 'Cancel') { btn.click(); return; }
      }
    }
  });
  await delay(1500, 2500);
  return false;
}

async function main() {
  console.log('\n═══ NAUKRI PROJECT ADDER v4 ═══\n');

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false, slowMo: 40,
    viewport: { width: 1920, height: 1080 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });

  const page = context.pages()[0] || await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  try {
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(4000, 6000);

    if (page.url().includes('/nlogin')) {
      await page.fill('input[placeholder="Enter Email ID / Username"]', process.env.NAUKRI_EMAIL);
      await delay(500, 1000);
      await page.fill('input[placeholder="Enter Password"]', process.env.NAUKRI_PASSWORD);
      await delay(500, 1000);
      await page.click('button[type="submit"]');
      await delay(5000, 8000);
      await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(4000, 6000);
    }

    console.log('Profile loaded.');
    let added = 0;

    for (let i = 0; i < PROJECTS.length; i++) {
      // Navigate fresh for each project
      if (i > 0) {
        await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(3000, 5000);
      }

      // Full-page scroll to force lazy-load all sections
      const ph = await page.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y < ph; y += 400) {
        await page.evaluate(yy => window.scrollTo(0, yy), y);
        await sleep(150);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await delay(1000, 1500);

      const success = await addProject(page, PROJECTS[i], i);
      if (success) added++;
      await delay(2000, 3000);
    }

    // Final screenshot
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(4000, 6000);
    // Scroll to projects
    const ph = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < ph; y += 400) {
      await page.evaluate(yy => window.scrollTo(0, yy), y);
      await sleep(200);
    }
    await page.evaluate(() => {
      const els = document.querySelectorAll('.widgetHead, [class*="sectionHead"]');
      for (const el of els) {
        if (el.textContent?.includes('Project')) { el.scrollIntoView({ block: 'start' }); break; }
      }
    });
    await delay(1000, 2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'final-projects.png') });

    // Persist to DB
    try {
      await pool.query(`
        INSERT INTO ingestion_logs (platform, event_type, message, metadata, created_at)
        VALUES ('naukri', 'project_addition', $1, $2, NOW())
      `, [`Added ${added}/${PROJECTS.length} projects`, JSON.stringify({ added, total: PROJECTS.length, projects: PROJECTS.map(p => p.title) })]);
      console.log('\n✅ Persisted to PostgreSQL');
    } catch (e) {
      console.log(`\n⚠️ DB: ${e.message}`);
    }

    console.log(`\n✅ Added ${added}/${PROJECTS.length} projects`);
    console.log('\n═══ DONE ═══\n');

  } catch (err) {
    console.error('\n❌ Fatal:', err.message);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error.png') }).catch(() => {});
  } finally {
    await sleep(3000);
    await pool.end().catch(() => {});
    await context.close();
  }
}

main().catch(console.error);
