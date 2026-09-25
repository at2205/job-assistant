/**
 * Naukri Profile Updater — Persistent session, deterministic selectors.
 * Pattern: same as linkedin-profile-updater-v2.ts
 *
 * Steps:
 *   1. Launch persistent browser (reuse session)
 *   2. Verify login (wait for manual if needed)
 *   3. Audit current profile
 *   4. Update headline
 *   5. Update profile summary / resume headline
 *   6. Update key skills
 *   7. Capture before/after screenshots
 *   8. Final verification
 */

import { chromium, Page, BrowserContext } from 'playwright';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ────── Directories ──────
const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'screenshots', 'naukri-profile');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const RESULTS_DIR = path.resolve(process.cwd(), 'results');
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

// ────── Profile content to apply ──────
const PROFILE_UPDATES = {
  headline: `Backend Engineer | Java · Spring Boot · Microservices | Full Stack (React/Next.js) | AI-Augmented Automation | SaaS Builder`,

  resumeHeadline: `Backend Engineer — Java, Spring Boot, PostgreSQL, REST APIs, Microservices | Full Stack: React.js, Next.js, TypeScript | AI Workflow Automation | Docker | Supabase | Playwright | Building Scalable SaaS Products`,

  summary: `Backend engineer who builds production systems end-to-end — then automates them with AI.

Currently building JobFlow AI: an AI-powered career automation platform that scrapes jobs from multiple portals, scores them with ATS analysis, generates tailored resumes via Groq AI, and orchestrates browser-based applications through Playwright. Stack: Express + TypeScript, PostgreSQL on Supabase, Groq LLM integration, Playwright automation, Next.js dashboard.

Previously built ConnectVerse (real-time social platform with WebRTC video calling and Socket.IO), mSwasth (healthcare portal managing 500+ patient records with Spring Boot), FindiInsure (insurance marketplace with multi-role RBAC), and an AEPS Agent Onboarding System with AES-256 encryption for fintech biometric workflows.

Core stack:
→ Backend: Java, Spring Boot, REST APIs, Microservices, PostgreSQL, SQL
→ Frontend: React.js, Next.js, TypeScript, Tailwind CSS
→ AI/Automation: Groq AI, LLM integration, Playwright, Puppeteer
→ Infrastructure: Docker, Supabase, JWT Auth, WebSocket, Redis

What I do well:
• Architect backend systems and clean REST APIs from scratch
• Integrate AI/LLMs into real production workflows (not demos)
• Build browser automation that replaces manual operational processes
• Take products from idea → architecture → working system, fast

Open to backend, full-stack, or product engineering roles where I can build things that matter.`,

  skills: [
    'Java', 'Spring Boot', 'REST API', 'Microservices', 'PostgreSQL', 'SQL',
    'React.js', 'Next.js', 'TypeScript', 'JavaScript', 'Node.js',
    'Docker', 'Git', 'Playwright', 'Supabase', 'AI Automation',
    'System Design', 'HTML', 'CSS', 'Tailwind CSS',
    'WebSocket', 'JWT', 'Redis', 'MongoDB', 'Express.js',
  ],

  projects: [
    {
      name: 'JobFlow AI — AI-Powered Career Automation Platform',
      description: `Full-stack career automation system: scrapes jobs from Naukri/LinkedIn, scores them with ATS keyword analysis, generates tailored resumes using Groq AI, and orchestrates browser-based applications via Playwright. Express + TypeScript backend, PostgreSQL on Supabase, Next.js dashboard with real-time analytics.`,
      skills: 'Java, Spring Boot, TypeScript, PostgreSQL, Playwright, Groq AI, Next.js, Supabase',
    },
    {
      name: 'ConnectVerse — Real-Time Social Platform',
      description: `Real-time social networking platform with WebRTC video calling, Socket.IO messaging, live feed updates, and notification system. Scalable architecture with React.js frontend, Node.js + Express backend, PostgreSQL database. WebSocket-driven event system handling 1000+ concurrent connections.`,
      skills: 'React.js, Node.js, PostgreSQL, WebRTC, Socket.IO, WebSocket, Docker',
    },
    {
      name: 'AEPS Agent Onboarding System',
      description: `Fintech agent onboarding system with AES-256 encrypted biometric data handling, multi-step KYC verification, role-based access control, and compliance audit trails. Spring Boot backend with PostgreSQL, serving 200+ active agents.`,
      skills: 'Java, Spring Boot, PostgreSQL, AES-256, REST API, Security',
    },
    {
      name: 'mSwasth — Healthcare Management Portal',
      description: `Healthcare management system serving 500+ patient records. Spring Boot REST API backend with role-based doctor/patient/admin access, appointment scheduling, prescription management, and reporting dashboard.`,
      skills: 'Java, Spring Boot, PostgreSQL, REST API, React.js',
    },
    {
      name: 'FindiInsure — Insurance Marketplace',
      description: `Multi-role insurance marketplace with agent, customer, and admin portals. Policy comparison engine, document management, premium calculator, and claim tracking. React.js + Spring Boot full stack with PostgreSQL.`,
      skills: 'Java, Spring Boot, React.js, PostgreSQL, REST API, Microservices',
    },
  ],
};

