/**
 * Himalayas (https://himalayas.app) manual login — sign in with your Google
 * account ONCE in the opened browser; the session is persisted to disk so the
 * scraper can reuse it without logging in again.
 *
 * Usage: npx tsx src/himalayas-manual-login.ts
 */
import { chromium } from 'playwright';
import * as path from 'path';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('============================================================');
  console.log('  HIMALAYAS MANUAL LOGIN (Google) — session will be saved');
  console.log('============================================================\n');

  const userDataDir = path.resolve(process.cwd(), 'sessions', 'himalayas-session');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1366, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--no-sandbox',
    ],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://himalayas.app/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // Already logged in? Himalayas shows a user avatar / dashboard link.
  if (await isLoggedIn(page)) {
    console.log('✅ Already logged in! Session is valid.');
    await context.close();
    return;
  }

  console.log('👉 In the opened browser: click "Continue with Google" and complete');
  console.log('   the Google sign-in (email, password, 2FA if any).');
  console.log('   I will wait up to 6 minutes and detect success automatically.\n');

  const deadline = Date.now() + 6 * 60 * 1000;
  let loggedIn = false;
  while (Date.now() < deadline) {
    await sleep(3000);
    if (await isLoggedIn(page)) { loggedIn = true; break; }
  }

  if (loggedIn) {
    await sleep(4000); // let cookies persist to disk
    console.log('✅ Login detected! Session saved to sessions/himalayas-session.');
  } else {
    console.log('⏱️  Timed out waiting for login. Re-run if needed.');
  }

  await context.close();
}

/** Detect a logged-in Himalayas session (avatar, dashboard, or logout link). */
async function isLoggedIn(page: import('playwright').Page): Promise<boolean> {
  try {
    const u = page.url();
    if (u.includes('/dashboard') || u.includes('/profile') || u.includes('/onboarding')) return true;
    return await page.evaluate(() => {
      const hasLogout = !!document.querySelector('a[href*="logout"], form[action*="logout"]');
      const hasDash = !!document.querySelector('a[href*="/dashboard"], a[href*="/profile"]');
      const hasLogin = !!document.querySelector('a[href*="/login"], a[href="/signup"]');
      return (hasLogout || hasDash) && !hasLogin;
    });
  } catch {
    return false;
  }
}

main().catch(e => { console.error(e); process.exit(1); });
