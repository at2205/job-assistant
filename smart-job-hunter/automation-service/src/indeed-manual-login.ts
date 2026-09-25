import { chromium } from 'playwright';
import * as path from 'path';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('============================================================');
  console.log('  INDEED MANUAL LOGIN (session will be saved)');
  console.log('============================================================\n');

  const userDataDir = path.resolve(process.cwd(), 'sessions', 'indeed-session');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1366, height: 900 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars', '--no-sandbox'],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://secure.indeed.com/auth', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3000);

  // If already authenticated, Indeed redirects away from the auth page (usually to the homepage/profile).
  const alreadyIn = () => {
    const u = page.url();
    return !u.includes('/auth') && !u.includes('/account/login');
  };

  if (alreadyIn()) {
    console.log('✅ Already logged in! Session is valid.');
    await context.close();
    return;
  }

  console.log('👉 Please log in MANUALLY in the opened browser window.');
  console.log('   Enter email/password (or Google sign-in), and complete any');
  console.log('   Cloudflare / captcha / email-OTP verification.');
  console.log('   I will wait up to 8 minutes and detect success automatically.\n');

  const deadline = Date.now() + 8 * 60 * 1000;
  let loggedIn = false;
  while (Date.now() < deadline) {
    await sleep(3000);
    if (alreadyIn()) { loggedIn = true; break; }
  }

  if (loggedIn) {
    // settle so cookies persist to disk
    await sleep(4000);
    console.log('✅ Login detected! Session saved to sessions/indeed-session.');
  } else {
    console.log('⏱️  Timed out waiting for login. Re-run if needed.');
  }

  await context.close();
}

main().catch(e => { console.error(e); process.exit(1); });
