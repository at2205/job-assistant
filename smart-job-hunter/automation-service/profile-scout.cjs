const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);
let snapN = 0;
async function snap(page, label) { snapN++; const f = `scout-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

async function main() {
  console.log('=== LinkedIn Profile Scout ===\n');

  const userDataDir = path.resolve(__dirname, 'sessions', 'li-persistent');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false, slowMo: 30,
    viewport: { width: 1366, height: 768 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars', '--no-sandbox'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'en-IN', timezoneId: 'Asia/Kolkata',
  });

  const page = context.pages()[0] || await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); window.chrome = { runtime: {} }; });

  try {
    console.log('[LOGIN]');
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(rand(3000, 5000));
    if (page.url().includes('/login') || page.url().includes('/authwall')) {
      console.log('  Not logged in!'); await context.close(); return;
    }
    console.log('  OK!');

    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 7000));

    // ============================================================
    // SCOUT: Scroll through entire profile and document sections
    // ============================================================
    console.log('\n[SCOUT] Scanning entire profile...\n');

    // Section 1: Top fold
    await snap(page, 'top');

    // Scroll incrementally and capture
    const scrollPositions = [400, 800, 1200, 1600, 2000, 2400, 2800, 3200, 3600, 4000];
    for (const pos of scrollPositions) {
      await page.evaluate((p) => window.scrollTo(0, p), pos);
      await sleep(1500);
      await snap(page, `scroll-${pos}`);
    }

    // List all sections
    const sections = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('section')).map(sec => {
        const h2 = sec.querySelector('h2');
        const r = sec.getBoundingClientRect();
        // Check for edit buttons
        const editBtns = sec.querySelectorAll('button');
        let hasEdit = false;
        let hasAdd = false;
        for (const b of editBtns) {
          const label = b.getAttribute('aria-label') || b.textContent.trim();
          if (label.toLowerCase().includes('edit')) hasEdit = true;
          if (label.includes('+') || label.toLowerCase().includes('add')) hasAdd = true;
        }
        return {
          title: h2 ? h2.textContent.trim() : '(no h2)',
          top: Math.round(r.top + window.scrollY),
          height: Math.round(r.height),
          hasEdit,
          hasAdd
        };
      }).filter(s => s.height > 30);
    });

    console.log('PROFILE SECTIONS:');
    sections.forEach(s => {
      console.log(`  [${s.title}] top=${s.top} h=${s.height} edit=${s.hasEdit} add=${s.hasAdd}`);
    });

    // Get Experience details
    const experience = await page.evaluate(() => {
      const results = [];
      for (const h2 of document.querySelectorAll('h2')) {
        if (h2.textContent.trim() === 'Experience') {
          const section = h2.closest('section');
          if (!section) continue;
          // Find all experience items
          const items = section.querySelectorAll('li, [class*="experience"]');
          const seen = new Set();
          for (const item of items) {
            const text = item.textContent.trim().replace(/\s+/g, ' ');
            if (text.length > 20 && text.length < 500 && !seen.has(text.substring(0, 50))) {
              seen.add(text.substring(0, 50));
              results.push(text.substring(0, 200));
            }
          }
        }
      }
      return results;
    });

    console.log('\nEXPERIENCE ITEMS:');
    experience.forEach((e, i) => console.log(`  [${i}] ${e}`));

    // Get Skills
    const skills = await page.evaluate(() => {
      const results = [];
      for (const h2 of document.querySelectorAll('h2')) {
        if (h2.textContent.trim() === 'Skills') {
          const section = h2.closest('section');
          if (!section) continue;
          const items = section.querySelectorAll('span');
          const seen = new Set();
          for (const item of items) {
            const t = item.textContent.trim();
            if (t.length > 2 && t.length < 40 && !seen.has(t) &&
                !t.includes('Show') && !t.includes('endorsement') && !t.includes('Edit')) {
              seen.add(t);
              results.push(t);
            }
          }
        }
      }
      return results;
    });

    console.log('\nSKILLS:');
    skills.forEach((s, i) => console.log(`  [${i}] ${s}`));

    // Get Education
    const education = await page.evaluate(() => {
      const results = [];
      for (const h2 of document.querySelectorAll('h2')) {
        if (h2.textContent.trim() === 'Education') {
          const section = h2.closest('section');
          if (!section) continue;
          results.push(section.textContent.trim().replace(/\s+/g, ' ').substring(0, 300));
        }
      }
      return results;
    });

    console.log('\nEDUCATION:');
    education.forEach(e => console.log(`  ${e}`));

    // Check for Projects, Featured, Licenses sections
    const otherSections = await page.evaluate(() => {
      const has = {};
      for (const h2 of document.querySelectorAll('h2')) {
        const t = h2.textContent.trim();
        if (['Projects', 'Featured', 'Licenses & certifications', 'Publications', 'Honors & awards'].includes(t)) {
          has[t] = true;
        }
      }
      return has;
    });

    console.log('\nOTHER SECTIONS:', JSON.stringify(otherSections));

    console.log('\n  Browser closing in 10s...');
    await sleep(10000);

  } catch (err) {
    console.error('[FATAL] ' + err.message);
    await snap(page, 'fatal');
  } finally {
    await context.close();
    console.log('[DONE]');
  }
}

main();
