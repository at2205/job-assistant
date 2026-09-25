/**
 * Naukri Auto-Apply v2 — handles chatbot screening questions
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
const log = (s, m) => console.log(`[${new Date().toISOString().slice(11,19)}] [${s}] ${m}`);

// Answer mapping for common chatbot questions
function getAnswer(question) {
  const q = question.toLowerCase();

  // Experience questions
  if (q.includes('years of experience') || q.includes('year of experience') || q.includes('how many years')) {
    if (q.includes('java') || q.includes('spring') || q.includes('backend') || q.includes('rest api') || q.includes('hibernate'))
      return '1.5';
    if (q.includes('react') || q.includes('next') || q.includes('frontend') || q.includes('full stack'))
      return '1';
    if (q.includes('python') || q.includes('aws') || q.includes('cloud') || q.includes('devops') || q.includes('kubernetes') || q.includes('docker'))
      return '0.5';
    if (q.includes('node') || q.includes('javascript') || q.includes('typescript'))
      return '1';
    if (q.includes('sql') || q.includes('database') || q.includes('postgresql') || q.includes('mysql') || q.includes('mongodb'))
      return '1.5';
    if (q.includes('microservice'))
      return '1';
    return '1.5'; // default experience
  }

  // Current CTC / salary
  if (q.includes('current ctc') || q.includes('current salary') || q.includes('present ctc'))
    return '4';
  if (q.includes('expected ctc') || q.includes('expected salary') || q.includes('expectation'))
    return '6';

  // Notice period
  if (q.includes('notice period'))
    return '15 days';
  if (q.includes('immediate') && q.includes('join'))
    return 'Yes';

  // Location
  if (q.includes('current location') || q.includes('current city'))
    return 'Noida';
  if (q.includes('relocate') || q.includes('willing to relocate'))
    return 'Yes';
  if (q.includes('preferred location'))
    return 'Noida';
  if (q.includes('work from office') || q.includes('hybrid') || q.includes('onsite'))
    return 'Yes';

  // Education
  if (q.includes('qualification') || q.includes('degree') || q.includes('education'))
    return 'B.Tech';
  if (q.includes('graduation year') || q.includes('passing year'))
    return '2023';

  // Yes/No style
  if (q.includes('are you') || q.includes('do you') || q.includes('have you') || q.includes('can you'))
    return 'Yes';

  // Rating / proficiency
  if (q.includes('rate yourself') || q.includes('proficiency') || q.includes('scale'))
    return '8';

  // Gender
  if (q.includes('gender'))
    return 'Male';

  // Age
  if (q.includes('age') || q.includes('date of birth'))
    return '23';

  // Default
  return '1.5';
}

async function handleChatbot(page) {
  const maxRounds = 10;
  let round = 0;

  while (round < maxRounds) {
    round++;
    await randomDelay(1500, 2500);

    // Get latest bot question
    const question = await page.evaluate(() => {
      const items = document.querySelectorAll('.chatbot_ListItem, [class*="ListItem"]');
      if (!items.length) return null;
      const last = items[items.length - 1];
      return last?.textContent?.trim() || null;
    });

    if (!question) break;

    // Check if application is complete
    const lowerQ = question.toLowerCase();
    if (lowerQ.includes('applied successfully') || lowerQ.includes('application submitted') ||
        lowerQ.includes('thank you') || lowerQ.includes('already applied')) {
      log('BOT', `  Application complete: "${question.slice(0, 60)}"`);
      return true;
    }

    // Check if there are clickable options (buttons/chips)
    const hasOptions = await page.evaluate(() => {
      const container = document.querySelector('._chatBotContainer, [class*="chatBotContainer"]');
      if (!container) return false;
      const options = container.querySelectorAll('.option, [class*="option"], [class*="chip"], .chatbot_chip');
      return options.length > 0;
    });

    if (hasOptions) {
      // Click first relevant option or "Yes"
      const clicked = await page.evaluate(() => {
        const container = document.querySelector('._chatBotContainer, [class*="chatBotContainer"]');
        const options = container.querySelectorAll('.option, [class*="option"], [class*="chip"], .chatbot_chip');
        for (const opt of options) {
          const text = opt.textContent?.trim().toLowerCase();
          if (text === 'yes' || text === 'apply' || text === 'submit' || text === 'confirm') {
            opt.click();
            return text;
          }
        }
        // Click first option if no preferred match
        if (options[0]) { options[0].click(); return options[0].textContent?.trim(); }
        return null;
      });
      if (clicked) {
        log('BOT', `  Clicked option: "${clicked}"`);
        continue;
      }
    }

    // Type answer in contenteditable input
    const answer = getAnswer(question);
    log('BOT', `  Q: "${question.slice(0, 60)}..." → A: "${answer}"`);

    // Fill the contenteditable div
    const filled = await page.evaluate((ans) => {
      const input = document.querySelector('[id*="userInput"][contenteditable="true"]');
      if (!input) return false;
      input.focus();
      input.textContent = ans;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, answer);

    if (!filled) {
      log('BOT', `  Could not find input field — breaking`);
      break;
    }

    await randomDelay(500, 1000);

    // Click send/save button
    const sent = await page.evaluate(() => {
      const btn = document.querySelector('.sendMsgbtn_container, [class*="sendMsg"], [class*="SendMsg"]');
      if (btn) { btn.click(); return true; }
      return false;
    });

    if (!sent) {
      // Try pressing Enter
      await page.keyboard.press('Enter');
    }

    await randomDelay(2000, 3000);
  }

  // Check final state
  const finalState = await page.evaluate(() => {
    const items = document.querySelectorAll('.chatbot_ListItem, [class*="ListItem"]');
    const last = items[items.length - 1];
    return last?.textContent?.trim()?.slice(0, 100) || '';
  });

  return finalState.toLowerCase().includes('applied') || finalState.toLowerCase().includes('thank');
}

async function main() {
  console.log('='.repeat(60));
  console.log('  NAUKRI AUTO-APPLY v2 (with chatbot handling)');
  console.log('='.repeat(60));

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

  log('INIT', `Eligible jobs: ${eligible.length}`);

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
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  // Login check
  log('AUTH', 'Verifying session...');
  await page.goto('https://www.naukri.com/mnjuser/homepage', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await randomDelay(3000, 5000);

  let isLoggedIn = false;
  if (!page.url().includes('/nlogin/login')) {
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
      await page.waitForSelector('.nI-gNb-header__userImg, .user-img, div.nI-gNb-header__right', { timeout: 15000 });
      isLoggedIn = true;
    } catch {
      log('AUTH', 'Waiting 60s for manual login/OTP...');
      await sleep(60000);
      isLoggedIn = true;
    }
  }
  log('AUTH', isLoggedIn ? 'Session active' : 'Proceeding anyway');

  let applied = 0, skipped = 0, failed = 0;
  const results = [];

  for (let i = 0; i < eligible.length; i++) {
    const job = eligible[i];
    log('APPLY', `[${i+1}/${eligible.length}] ${job.title} @ ${job.company} | ${job.location}`);

    try {
      await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await randomDelay(2500, 4000);

      // Already applied?
      const alreadyApplied = await page.$('.already-applied, [class*="already-applied"], .appliedCont');
      if (alreadyApplied) {
        log('APPLY', `  SKIP — already applied`);
        skipped++;
        results.push({ ...job, status: 'already_applied' });
        continue;
      }

      // Find apply button
      const applyBtn = await page.$('#apply-button, .apply-button-container button, button[id*="apply"]');
      if (!applyBtn) {
        const externalApply = await page.$('a[href*="apply"], [class*="company-site"], a[target="_blank"]');
        if (externalApply) {
          log('APPLY', `  SKIP — external apply`);
          skipped++;
          results.push({ ...job, status: 'external_apply' });
        } else {
          log('APPLY', `  SKIP — no apply button`);
          skipped++;
          results.push({ ...job, status: 'no_button' });
        }
        continue;
      }

      // Click Apply
      await applyBtn.click();
      await randomDelay(3000, 5000);

      // Check if chatbot appeared
      const chatbotAppeared = await page.$('._chatBotContainer, [class*="chatBotContainer"], [class*="chatbot_Drawer"]');
      if (chatbotAppeared) {
        log('APPLY', `  Chatbot opened — answering questions...`);
        const success = await handleChatbot(page);
        if (success) {
          log('APPLY', `  ✅ APPLIED via chatbot`);
          applied++;
          results.push({ ...job, status: 'applied' });
        } else {
          log('APPLY', `  ⚠️  Chatbot didn't confirm — assumed applied`);
          applied++;
          results.push({ ...job, status: 'applied_unconfirmed' });
        }
      } else {
        // Direct apply (no chatbot) — check for success
        await randomDelay(2000, 3000);
        const successEl = await page.$('.already-applied, [class*="already-applied"], [class*="success"], .appliedCont');
        if (successEl) {
          log('APPLY', `  ✅ APPLIED (direct)`);
          applied++;
          results.push({ ...job, status: 'applied' });
        } else {
          log('APPLY', `  ✅ APPLIED (assumed)`);
          applied++;
          results.push({ ...job, status: 'applied_unconfirmed' });
        }
      }

      if (applied % 5 === 0) {
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `batch-${applied}-${Date.now()}.png`) });
      }

    } catch (err) {
      log('APPLY', `  ❌ FAILED — ${err.message.slice(0, 80)}`);
      failed++;
      results.push({ ...job, status: 'error', error: err.message });
    }

    await randomDelay(4000, 8000);
  }

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `final-${Date.now()}.png`) });

  console.log('\n' + '='.repeat(60));
  console.log('  AUTO-APPLY SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total eligible:    ${eligible.length}`);
  console.log(`  ✅ Applied:        ${applied}`);
  console.log(`  ⏭️  Skipped:       ${skipped}`);
  console.log(`  ❌ Failed:         ${failed}`);
  console.log('='.repeat(60));

  const resultFile = path.resolve(__dirname, `results/auto-apply-v2-${Date.now()}.json`);
  fs.writeFileSync(resultFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { total: eligible.length, applied, skipped, failed },
    results,
  }, null, 2));
  log('DONE', `Results: ${resultFile}`);

  await sleep(10000);
  await context.close();
  console.log('Browser closed.');
}

main().catch(console.error);