// ────── Naukri-specific selectors ──────
const NAUKRI_SELECTORS = {
  login: {
    emailField: 'input[placeholder="Enter your active Email ID / Username"]',
    passwordField: 'input[placeholder="Enter your password"]',
    submitButton: 'button[type="submit"]',
    loginSuccess: '.nI-gNb-header__userImg, .user-img, [class*="user-name"], a.nI-gNb-drawer__hamburger, div.nI-gNb-header__right',
    otpField: 'input[placeholder="Enter OTP"]',
  },
  profile: {
    editProfileBtn: 'a[href*="/mnjuser/profile"], .edit-profile, [class*="edit-profile"]',
    headlineInput: 'input[name="resumeHeadline"], textarea[name="resumeHeadline"], input[placeholder*="headline" i], textarea[placeholder*="headline" i]',
    headlineEditIcon: '.edit-icon, [class*="editIcon"], button[class*="edit"], .resumeHeadline .edit, a[title*="Resume Headline" i]',
    summaryTextarea: 'textarea[name="profileSummary"], textarea[name="summary"], textarea[placeholder*="summary" i]',
    summaryEditIcon: '.profileSummary .edit, [class*="profileSummary"] .edit-icon',
    skillsSection: '.keySkills, [class*="key-skill"], [class*="keySkill"]',
    skillsEditIcon: '.keySkills .edit, [class*="keySkill"] .edit-icon, [class*="key-skill"] .edit',
    skillInput: 'input[placeholder*="skill" i], input[name*="skill" i], .suggestor-input input',
    saveButton: 'button[type="submit"], button:has-text("Save"), input[type="submit"]',
    cancelButton: 'button:has-text("Cancel"), a:has-text("Cancel")',
  },
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
  const p = path.join(SCREENSHOTS_DIR, `naukri-${name}-${Date.now()}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`  [screenshot] ${name}: ${p}`);
  return p;
}

function log(section: string, msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${section}] ${msg}`);
}

