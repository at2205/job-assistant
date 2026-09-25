/**
 * Naukri Project Adder v5 — single project test with full debugging
 * Key fix: close dropdown after selection, scroll up before save, debug hidden errors
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const SESSION_DIR = path.resolve(__dirname, 'sessions', 'naukri-session');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots', 'naukri-projects-v5');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const delay = (min, max) => sleep(min + Math.random() * (max - min));

async function selectDropdown(page, inputId, value) {
  await page.click(`#${inputId}`);
  await sleep(1000);
  const result = await page.evaluate(({ inputId, value }) => {
    const input = document.getElementById(inputId);
    let ddwn = input?.closest('.ddwn');
    if (!ddwn) return { selected: false };
    const items = ddwn.querySelectorAll('li');
    for (const li of items) {
      if (li.textContent?.trim() === value) { li.click(); return { selected: true }; }
    }
    return { selected: false, available: [...items].slice(0, 5).map(i => i.textContent?.trim()) };
  }, { inputId, value });
  // After selection, click somewhere else to close the dropdown
  await page.click('.lightbox:not(.flipClose) .headCont, .lightbox:not(.flipClose) h2, .lightbox:not(.flipClose) .heading').catch(() => {});
  await sleep(500);
  return result;
}

async function main() {
  console.log('\n═══ NAUKRI PROJECT ADDER v5 (single test) ═══\n');

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false, slowMo: 40,
    viewport: { width: 1920, height: 1080 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });

  const page = context.pages()[0] || await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  try {
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(4000, 6000);

    if (page.url().includes('/nlogin')) {
      await page.fill('input[placeholder="Enter Email ID / Username"]', process.env.NAUKRI_EMAIL);
      await delay(500, 1000);
      await page.fill('input[placeholder="Enter Password"]', process.env.NAUKRI_PASSWORD);
      await delay(500, 1000);
      await page.click('button[type="submit"]');
      await delay(5000, 8000);
      await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(4000, 6000);
    }
    console.log('Profile loaded.\n');

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
    await delay(3000, 4000);

    // 1. Title
    await page.fill('.lightbox:not(.flipClose) #projectTitle', 'CAPS — Channel Administration & Payment System');
    console.log('1. Title ✅');
    await delay(300, 500);

    // 2. Employment tag — click to open, select first option
    await page.evaluate(() => {
      const dd = document.querySelector('.lightbox:not(.flipClose) #eduExpId');
      if (dd) dd.querySelector('.DDsearch input, input')?.click();
    });
    await sleep(1000);
    await page.evaluate(() => {
      const dd = document.querySelector('.lightbox:not(.flipClose) #eduExpId');
      const items = dd?.querySelectorAll('li');
      if (items) for (const li of items) {
        const t = li.textContent?.trim();
        if (t && !t.includes('Select') && t.length > 3) { li.click(); return; }
      }
    });
    await delay(500, 800);
    console.log('2. Employment tag ✅');

    // 3. Client
    await page.fill('.lightbox:not(.flipClose) input[placeholder*="client" i]', 'BankIT');
    console.log('3. Client ✅');
    await delay(300, 500);

    // 4. Year
    const yr = await selectDropdown(page, 'projStartYearFor', '2024');
    console.log(`4. Year: ${JSON.stringify(yr)}`);
    await delay(300, 500);

    // 5. Month
    const mo = await selectDropdown(page, 'projStartMonthFor', 'Oct');
    console.log(`5. Month: ${JSON.stringify(mo)}`);
    await delay(500, 800);

    // Close any open dropdown by clicking the form title area
    await page.evaluate(() => {
      const lb = document.querySelector('.lightbox:not(.flipClose)');
      if (lb) {
        // Click the heading to deselect dropdowns
        const h = lb.querySelector('h2, .heading, .headCont, .subHead');
        if (h) h.click();
      }
    });
    await delay(500, 800);

    // 6. Description — scroll down in the lightbox first
    await page.evaluate(() => {
      const lb = document.querySelector('.lightbox:not(.flipClose)');
      const ta = lb?.querySelector('#projectDetails, textarea');
      if (ta) ta.scrollIntoView({ block: 'center' });
    });
    await delay(300, 500);

    // Use Playwright fill for the textarea
    try {
      await page.click('.lightbox:not(.flipClose) #projectDetails');
      await delay(200, 400);
      await page.fill('.lightbox:not(.flipClose) #projectDetails',
        'Enterprise fintech admin portal managing multi-tier distribution network for AEPS, DMT, Micro ATM, bill payments, and IRCTC bookings. Migrated legacy Struts 2 to Spring Boot + Next.js. Built 200+ REST APIs with JWT RBAC, KYC management with AWS S3, trade balance and fund management, HubSpot CRM integration, RazorPay payment gateway. Tech: Java, Spring Boot, Next.js, MS SQL Server, AWS S3, JWT, HubSpot, RazorPay.');
      console.log('6. Description ✅ (fill)');
    } catch (e) {
      console.log(`6. Description fill failed: ${e.message}, trying evaluate...`);
      await page.evaluate(() => {
        const lb = document.querySelector('.lightbox:not(.flipClose)');
        const ta = lb?.querySelector('#projectDetails, textarea');
        if (ta) {
          const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          s.call(ta, 'Enterprise fintech admin portal managing multi-tier distribution network for AEPS, DMT, Micro ATM, bill payments, and IRCTC bookings. Migrated legacy Struts 2 to Spring Boot + Next.js. Built 200+ REST APIs with JWT RBAC, KYC management with AWS S3, trade balance and fund management, HubSpot CRM integration, RazorPay payment gateway. Tech: Java, Spring Boot, Next.js, MS SQL Server, AWS S3, JWT, HubSpot, RazorPay.');
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      console.log('6. Description ✅ (evaluate)');
    }
    await delay(500, 800);

    // Take screenshot of the filled form
    // Scroll lightbox to top to see all fields
    await page.evaluate(() => {
      const lb = document.querySelector('.lightbox:not(.flipClose)');
      if (lb) {
        const scrollable = lb.querySelector('.lightboxContent, .contentArea, .innerContent') || lb;
        scrollable.scrollTop = 0;
      }
    });
    await delay(300, 500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'form-top.png') });

    // Scroll down to see description + save
    await page.evaluate(() => {
      const lb = document.querySelector('.lightbox:not(.flipClose)');
      if (lb) {
        const scrollable = lb.querySelector('.lightboxContent, .contentArea, .innerContent') || lb;
        scrollable.scrollTop = scrollable.scrollHeight;
      }
    });
    await delay(300, 500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'form-bottom.png') });

    // 7. Dump all form values before saving
    const formState = await page.evaluate(() => {
      const lb = document.querySelector('.lightbox:not(.flipClose)');
      if (!lb) return { error: 'no lightbox' };
      const inputs = lb.querySelectorAll('input, textarea, select');
      const state = {};
      inputs.forEach(inp => {
        const key = inp.id || inp.name || inp.placeholder || inp.tagName;
        state[key] = { value: inp.value?.substring(0, 60), type: inp.type, hidden: inp.type === 'hidden' };
      });
      // Check for hidden validation errors
      const errors = lb.querySelectorAll('[class*="error"], [class*="Error"], .msg, .validationError');
      const errorMsgs = [...errors].map(e => e.textContent?.trim()).filter(t => t && t.length < 200);
      return { fields: state, errors: errorMsgs };
    });
    console.log('\n7. Form state before save:');
    console.log(JSON.stringify(formState, null, 2));

    // 8. Click Save using Playwright click
    console.log('\n8. Clicking Save...');
    try {
      await page.click('.lightbox:not(.flipClose) button:has-text("Save")', { timeout: 5000 });
    } catch {
      await page.evaluate(() => {
        const lb = document.querySelector('.lightbox:not(.flipClose)');
        for (const btn of lb?.querySelectorAll('button') || []) {
          if (btn.textContent?.trim() === 'Save') { btn.click(); return; }
        }
      });
    }
    await delay(4000, 6000);

    // Check result
    const afterSave = await page.evaluate(() => {
      const lb = document.querySelector('.lightbox:not(.flipClose)');
      if (!lb) return { closed: true };
      if (!lb.querySelector('#projectTitle')) return { closed: true };
      // Still open — check for errors
      const errors = lb.querySelectorAll('[class*="error"], [class*="Error"], .msg, .formError');
      const errorMsgs = [...errors].map(e => ({ text: e.textContent?.trim(), class: e.className?.substring(0, 60), visible: e.offsetHeight > 0 }));
      // Check all required fields
      const title = lb.querySelector('#projectTitle')?.value;
      const hidYear = lb.querySelector('#hid_projStartYear')?.value;
      const hidMonth = lb.querySelector('#hid_projStartMonth')?.value;
      const desc = lb.querySelector('#projectDetails, textarea')?.value?.substring(0, 40);
      return { closed: false, errors: errorMsgs, title, hidYear, hidMonth, desc };
    });

    console.log('\n9. After save:');
    console.log(JSON.stringify(afterSave, null, 2));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'after-save.png') });

    console.log('\n═══ DONE ═══\n');

  } catch (err) {
    console.error('\n❌ Fatal:', err.message);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error.png') }).catch(() => {});
  } finally {
    await sleep(3000);
    await context.close();
  }
}

main().catch(console.error);
