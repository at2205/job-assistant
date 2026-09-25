const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars', '--no-sandbox'],
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
  });

  // Go to Naukri homepage to check what logged-in state looks like
  await page.goto('https://www.naukri.com/mnjuser/homepage', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  console.log('URL:', page.url());
  console.log('TITLE:', await page.title());

  // Check for common logged-in indicators
  const checks = [
    'a.nI-gNb-drawer__hamburger',
    'div.nI-gNb-header__right',
    'div.view-profile-wrapper',
    '.nI-gNb-header__usermenu',
    'a[href*="profile"]',
    '.user-name',
    '.nI-gNb-pcr',
    'div[class*="profile"]',
    'div[class*="header"]',
    'nav',
  ];

  for (const sel of checks) {
    const found = await page.$(sel);
    console.log(sel, '->', found ? 'FOUND' : 'not found');
  }

  // Dump top-level nav content
  const navText = await page.evaluate(() => {
    const nav = document.querySelector('header') || document.querySelector('nav');
    return nav ? nav.textContent.trim().substring(0, 300) : 'NO NAV';
  });
  console.log('NAV TEXT:', navText);

  await browser.close();
})().catch(e => console.error('Error:', e.message));