// ────── Main ──────
async function main() {
  console.log('='.repeat(60));
  console.log('  NAUKRI PROFILE UPDATER — Persistent Session');
  console.log('='.repeat(60));

  const email = process.env.NAUKRI_EMAIL;
  const password = process.env.NAUKRI_PASSWORD;

  if (!email || !password) {
    console.error('ERROR: Set NAUKRI_EMAIL and NAUKRI_PASSWORD in .env');
    process.exit(1);
  }

  const userDataDir = path.resolve(process.cwd(), 'sessions', 'naukri-profile-session');
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

  // Stealth
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    (window as any).chrome = { runtime: {} };
  });

  const auditResults: Record<string, any> = {};
  const screenshotLog: string[] = [];

  try {
    // ═══════════════════════════════════════════════
    // STEP 1: LOGIN / SESSION CHECK
    // ═══════════════════════════════════════════════
    log('AUTH', 'Checking login state...');
    await page.goto('https://www.naukri.com/mnjuser/homepage', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await randomDelay(3000, 5000);

    const currentUrl = page.url();
    let isLoggedIn = !currentUrl.includes('/nlogin/login') && !currentUrl.includes('/login');

    // Double-check with selector
    if (isLoggedIn) {
      const userIndicator = await page.$(NAUKRI_SELECTORS.login.loginSuccess);
      isLoggedIn = !!userIndicator;
    }

    if (!isLoggedIn) {
      log('AUTH', 'Not logged in. Attempting auto-login...');
      await page.goto('https://www.naukri.com/nlogin/login', {
        waitUntil: 'domcontentloaded', timeout: 20000,
      });
      await randomDelay(2000, 3000);

      // Fill credentials
      const emailField = await page.$(NAUKRI_SELECTORS.login.emailField);
      if (emailField) {
        await emailField.click();
        await randomDelay(300, 500);
        await page.type(NAUKRI_SELECTORS.login.emailField, email, { delay: randomInt(40, 90) });
        await randomDelay(500, 1000);

        await page.click(NAUKRI_SELECTORS.login.passwordField);
        await randomDelay(200, 400);
        await page.type(NAUKRI_SELECTORS.login.passwordField, password, { delay: randomInt(40, 90) });
        await randomDelay(800, 1500);

        await page.click(NAUKRI_SELECTORS.login.submitButton);
        log('AUTH', 'Credentials submitted. Waiting for login result...');
      }

      // Wait for success or OTP
      try {
        await page.waitForSelector(NAUKRI_SELECTORS.login.loginSuccess, { timeout: 15000 });
        isLoggedIn = true;
        log('AUTH', 'Login successful!');
      } catch {
        // Check for OTP
        const otpField = await page.$(NAUKRI_SELECTORS.login.otpField);
        if (otpField) {
          log('AUTH', 'OTP required! Please enter OTP in the browser. Waiting 120s...');
          try {
            await page.waitForSelector(NAUKRI_SELECTORS.login.loginSuccess, { timeout: 120000 });
            isLoggedIn = true;
            log('AUTH', 'OTP verified, login successful!');
          } catch {
            log('AUTH', 'OTP timeout. Please log in manually. Waiting 5 minutes...');
          }
        } else {
          log('AUTH', 'Login failed. Waiting 5 minutes for manual login...');
        }

        if (!isLoggedIn) {
          // Manual login fallback
          const deadline = Date.now() + 300000;
          while (Date.now() < deadline && !isLoggedIn) {
            await sleep(5000);
            const url = page.url();
            if (url.includes('/homepage') || url.includes('/mnjuser/profile') || url.includes('/dashboard')) {
              isLoggedIn = true;
            } else {
              const indicator = await page.$(NAUKRI_SELECTORS.login.loginSuccess);
              if (indicator) isLoggedIn = true;
            }
          }
        }
      }
    }

    if (!isLoggedIn) {
      log('AUTH', 'Login failed after all attempts. Exiting.');
      await screenshot(page, 'login-failed');
      await context.close();
      return;
    }

    log('AUTH', 'Session active.');
    screenshotLog.push(await screenshot(page, 'login-verified'));
    await randomDelay(2000, 3000);

    // ═══════════════════════════════════════════════
    // STEP 2: AUDIT CURRENT PROFILE
    // ═══════════════════════════════════════════════
    log('AUDIT', 'Navigating to profile...');
    await page.goto('https://www.naukri.com/mnjuser/profile', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await randomDelay(3000, 5000);
    screenshotLog.push(await screenshot(page, 'profile-BEFORE'));

    // Extract current profile data
    const currentProfile = await page.evaluate(() => {
      const getText = (sel: string) => {
        const el = document.querySelector(sel);
        return el?.textContent?.trim() || '';
      };
      const getAll = (sel: string) => {
        return Array.from(document.querySelectorAll(sel)).map(el => el.textContent?.trim() || '').filter(Boolean);
      };

      return {
        name: getText('.name, .nI-gNb-header__userName, h1'),
        headline: getText('.resumeHeadline .text, [class*="resumeHeadline"] span, .rhc, .resume-headline .text'),
        summary: getText('.profileSummary .text, [class*="profileSummary"] span, .profile-summary .text'),
        skills: getAll('.keySkills .chip, .key-skill-chip, [class*="keySkill"] span.chip, [class*="key-skill"] span'),
        experience: getAll('.exp-section .profile-exp, [class*="experience"] .profile-exp'),
        education: getAll('.edu-section .profile-edu, [class*="education"] .profile-edu'),
        location: getText('.location .text, [class*="location"]'),
        profileUrl: window.location.href,
      };
    });

    log('AUDIT', `Name: ${currentProfile.name}`);
    log('AUDIT', `Headline: ${currentProfile.headline.substring(0, 80)}...`);
    log('AUDIT', `Skills (${currentProfile.skills.length}): ${currentProfile.skills.slice(0, 10).join(', ')}`);
    log('AUDIT', `Summary length: ${currentProfile.summary.length} chars`);

    auditResults.before = currentProfile;

    // ── Recruiter discoverability analysis ──
    const targetKeywords = [
      'java', 'spring boot', 'backend', 'rest api', 'microservices', 'postgresql',
      'react', 'next.js', 'typescript', 'docker', 'full stack', 'node.js',
    ];
    const profileText = [currentProfile.headline, currentProfile.summary, ...currentProfile.skills]
      .join(' ').toLowerCase();
    const matchedKeywords = targetKeywords.filter(kw => profileText.includes(kw));
    const missingKeywords = targetKeywords.filter(kw => !profileText.includes(kw));

    log('AUDIT', `Recruiter keyword coverage: ${matchedKeywords.length}/${targetKeywords.length}`);
    log('AUDIT', `Matched: ${matchedKeywords.join(', ')}`);
    if (missingKeywords.length > 0) {
      log('AUDIT', `MISSING (need to add): ${missingKeywords.join(', ')}`);
    }

    auditResults.keywordAnalysis = { matchedKeywords, missingKeywords, coverage: `${matchedKeywords.length}/${targetKeywords.length}` };

    // ═══════════════════════════════════════════════
    // STEP 3: UPDATE RESUME HEADLINE
    // ═══════════════════════════════════════════════
    log('HEADLINE', 'Looking for resume headline edit control...');

    // Naukri profile has a "Resume Headline" section with an edit pencil
    const headlineSection = await page.$('.resumeHeadline, [class*="resumeHeadline"], [data-section="resumeHeadline"]');
    if (headlineSection) {
      // Find edit icon within or near the section
      const editIcon = await headlineSection.$('.edit-icon, [class*="editIcon"], button, a[class*="edit"]') ||
                       await page.$('span[class*="edit"]:near(.resumeHeadline)') ||
                       await page.$('.resumeHeadline ~ .edit-icon, [class*="resumeHeadline"] .editIcon');

      if (editIcon) {
        await editIcon.scrollIntoViewIfNeeded();
        await randomDelay(500, 1000);
        await editIcon.click();
        log('HEADLINE', 'Opened headline editor');
        await randomDelay(2000, 3000);

        // Look for the textarea/input
        const headlineField = await page.$('textarea[name*="resumeHeadline" i], textarea.textArea, textarea, input[name*="headline" i]');
        if (headlineField) {
          await headlineField.click();
          await page.keyboard.down('Control');
          await page.keyboard.press('a');
          await page.keyboard.up('Control');
          await sleep(200);
          await headlineField.fill(PROFILE_UPDATES.resumeHeadline);
          log('HEADLINE', `Set: ${PROFILE_UPDATES.resumeHeadline.substring(0, 60)}...`);
          await randomDelay(1000, 2000);

          // Save
          const saveBtn = await page.$('button[type="submit"], button:has-text("Save"), input[type="submit"]');
          if (saveBtn) {
            await saveBtn.click();
            log('HEADLINE', 'Saved headline!');
            await randomDelay(3000, 5000);
          }
        } else {
          log('HEADLINE', 'Could not find headline input field. Listing available fields:');
          const allFields = await page.$$('textarea:visible, input[type="text"]:visible');
          for (let i = 0; i < Math.min(allFields.length, 5); i++) {
            const name = await allFields[i].getAttribute('name') || '';
            const placeholder = await allFields[i].getAttribute('placeholder') || '';
            log('HEADLINE', `  [${i}] name="${name}" placeholder="${placeholder}"`);
          }
        }
      } else {
        log('HEADLINE', 'No edit icon found for resume headline. Trying direct click on section...');
        await headlineSection.click();
        await randomDelay(2000, 3000);
      }
    } else {
      log('HEADLINE', 'Resume headline section not found on page. Trying alternative approach...');
      // Scroll down to find it
      await page.evaluate(() => window.scrollBy(0, 500));
      await randomDelay(1000, 2000);
      screenshotLog.push(await screenshot(page, 'headline-section-search'));
    }

    screenshotLog.push(await screenshot(page, 'after-headline-update'));

    // ═══════════════════════════════════════════════
    // STEP 4: UPDATE PROFILE SUMMARY
    // ═══════════════════════════════════════════════
    log('SUMMARY', 'Looking for profile summary section...');
    await page.goto('https://www.naukri.com/mnjuser/profile', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await randomDelay(3000, 5000);

    const summarySection = await page.$('.profileSummary, [class*="profileSummary"], [data-section="profileSummary"]');
    if (summarySection) {
      const editIcon = await summarySection.$('.edit-icon, [class*="editIcon"], button, a[class*="edit"]');

      if (editIcon) {
        await editIcon.scrollIntoViewIfNeeded();
        await randomDelay(500, 1000);
        await editIcon.click();
        log('SUMMARY', 'Opened summary editor');
        await randomDelay(2000, 3000);

        const summaryField = await page.$('textarea[name*="summary" i], textarea[name*="profileSummary" i], textarea.textArea, textarea');
        if (summaryField) {
          await summaryField.click();
          await page.keyboard.down('Control');
          await page.keyboard.press('a');
          await page.keyboard.up('Control');
          await sleep(200);
          await summaryField.fill(PROFILE_UPDATES.summary);
          log('SUMMARY', 'Summary text filled');
          await randomDelay(1000, 2000);

          const saveBtn = await page.$('button[type="submit"], button:has-text("Save"), input[type="submit"]');
          if (saveBtn) {
            await saveBtn.click();
            log('SUMMARY', 'Saved summary!');
            await randomDelay(3000, 5000);
          }
        }
      }
    } else {
      log('SUMMARY', 'Profile summary section not found. May need to add it manually.');
    }

    screenshotLog.push(await screenshot(page, 'after-summary-update'));

    // ═══════════════════════════════════════════════
    // STEP 5: UPDATE KEY SKILLS
    // ═══════════════════════════════════════════════
    log('SKILLS', 'Looking for key skills section...');
    await page.goto('https://www.naukri.com/mnjuser/profile', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await randomDelay(3000, 5000);

    // Scroll to skills section
    await page.evaluate(() => {
      const el = document.querySelector('.keySkills, [class*="keySkill"], [class*="key-skill"]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await randomDelay(1000, 2000);

    const skillsSection = await page.$('.keySkills, [class*="keySkill"], [class*="key-skill"]');
    if (skillsSection) {
      const editIcon = await skillsSection.$('.edit-icon, [class*="editIcon"], button, a[class*="edit"]');

      if (editIcon) {
        await editIcon.scrollIntoViewIfNeeded();
        await randomDelay(500, 1000);
        await editIcon.click();
        log('SKILLS', 'Opened skills editor');
        await randomDelay(2000, 3000);

        // Naukri skills editor typically has a typeahead input
        const skillInput = await page.$('input[placeholder*="skill" i], input.suggestor-input, input[name*="skill" i], .chipInput input, input[type="text"]');
        if (skillInput) {
          // Add skills one by one
          let addedCount = 0;
          for (const skill of PROFILE_UPDATES.skills) {
            try {
              await skillInput.click();
              await skillInput.fill('');
              await randomDelay(200, 400);
              await page.type('input:focus', skill, { delay: randomInt(30, 70) });
              await randomDelay(500, 1000);

              // Click first suggestion or press Enter
              const suggestion = await page.$('.suggestor-list li:first-child, [class*="suggestion"]:first-child, .dropdown-menu li:first-child');
              if (suggestion) {
                await suggestion.click();
              } else {
                await page.keyboard.press('Enter');
              }
              await randomDelay(300, 600);
              addedCount++;
            } catch (err: any) {
              log('SKILLS', `  Could not add "${skill}": ${err.message}`);
            }
          }
          log('SKILLS', `Added ${addedCount}/${PROFILE_UPDATES.skills.length} skills`);

          await randomDelay(1000, 2000);
          const saveBtn = await page.$('button[type="submit"], button:has-text("Save"), input[type="submit"]');
          if (saveBtn) {
            await saveBtn.click();
            log('SKILLS', 'Saved skills!');
            await randomDelay(3000, 5000);
          }
        } else {
          log('SKILLS', 'Skill input not found. Listing available inputs:');
          const inputs = await page.$$('input:visible');
          for (let i = 0; i < Math.min(inputs.length, 5); i++) {
            const name = await inputs[i].getAttribute('name') || '';
            const placeholder = await inputs[i].getAttribute('placeholder') || '';
            log('SKILLS', `  [${i}] name="${name}" placeholder="${placeholder}"`);
          }
        }
      }
    } else {
      log('SKILLS', 'Key skills section not found.');
    }

    screenshotLog.push(await screenshot(page, 'after-skills-update'));

    // ═══════════════════════════════════════════════
    // STEP 6: FINAL VERIFICATION
    // ═══════════════════════════════════════════════
    log('VERIFY', 'Reloading profile for verification...');
    await page.goto('https://www.naukri.com/mnjuser/profile', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await randomDelay(3000, 5000);
    screenshotLog.push(await screenshot(page, 'profile-AFTER'));

    // Re-extract profile data
    const updatedProfile = await page.evaluate(() => {
      const getText = (sel: string) => {
        const el = document.querySelector(sel);
        return el?.textContent?.trim() || '';
      };
      const getAll = (sel: string) => {
        return Array.from(document.querySelectorAll(sel)).map(el => el.textContent?.trim() || '').filter(Boolean);
      };
      return {
        name: getText('.name, .nI-gNb-header__userName, h1'),
        headline: getText('.resumeHeadline .text, [class*="resumeHeadline"] span, .rhc'),
        summary: getText('.profileSummary .text, [class*="profileSummary"] span'),
        skills: getAll('.keySkills .chip, .key-skill-chip, [class*="keySkill"] span.chip'),
      };
    });

    auditResults.after = updatedProfile;

    // Compare
    log('VERIFY', '--- COMPARISON ---');
    log('VERIFY', `Headline changed: ${updatedProfile.headline !== currentProfile.headline ? 'YES' : 'NO'}`);
    log('VERIFY', `Summary changed: ${updatedProfile.summary !== currentProfile.summary ? 'YES' : 'NO'}`);
    log('VERIFY', `Skills count: ${currentProfile.skills.length} -> ${updatedProfile.skills.length}`);

    // Re-run keyword analysis
    const afterText = [updatedProfile.headline, updatedProfile.summary, ...updatedProfile.skills]
      .join(' ').toLowerCase();
    const afterMatched = targetKeywords.filter(kw => afterText.includes(kw));
    log('VERIFY', `Keyword coverage: ${matchedKeywords.length}/${targetKeywords.length} -> ${afterMatched.length}/${targetKeywords.length}`);

    auditResults.keywordAnalysisAfter = {
      matchedKeywords: afterMatched,
      missingKeywords: targetKeywords.filter(kw => !afterText.includes(kw)),
      coverage: `${afterMatched.length}/${targetKeywords.length}`,
    };

    // ═══════════════════════════════════════════════
    // SAVE RESULTS
    // ═══════════════════════════════════════════════
    const resultFile = path.join(RESULTS_DIR, `naukri-profile-audit-${Date.now()}.json`);
    fs.writeFileSync(resultFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      profileUpdates: PROFILE_UPDATES,
      audit: auditResults,
      screenshots: screenshotLog,
    }, null, 2));
    log('DONE', `Results saved: ${resultFile}`);

    // ═══════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════
    console.log('\n' + '='.repeat(60));
    console.log('  NAUKRI PROFILE UPDATE COMPLETE');
    console.log('='.repeat(60));
    console.log(`  Screenshots: ${screenshotLog.length} captured`);
    console.log(`  Results: ${resultFile}`);
    console.log(`  Keyword coverage: ${matchedKeywords.length} -> ${afterMatched.length} / ${targetKeywords.length}`);
    console.log('');
    console.log('  MANUAL TASKS REMAINING:');
    console.log('  1. Review and adjust headline if needed');
    console.log('  2. Add/update project details');
    console.log('  3. Upload latest resume PDF');
    console.log('  4. Update employment history descriptions');
    console.log('  5. Set preferred job role and location preferences');
    console.log('');
    console.log('  Browser stays open for 60 seconds for review...');

    await sleep(60000);

  } catch (err: any) {
    console.error(`\nERROR: ${err.message}`);
    await screenshot(page, 'error');
  } finally {
    await context.close();
    console.log('Browser closed.');
  }
}

main().catch(console.error);
