import { chromium } from 'playwright';
import * as path from 'path';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('============================================================');
  console.log('  LINKEDIN MANUAL LOGIN (session will be saved)');
  console.log('============================================================\n');

  const userDataDir = path.resolve(process.cwd(), 'sessions', 'li-session');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1366, height: 900 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars', '--no-sandbox'],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  if (page.url().includes('/feed') || page.url().includes('/mynetwork')) {
    console.log('✅ Already logged in! Session is valid.');
    await context.close();
    return;
  }

  console.log('👉 Please log in MANUALLY in the opened browser window.');
  console.log('   Enter email/password, complete any security verification / OTP.');
  console.log('   I will wait up to 6 minutes and detect success automatically.\n');

  const deadline = Date.now() + 6 * 60 * 1000;
  let loggedIn = false;
  while (Date.now() < deadline) {
    await sleep(3000);
    const u = page.url();
    if (u.includes('/feed') || u.includes('/mynetwork') || u.includes('/jobs')) {
      loggedIn = true;
      break;
    }
  }

  if (loggedIn) {
    // settle so cookies persist to disk
    await sleep(4000);
    console.log('✅ Login detected! Session saved to sessions/li-session.');
  } else {
    console.log('⏱️  Timed out waiting for login. Re-run if needed.');
  }

  await context.close();
}

main().catch(e => { console.error(e); process.exit(1); });
