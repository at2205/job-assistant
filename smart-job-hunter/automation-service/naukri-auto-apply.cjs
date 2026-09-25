/**
 * Naukri Auto-Apply Script
 * Applies to filtered HIGH priority jobs matching experience range.
 * Uses persistent session, clicks Apply button on each job page.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const RESULTS_FILE = path.resolve(__dirname, 'results/naukri-job-discovery-1780306731505.json');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots/apply');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = (min, max) => sleep(min + Math.random() * (max - min));

function log(section, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${section}] ${msg}`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('  NAUKRI AUTO-APPLY');
  console.log('='.repeat(60));

  // Load and filter jobs
  const data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
  const eligible = data.allJobs.filter(j => {
    if (!j.url) return false;
    const exp = j.experience.match(/(\d+)\s*-\s*(\d+)/);
    if (!exp) return false;
    const min = parseInt(exp[1]), max = parseInt(exp[2]);
    if (min > 2) return false;
    if (max > 4) return false;
    return j.priority === 'HIGH' || j.priority === 'GOOD';
  });

  log('INIT', `Eligible jobs to apply: ${eligible.length}`);

  // Launch browser with persistent session
  const userDataDir = path.resolve(__dirname, 'sessions/naukri-profile-session');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 30,
    viewport: { width: 1920, height: 1080 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars', '--no-sandbox'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });

  const page = context.pages()[0] || await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // Check login
  log('AUTH', 'Verifying session...');
  await page.goto('https://www.naukri.com/mnjuser/homepage', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await randomDelay(3000, 5000);

  let isLoggedIn = false;
  const urlNow = page.url();
  if (!urlNow.includes('/nlogin/login') && !urlNow.includes('/login')) {
    const indicator = await page.$('.nI-gNb-header__userImg, .user-img, [class*="user-name"], a.nI-gNb-drawer__hamburger, div.nI-gNb-header__right');
    isLoggedIn = !!indicator;
  }

  if (!isLoggedIn) {
    log('AUTH', 'Logging in...');
    await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await randomDelay(2000, 3000);
    await page.fill('#usernameField', process.env.NAUKRI_EMAIL);
    await randomDelay(500, 1000);
    await page.fill('#passwordField', process.env.NAUKRI_PASSWORD);
    await randomDelay(800, 1500);
    await page.click('button[type="submit"]');
    try {
      await page.waitForSelector('.nI-gNb-header__userImg, .user-img, [class*="user-name"], a.nI-gNb-drawer__hamburger', { timeout: 15000 });
      isLoggedIn = true;
      log('AUTH', 'Login successful');
    } catch {
      log('AUTH', 'Login failed or OTP required. Waiting 60s for manual intervention...');
      await sleep(60000);
      isLoggedIn = true; // assume user handled it
    }
  } else {
    log('AUTH', 'Already logged in');
  }

  // Apply to jobs
  let applied = 0;
  let skipped = 0;
  let failed = 0;
  const results = [];

  for (let i = 0; i < eligible.length; i++) {
    const job = eligible[i];
    log('APPLY', `[${i + 1}/${eligible.length}] ${job.title} @ ${job.company}`);

    try {
      await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await randomDelay(2000, 4000);

      // Check if already applied
      const alreadyApplied = await page.$('.already-applied, [class*="already-applied"], .appliedCont');
      if (alreadyApplied) {
        log('APPLY', `  SKIP — already applied`);
        skipped++;
        results.push({ ...job, status: 'already_applied' });
        continue;
      }

      // Find apply button
      const applyBtn = await page.$('#apply-button, .apply-button-container button, button[id*="apply"], .styles_apply-button__uJI3G');
      if (!applyBtn) {
        // Maybe "Apply on company site" — skip those
        const externalApply = await page.$('a[href*="apply"], [class*="company-site"]');
        if (externalApply) {
          log('APPLY', `  SKIP — external apply (company site)`);
          skipped++;
          results.push({ ...job, status: 'external_apply' });
        } else {
          log('APPLY', `  SKIP — no apply button found`);
          skipped++;
          results.push({ ...job, status: 'no_button' });
        }
        continue;
      }

      // Click apply
      await applyBtn.click();
      await randomDelay(2000, 4000);

      // Check for chatbot/questionnaire modal
      const chatbot = await page.$('[class*="chatbot"], .apply-modal, [class*="apply-dialog"], [class*="questionnaire"]');
      if (chatbot) {
        log('APPLY', `  Chatbot/questionnaire detected — attempting to complete`);
        // Try to find and click submit/next buttons in the modal
        for (let attempt = 0; attempt < 5; attempt++) {
          const submitBtn = await page.$('[class*="chatbot"] button[type="submit"], [class*="chatbot"] button.submit, .apply-modal button.submit, button:has-text("Submit"), button:has-text("Apply")');
          if (submitBtn) {
            await submitBtn.click();
            await randomDelay(1500, 3000);
          } else {
            break;
          }
        }
      }

      // Verify application went through
      await randomDelay(2000, 3000);
      const successIndicator = await page.$('.already-applied, [class*="already-applied"], [class*="success"], .appliedCont, [class*="applied"]');
      if (successIndicator) {
        log('APPLY', `  ✅ APPLIED successfully`);
        applied++;
        results.push({ ...job, status: 'applied' });
      } else {
        // Check if page changed or modal closed (likely applied)
        log('APPLY', `  ✅ APPLIED (assumed — button clicked)`);
        applied++;
        results.push({ ...job, status: 'applied_unconfirmed' });
      }

      // Take screenshot every 5 applications
      if (applied % 5 === 0) {
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `applied-${applied}-${Date.now()}.png`) });
      }

    } catch (err) {
      log('APPLY', `  ❌ FAILED — ${err.message.slice(0, 80)}`);
      failed++;
      results.push({ ...job, status: 'error', error: err.message });
    }

    // Rate limit: random delay between applications
    await randomDelay(3000, 7000);
  }

  // Final screenshot
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `final-${Date.now()}.png`), fullPage: false });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('  AUTO-APPLY SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total eligible:    ${eligible.length}`);
  console.log(`  Applied:           ${applied}`);
  console.log(`  Skipped:           ${skipped}`);
  console.log(`  Failed:            ${failed}`);
  console.log('='.repeat(60));

  // Save results
  const resultFile = path.resolve(__dirname, `results/auto-apply-${Date.now()}.json`);
  fs.writeFileSync(resultFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { total: eligible.length, applied, skipped, failed },
    results,
  }, null, 2));
  log('DONE', `Results saved: ${resultFile}`);

  console.log('\n  Browser stays open 15 seconds for review...');
  await sleep(15000);
  await context.close();
  console.log('Browser closed.');
}

main().catch(console.error);
