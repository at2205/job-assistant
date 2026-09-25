/**
 * LinkedIn — Add Skills (robust, selector-based)
 * ==============================================
 * Adds a list of skills to your LinkedIn profile using the Skills details page
 * and the "Add skill" modal typeahead flow.
 *
 * Reuses the same persistent session as profile-v15.cjs (sessions/li-persistent),
 * so run one of your LinkedIn login scripts first if the session isn't warm.
 *
 * Usage:
 *   node linkedin-add-skills.cjs
 *   LI_SKILLS="Microsoft Azure;Kafka" node linkedin-add-skills.cjs   # custom list
 *
 * Notes:
 *   - LinkedIn typeahead only accepts skills that exist in its taxonomy. The
 *     script types the name, waits for the dropdown, and clicks the closest
 *     matching suggestion. If no suggestion appears it skips that skill and logs it.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const LI_EMAIL = process.env.LINKEDIN_EMAIL || 'tomar.aryan16j@gmail.com';
const LI_PASSWORD = process.env.LINKEDIN_PASSWORD || '';

const DEFAULT_SKILLS = [
  'Microsoft Azure',
  'Agentic AI',
  'Azure Kubernetes Service (AKS)',
  'Apache Kafka',
  'Azure App Service',
];

const SKILLS = (process.env.LI_SKILLS
  ? process.env.LI_SKILLS.split(';').map(s => s.trim()).filter(Boolean)
  : DEFAULT_SKILLS);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);
let snapN = 0;
async function snap(page, label) {
  snapN++;
  const f = `add-skills-${snapN}-${label}.png`;
  try { await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); } catch {}
  console.log(`  [SNAP] ${f}`);
}

// Normalize for loose matching between typed name and suggestion text.
const norm = (s) => (s || '').toLowerCase().replace(/[()]/g, '').replace(/\s+/g, ' ').trim();

async function openAddSkillModal(page) {
  // Go straight to the skills details page.
  await page.goto('https://www.linkedin.com/in/me/details/skills/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(rand(3500, 5500));

  // Click the "Add new skill" button (aria-label based, language-tolerant).
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, a')];
    const b = btns.find(el => {
      const t = (el.getAttribute('aria-label') || el.textContent || '').toLowerCase();
      return t.includes('add') && t.includes('skill');
    });
    if (b) { b.click(); return true; }
    return false;
  });
  return clicked;
}

async function addSkill(page, skill) {
  console.log(`\n[SKILL] "${skill}"`);

  const modalOpened = await openAddSkillModal(page);
  if (!modalOpened) {
    console.log('  Could not find "Add new skill" button — skipping.');
    await snap(page, 'no-add-button');
    return false;
  }
  await sleep(rand(2500, 4000));

  // Find the skill text input inside the dialog.
  const input = await page.evaluateHandle(() => {
    const dialog = document.querySelector('[role="dialog"]') || document;
    const el = dialog.querySelector('input[type="text"], input[aria-autocomplete="list"], input:not([type="hidden"])');
    return el || null;
  });
  const inputEl = input.asElement();
  if (!inputEl) {
    console.log('  Skill input not found — skipping.');
    await snap(page, 'no-input');
    return false;
  }

  await inputEl.click();
  await inputEl.fill('');
  await sleep(400);
  await page.keyboard.type(skill, { delay: 45 });
  await sleep(rand(2500, 3800)); // wait for typeahead
  await snap(page, `typeahead-${norm(skill).replace(/\s+/g, '-')}`);

  // Pick the best matching suggestion.
  const picked = await page.evaluate((wanted) => {
    const normLocal = (s) => (s || '').toLowerCase().replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
    const w = normLocal(wanted);
    const opts = [...document.querySelectorAll('[role="option"], [role="listbox"] [role="option"], div[class*="typeahead"] [role="option"]')]
      .filter(o => {
        const r = o.getBoundingClientRect();
        return r.width > 40 && r.height > 8 && r.y > 0;
      });
    if (!opts.length) return { ok: false, reason: 'no-options' };
    // Prefer exact-ish match, else first option.
    let target = opts.find(o => normLocal(o.textContent).startsWith(w) || w.startsWith(normLocal(o.textContent)))
      || opts.find(o => normLocal(o.textContent).includes(w) || w.includes(normLocal(o.textContent)))
      || opts[0];
    target.click();
    return { ok: true, text: (target.textContent || '').trim().substring(0, 60) };
  }, skill);

  if (!picked.ok) {
    console.log(`  No typeahead suggestion (${picked.reason}) — LinkedIn may not know this exact skill. Skipping.`);
    await snap(page, 'no-suggestion');
    // Close modal without saving.
    await page.keyboard.press('Escape');
    await sleep(800);
    await dismissDiscard(page);
    return false;
  }
  console.log(`  Selected suggestion: "${picked.text}"`);
  await sleep(rand(1000, 1800));

  // Click Save.
  const saved = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') || document;
    const btns = [...dialog.querySelectorAll('button')];
    const b = btns.find(el => (el.textContent || '').trim().toLowerCase() === 'save')
      || btns.find(el => (el.getAttribute('aria-label') || '').toLowerCase().includes('save'));
    if (b && !b.disabled) { b.click(); return true; }
    return false;
  });

  if (!saved) {
    console.log('  Save button not found/enabled — skipping.');
    await snap(page, 'no-save');
    await page.keyboard.press('Escape');
    await sleep(800);
    await dismissDiscard(page);
    return false;
  }

  console.log('  >>> SAVED <<<');
  await sleep(rand(2500, 4000));
  await snap(page, 'saved');
  return true;
}

async function dismissDiscard(page) {
  const btn = await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      const t = (b.textContent || '').trim().toLowerCase();
      if (t === 'discard' || t === 'no thanks') {
        b.click();
        return true;
      }
    }
    return false;
  });
  if (btn) await sleep(800);
}

async function main() {
  console.log('=== LinkedIn — Add Skills ===');
  console.log('Skills to add:', SKILLS.join(', '), '\n');

  const userDataDir = path.resolve(__dirname, 'sessions', 'li-persistent');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false, slowMo: 30,
    viewport: { width: 1366, height: 768 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars', '--no-sandbox'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'en-IN', timezoneId: 'Asia/Kolkata',
  });

  const page = context.pages()[0] || await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
  });

  const results = { added: [], skipped: [] };

  try {
    console.log('[LOGIN]');
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(rand(3000, 5000));
    let url = page.url();
    if (url.includes('/login') || url.includes('/authwall') || url.includes('/checkpoint')) {
      console.log('  Session inactive — logging in with credentials...');
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000);
      const emailEl = await page.$('#username');
      if (emailEl) { await emailEl.click(); await sleep(300); for (const ch of LI_EMAIL) await page.keyboard.type(ch, { delay: rand(40, 100) }); }
      await sleep(rand(500, 800));
      const passEl = await page.$('#password');
      if (passEl) { await passEl.click(); await sleep(300); for (const ch of LI_PASSWORD) await page.keyboard.type(ch, { delay: rand(40, 100) }); }
      await sleep(rand(600, 1200));
      const sub = await page.$('button[type="submit"]'); if (sub) await sub.click();
      await sleep(rand(6000, 10000));
      url = page.url();
      if (!url.includes('/feed') && !url.includes('/in/') && !url.includes('/mynetwork')) {
        console.log('  Security checkpoint / OTP — complete it in the browser (waiting up to 5 min)...');
        const dl = Date.now() + 300000;
        while (Date.now() < dl) { await sleep(3000); url = page.url(); if (url.includes('/feed') || url.includes('/in/') || url.includes('/mynetwork')) break; }
      }
      if (!(url.includes('/feed') || url.includes('/in/') || url.includes('/mynetwork'))) {
        console.log('  Login FAILED: ' + url);
        await context.close();
        return;
      }
    }
    console.log('  OK!\n');

    for (const skill of SKILLS) {
      let ok = false;
      try {
        ok = await addSkill(page, skill);
      } catch (e) {
        console.log(`  ERROR adding "${skill}": ${e.message}`);
        await dismissDiscard(page);
      }
      (ok ? results.added : results.skipped).push(skill);
      await sleep(rand(2000, 3500));
    }

    console.log('\n=== DONE ===');
    console.log('Added  :', results.added.join(', ') || '(none)');
    console.log('Skipped:', results.skipped.join(', ') || '(none)');
    if (results.skipped.length) {
      console.log('\nTip: skipped skills were not offered by LinkedIn typeahead. Try an alternate');
      console.log('name via LI_SKILLS, e.g. "Kafka" instead of "Apache Kafka".');
    }
  } catch (e) {
    console.error('FATAL:', e);
  } finally {
    await sleep(2000);
    await context.close();
  }
}

main();
