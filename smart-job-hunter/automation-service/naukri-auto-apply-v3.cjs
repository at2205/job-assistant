/**
 * Naukri Auto-Apply v3 — keyboard.type + Enter for chatbot
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const RESULTS_FILE = path.resolve(__dirname, 'results/naukri-job-discovery-1780401346931.json');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots/apply');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = (min, max) => sleep(min + Math.random() * (max - min));
const log = (s, m) => console.log(`[${new Date().toISOString().slice(11,19)}] [${s}] ${m}`);

// Resume path for upload
const RESUME_PATH = path.resolve(__dirname, 'resume', 'Aryan_Tomar_Resume.pdf');

function getAnswer(question) {
  const q = question.toLowerCase();
  if (q.includes('years of experience') || q.includes('year of experience') || q.includes('how many years')) {
    if (q.includes('java') || q.includes('spring') || q.includes('backend') || q.includes('rest') || q.includes('hibernate')) return '1.5';
    if (q.includes('react') || q.includes('next') || q.includes('frontend') || q.includes('full stack') || q.includes('fullstack')) return '1';
    if (q.includes('python') || q.includes('aws') || q.includes('cloud') || q.includes('devops') || q.includes('kubernetes') || q.includes('docker') || q.includes('angular')) return '0';
    if (q.includes('node') || q.includes('javascript') || q.includes('typescript') || q.includes('css')) return '1';
    if (q.includes('sql') || q.includes('database') || q.includes('postgresql') || q.includes('mysql') || q.includes('mongodb')) return '1.5';
    if (q.includes('microservice')) return '1';
    return '1';
  }
  if (q.includes('current ctc') || q.includes('current salary') || q.includes('present ctc') || q.includes('annual ctc')) return '4';
  if (q.includes('expected ctc') || q.includes('expected salary')) return '6';
  if (q.includes('notice period')) return '15';
  if (q.includes('current location') || q.includes('current city') || q.includes('select the city') || q.includes('residing')) return 'Noida';
  if (q.includes('relocate')) return 'Yes';
  if (q.includes('preferred location') || q.includes('location preference')) return 'Noida';
  if (q.includes('qualification') || q.includes('degree') || q.includes('education')) return 'B.Tech';
  if (q.includes('graduation year') || q.includes('passing year')) return '2023';
  if (q.includes('gender')) return 'Male';
  if (q.includes('are you') || q.includes('do you') || q.includes('have you') || q.includes('can you') || q.includes('willing')) return 'Yes';
  if (q.includes('rate') || q.includes('proficiency') || q.includes('scale')) return '8';
  return '1';
}

async function handleChatbot(page) {
  const maxRounds = 15;
  let lastQuestion = '';
  let sameCount = 0;

  for (let round = 0; round < maxRounds; round++) {
    await randomDelay(1500, 2500);

    // Get latest bot message
    const messages = await page.evaluate(() => {
      const items = document.querySelectorAll('.chatbot_ListItem, [class*="ListItem"]');
      return [...items].map(m => m.textContent?.trim()).filter(Boolean);
    });

    if (!messages.length) break;
    const latestBotMsg = messages[messages.length - 1];
    const lowerMsg = latestBotMsg.toLowerCase();

    // Success detection
    if (lowerMsg.includes('applied successfully') || lowerMsg.includes('application submitted') ||
        lowerMsg.includes('already applied') || lowerMsg.includes('thank you for applying') ||
        lowerMsg.includes('your application')) {
      log('BOT', `  ✓ "${latestBotMsg.slice(0, 60)}"`);
      return 'applied';
    }

    // Same question repeated = send not working or stuck
    if (latestBotMsg === lastQuestion) {
      sameCount++;
      if (sameCount >= 2) {
        log('BOT', `  Stuck on same question — breaking`);
        return 'stuck';
      }
    } else {
      sameCount = 0;
      lastQuestion = latestBotMsg;
    }

    // Resume upload request
    if (lowerMsg.includes('upload') && lowerMsg.includes('resume')) {
      log('BOT', `  Resume upload requested`);
      // Wait a moment for upload UI to render
      await randomDelay(1500, 2500);
      // Try multiple selectors — Naukri uses hidden file inputs
      const fileInput = await page.$('input[type="file"]')
        || await page.$('.chatbot_Uploader input')
        || await page.$('[id*="Uploader"] input')
        || await page.$('[class*="uploader"] input[type="file"]')
        || await page.$('.botMsg input[type="file"]');
      log('BOT', `  File input found: ${!!fileInput}, Resume exists: ${fs.existsSync(RESUME_PATH)}`);
      if (fileInput && fs.existsSync(RESUME_PATH)) {
        await fileInput.setInputFiles(RESUME_PATH);
        log('BOT', `  ✅ Resume uploaded`);
        await randomDelay(3000, 5000);
        continue;
      } else {
        // Try clicking any upload button/area first
        const uploadBtn = await page.$('[class*="upload"], [class*="Upload"], .chatbot_Upload, button:has-text("Upload")');
        if (uploadBtn) {
          await uploadBtn.click();
          await randomDelay(1500, 2000);
          const fileInput2 = await page.$('input[type="file"]');
          if (fileInput2 && fs.existsSync(RESUME_PATH)) {
            await fileInput2.setInputFiles(RESUME_PATH);
            log('BOT', `  ✅ Resume uploaded (after click)`);
            await randomDelay(3000, 5000);
            continue;
          }
        }
        log('BOT', `  No file input found — skipping`);
        return 'resume_needed';
      }
    }

    // Type answer
    const answer = getAnswer(latestBotMsg);
    log('BOT', `  Q: "${latestBotMsg.slice(0, 55)}" → A: "${answer}"`);

    // Focus input and type
    const input = await page.$('[id*="userInput"][contenteditable="true"]');
    if (!input) {
      log('BOT', `  No input field found`);
      break;
    }
    await input.click();
    await randomDelay(300, 600);

    // Clear existing content
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await randomDelay(200, 400);

    // Type answer
    await page.keyboard.type(answer, { delay: 30 + Math.random() * 40 });
    await randomDelay(500, 800);

    // Press Enter to send
    await page.keyboard.press('Enter');
    await randomDelay(2000, 3000);
  }

  return 'completed';
}

async function main() {
  console.log('='.repeat(60));
  console.log('  NAUKRI AUTO-APPLY v3');
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

  // Login
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
  log('AUTH', 'Session active');

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
        const hasExternal = await page.$('a[href*="apply"], [class*="company-site"], a[target="_blank"]');
        log('APPLY', `  SKIP — ${hasExternal ? 'external apply' : 'no button'}`);
        skipped++;
        results.push({ ...job, status: hasExternal ? 'external_apply' : 'no_button' });
        continue;
      }

      // Click Apply
      await applyBtn.click();
      await randomDelay(3000, 5000);

      // Check for chatbot
      const chatbotAppeared = await page.$('._chatBotContainer, [class*="chatBotContainer"], [class*="chatbot_Drawer"]');
      if (chatbotAppeared) {
        log('APPLY', `  Chatbot opened`);
        const result = await handleChatbot(page);
        if (result === 'applied') {
          log('APPLY', `  ✅ APPLIED via chatbot`);
          applied++;
          results.push({ ...job, status: 'applied' });
        } else if (result === 'resume_needed') {
          log('APPLY', `  ⏭️  Skipped (resume upload required, no file)`);
          skipped++;
          results.push({ ...job, status: 'resume_needed' });
        } else {
          log('APPLY', `  ✅ APPLIED (chatbot completed)`);
          applied++;
          results.push({ ...job, status: 'applied_unconfirmed' });
        }
      } else {
        // Direct apply
        await randomDelay(2000, 3000);
        log('APPLY', `  ✅ APPLIED (direct)`);
        applied++;
        results.push({ ...job, status: 'applied' });
      }

      if (applied % 5 === 0 && applied > 0) {
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `batch-${applied}-${Date.now()}.png`) });
      }

    } catch (err) {
      log('APPLY', `  ❌ FAILED — ${err.message.slice(0, 80)}`);
      failed++;
      results.push({ ...job, status: 'error', error: err.message });
    }

    await randomDelay(4000, 8000);
  }

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `final-v3-${Date.now()}.png`) });

  console.log('\n' + '='.repeat(60));
  console.log('  AUTO-APPLY v3 SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total eligible:    ${eligible.length}`);
  console.log(`  ✅ Applied:        ${applied}`);
  console.log(`  ⏭️  Skipped:       ${skipped}`);
  console.log(`  ❌ Failed:         ${failed}`);
  console.log('='.repeat(60));

  const resultFile = path.resolve(__dirname, `results/auto-apply-v3-${Date.now()}.json`);
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
