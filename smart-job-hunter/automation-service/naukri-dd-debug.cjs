/**
 * Quick debug: inspect dropdown li structure
 */
const { chromium } = require('playwright');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const SESSION_DIR = path.resolve(__dirname, 'sessions', 'naukri-session');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false, slowMo: 40,
    viewport: { width: 1920, height: 1080 },
    args: ['--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });
  const page = context.pages()[0] || await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  try {
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);

    if (page.url().includes('/nlogin')) {
      await page.fill('input[placeholder="Enter Email ID / Username"]', process.env.NAUKRI_EMAIL);
      await sleep(500);
      await page.fill('input[placeholder="Enter Password"]', process.env.NAUKRI_PASSWORD);
      await sleep(500);
      await page.click('button[type="submit"]');
      await sleep(6000);
      await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(5000);
    }

    // Open Add Project form
    await page.evaluate(() => {
      const lis = document.querySelectorAll('li');
      for (const li of lis) {
        if (li.textContent?.includes('Projects') && li.textContent?.includes('Add')) {
          const link = li.querySelector('a');
          if (link) { link.click(); return; }
        }
      }
    });
    await sleep(3000);

    // Click year dropdown input
    await page.click('#projStartYearFor');
    await sleep(1500);

    // Inspect the HTML of the first 3 li items
    const liInfo = await page.evaluate(() => {
      const input = document.getElementById('projStartYearFor');
      const ddwn = input?.closest('.ddwn');
      if (!ddwn) return { error: 'no ddwn' };
      const items = ddwn.querySelectorAll('li');
      return [...items].slice(0, 5).map(li => ({
        outerHTML: li.outerHTML.substring(0, 200),
        text: li.textContent?.trim(),
        childTags: [...li.children].map(c => c.tagName),
        innerHTML: li.innerHTML.substring(0, 200),
      }));
    });
    console.log('Year dropdown li structure:');
    console.log(JSON.stringify(liInfo, null, 2));

    // Also check: what locator does Playwright find for these?
    const count = await page.locator('#projStartYear li').count();
    console.log(`\nPlaywright locator '#projStartYear li' count: ${count}`);

    // Try exact text locator
    const match2024 = await page.locator('#projStartYear li', { hasText: '2024' }).count();
    console.log(`Locator with hasText '2024': ${match2024}`);

    // Try clicking with getByText
    try {
      await page.locator('#projStartYear li').getByText('2024', { exact: true }).click({ timeout: 3000 });
      console.log('Clicked 2024 via getByText!');
    } catch (e) {
      console.log(`getByText failed: ${e.message.substring(0, 100)}`);
    }

    await sleep(1000);

    // Check if year was selected
    const yearVal = await page.evaluate(() => {
      return {
        inputVal: document.getElementById('projStartYearFor')?.value,
        hidVal: document.querySelector('#hid_projStartYear')?.value,
        displayText: document.getElementById('projStartYear')?.querySelector('.placeholder, .selectedVal, .srchTxt')?.textContent?.trim(),
      };
    });
    console.log('\nAfter click:', JSON.stringify(yearVal));

    // Cancel the form
    await page.evaluate(() => {
      const lb = document.querySelector('.lightbox:not(.flipClose)');
      for (const btn of lb?.querySelectorAll('button') || []) {
        if (btn.textContent?.trim() === 'Cancel') { btn.click(); return; }
      }
    });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await sleep(2000);
    await context.close();
  }
}

main().catch(console.error);
