import { chromium } from 'playwright';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('🔐 LinkedIn Auto-Login...\n');

  const userDataDir = path.resolve(process.cwd(), 'sessions', 'li-session');
  const email = process.env.NAUKRI_EMAIL || '';
  const password = process.env.LINKEDIN_PASSWORD || process.env.NAUKRI_PASSWORD || '';

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1366, height: 900 },
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(5000);

  const url = page.url();
  console.log('Current URL:', url);

  if (url.includes('/feed')) {
    console.log('✅ Already logged in!');
    await context.close();
    return;
  }

  // Take screenshot to see login page state
  await page.screenshot({ path: 'screenshots/linkedin-login-page.png' });
  console.log('📸 Screenshot saved');

  // Dump all visible inputs
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(i => ({
      id: i.id, name: i.name, type: i.type,
      visible: i.offsetParent !== null,
      rect: i.getBoundingClientRect(),
    }));
  });
  console.log('All inputs:', JSON.stringify(inputs, null, 2));

  // Fill using type instead of fill (more reliable)
  const usernameInput = page.locator('#username');
  const passwordInput = page.locator('#password');

  if (await usernameInput.count() > 0) {
    await usernameInput.click({ timeout: 5000 });
    await page.keyboard.type(email, { delay: 50 });
    await sleep(500);
    await passwordInput.click({ timeout: 5000 });
    await page.keyboard.type(password, { delay: 50 });
    await sleep(500);
    await page.keyboard.press('Enter');
    console.log('📧 Credentials typed and submitted!');
  } else {
    // Click visible email input by type
    await page.click('input[type="email"]:visible', { timeout: 5000 }).catch(() => {});
    await page.keyboard.type(email, { delay: 50 });
    await page.click('input[type="password"]:visible', { timeout: 5000 }).catch(() => {});
    await page.keyboard.type(password, { delay: 50 });
    await page.keyboard.press('Enter');
    console.log('📧 Used type selectors');
  }

  await sleep(15000);
  const postUrl = page.url();
  console.log('Post-login URL:', postUrl);

  if (postUrl.includes('checkpoint') || postUrl.includes('challenge')) {
    console.log('⚠️  Security verification needed! Complete in browser...');
    await page.screenshot({ path: 'screenshots/linkedin-challenge.png' });
    console.log('⏳ Waiting 60s...');
    await sleep(60000);
  }

  await page.screenshot({ path: 'screenshots/linkedin-post-login.png' });

  if (page.url().includes('/feed') || page.url().includes('/mynetwork')) {
    console.log('✅ Successfully logged in! Session saved.');
  } else {
    console.log('Final URL:', page.url());
  }

  await context.close();
}

main().catch(e => { console.error(e); process.exit(1); });
