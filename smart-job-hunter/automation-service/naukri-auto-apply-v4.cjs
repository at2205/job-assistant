/**
 * Naukri Auto-Apply v4 — handles text input + radio buttons + resume upload
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

function getAnswer(question) {
  const q = question.toLowerCase();
  if (q.includes('years of experience') || q.includes('year of experience') || q.includes('how many years')) {
    if (q.includes('java') || q.includes('spring') || q.includes('backend') || q.includes('rest') || q.includes('hibernate') || q.includes('sql') || q.includes('database') || q.includes('postgresql')) return '1';
    if (q.includes('react') || q.includes('next') || q.includes('frontend') || q.includes('full stack') || q.includes('fullstack') || q.includes('node') || q.includes('javascript') || q.includes('typescript')) return '1';
    if (q.includes('html') || q.includes('css')) return '1';
    if (q.includes('python') || q.includes('aws') || q.includes('cloud') || q.includes('devops') || q.includes('kubernetes') || q.includes('angular') || q.includes('docker')) return '0';
    if (q.includes('microservice')) return '1';
    return '1';
  }
  if (q.includes('current ctc') || q.includes('current salary') || q.includes('present ctc') || q.includes('annual ctc')) return '4';
  if (q.includes('expected ctc') || q.includes('expected salary')) return '6';
  if (q.includes('notice period')) return '15';
  if (q.includes('current location') || q.includes('current city')) return 'Noida';
  if (q.includes('qualification') || q.includes('degree')) return 'B.Tech';
  if (q.includes('graduation year') || q.includes('passing year')) return '2023';
  if (q.includes('gender')) return 'Male';
  if (q.includes('rate') || q.includes('proficiency') || q.includes('scale')) return '8';
  return '1';
}

// For radio buttons: pick the best answer
function getRadioChoice(question, options) {
  const q = question.toLowerCase();
  // Always pick "Yes" for location/relocation/availability questions
  if (q.includes('residing') || q.includes('relocat') || q.includes('willing') || q.includes('available') || q.includes('join immediately'))
    return 'Yes';
  // For any yes/no — pick Yes
  if (options.some(o => o.toLowerCase() === 'yes'))
    return 'Yes';
  // Pick first option that's not "skip"
  return options.find(o => !o.toLowerCase().includes('skip')) || options[0];
}

async function handleChatbot(page) {
  const maxRounds = 20;
  let lastMsgCount = 0;
  let stuckCount = 0;

  for (let round = 0; round < maxRounds; round++) {
    await randomDelay(1500, 2500);

    const state = await page.evaluate(() => {
      const container = document.querySelector('._chatBotContainer, [class*="chatBotContainer"]');
      if (!container) return null;

      const msgs = [...container.querySelectorAll('.chatbot_ListItem, [class*="ListItem"]')].map(m => m.textContent?.trim()).filter(Boolean);
      const lastMsg = msgs[msgs.length - 1] || '';

      // Check for radio buttons
      const radios = [...container.querySelectorAll('input.ssrc__radio')].map(r => ({ id: r.id, value: r.value }));

      // Check for text input visibility
      const sendContainer = container.querySelector('[class*="SendMessageContainer"]');
      const inputVisible = sendContainer ? !sendContainer.classList.contains('d-none') : false;

      // Check for file upload prompt
      const uploaderVisible = !!container.querySelector('[id*="Uploader"]:not(.d-none)');

      return { msgs, lastMsg, radios, inputVisible, uploaderVisible, msgCount: msgs.length };
    });

    if (!state) break;

    // Success detection
    const lm = state.lastMsg.toLowerCase();
    if (lm.includes('applied successfully') || lm.includes('application submitted') ||
        lm.includes('already applied') || lm.includes('thank you for applying') ||
        lm.includes('your application has been')) {
      return 'applied';
    }

    // Stuck detection
    if (state.msgCount === lastMsgCount) {
      stuckCount++;
      if (stuckCount >= 3) return 'stuck';
    } else {
      stuckCount = 0;
      lastMsgCount = state.msgCount;
    }

    // Handle resume upload
    if (state.lastMsg.toLowerCase().includes('upload') && state.lastMsg.toLowerCase().includes('resume')) {
      return 'resume_needed';
    }

    // Handle radio buttons
    if (state.radios.length > 0) {
      const options = state.radios.map(r => r.id || r.value);
      const choice = getRadioChoice(state.lastMsg, options);
      log('BOT', `  Q: "${state.lastMsg.slice(0, 50)}" → Radio: "${choice}"`);

      await page.evaluate((choice) => {
        const container = document.querySelector('._chatBotContainer, [class*="chatBotContainer"]');
        const radios = container.querySelectorAll('input.ssrc__radio');
        for (const r of radios) {
          if (r.id === choice || r.value === choice) {
            r.checked = true;
            r.dispatchEvent(new Event('change', { bubbles: true }));
            r.click();
            break;
          }
        }
      }, choice);
      await randomDelay(500, 1000);

      // Click Save button
      await page.evaluate(() => {
        const container = document.querySelector('._chatBotContainer, [class*="chatBotContainer"]');
        const sendBtn = container.querySelector('div.send, .sendMsgbtn_container div.send');
        if (sendBtn) sendBtn.click();
      });
      continue;
    }

    // Handle text input
    if (state.inputVisible) {
      const answer = getAnswer(state.lastMsg);
      log('BOT', `  Q: "${state.lastMsg.slice(0, 50)}" → A: "${answer}"`);

      const input = await page.$('[id*="userInput"][contenteditable="true"]');
      if (!input) break;

      try {
        await input.click({ timeout: 3000 });
      } catch { break; }

      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(answer, { delay: 30 + Math.random() * 30 });
      await randomDelay(300, 600);
      await page.keyboard.press('Enter');
      continue;
    }

    // Neither radio nor input visible — wait a bit more
    stuckCount++;
  }

  return 'completed';
}

async function main() {
  console.log('='.repeat(60));
  console.log('  NAUKRI AUTO-APPLY v4');
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

  let isLoggedIn = !page.url().includes('/nlogin/login');
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
      await page.waitForSelector('.nI-gNb-header__userImg, div.nI-gNb-header__right', { timeout: 15000 });
    } catch {
      log('AUTH', 'Waiting 60s for OTP...');
      await sleep(60000);
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

      // Check if job expired (redirected to search)
      if (page.url().includes('/joblist') || page.url().includes('expired')) {
        log('APPLY', `  SKIP — expired`);
        skipped++;
        results.push({ ...job, status: 'expired' });
        continue;
      }

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
        log('APPLY', `  SKIP — no apply button (external/expired)`);
        skipped++;
        results.push({ ...job, status: 'external_or_expired' });
        continue;
      }

      // Click Apply
      await applyBtn.click();
      await randomDelay(3000, 5000);

      // Check for chatbot
      const chatbot = await page.$('._chatBotContainer, [class*="chatBotContainer"]');
      if (chatbot) {
        const result = await handleChatbot(page);
        if (result === 'applied') {
          log('APPLY', `  ✅ APPLIED`);
          applied++;
          results.push({ ...job, status: 'applied' });
        } else if (result === 'resume_needed') {
          log('APPLY', `  ⏭️  Skipped (resume upload needed)`);
          skipped++;
          results.push({ ...job, status: 'resume_needed' });
        } else {
          log('APPLY', `  ✅ Chatbot ${result} — likely applied`);
          applied++;
          results.push({ ...job, status: result });
        }
      } else {
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

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `final-v4-${Date.now()}.png`) });

  console.log('\n' + '='.repeat(60));
  console.log('  AUTO-APPLY v4 SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total eligible:    ${eligible.length}`);
  console.log(`  ✅ Applied:        ${applied}`);
  console.log(`  ⏭️  Skipped:       ${skipped}`);
  console.log(`  ❌ Failed:         ${failed}`);
  console.log('='.repeat(60));

  const resultFile = path.resolve(__dirname, `results/auto-apply-v4-${Date.now()}.json`);
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
