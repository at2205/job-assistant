/**
 * LinkedIn — Update Headline + About (robust, selector-based)
 * ===========================================================
 * Updates the profile Headline (via the "Edit intro" modal) and the
 * About/Summary section (via the "Edit about" modal) using aria-label /
 * role-based selectors instead of fragile pixel clicks.
 *
 * Reuses the persistent session (sessions/li-persistent) and auto-logs-in
 * with credentials from .env (LINKEDIN_EMAIL / LINKEDIN_PASSWORD) if needed.
 *
 * Usage:
 *   node linkedin-update-profile.cjs
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const LI_EMAIL = process.env.LINKEDIN_EMAIL || 'tomar.aryan16j@gmail.com';
const LI_PASSWORD = process.env.LINKEDIN_PASSWORD || '';

const HEADLINE = 'Backend Engineer | Java · Spring Boot · Microservices · REST APIs | Full Stack (React/Next.js) | Agentic AI (Claude) · Azure · Kafka | Building AI-Powered Automation';

const ABOUT = `I build backend systems and full-stack products — then wire Agentic AI into them to make them autonomous.

I have hands-on working experience with Agentic AI: I've designed and integrated Claude (Anthropic) into projects to build tool-using agents that plan, reason, and execute multi-step workflows end to end — not toy demos, but systems that replace real manual work.

Right now I'm building JobFlow AI: a career automation platform that scrapes jobs, scores them with ATS analysis, generates tailored resumes using LLMs, and manages the entire application pipeline. The stack: Express + TypeScript backend, PostgreSQL on Supabase, Claude/Groq LLM integration, Playwright browser automation, and a Next.js dashboard.

Before that, I built ConnectVerse (a real-time social platform with WebRTC video calling), mSwasth (a healthcare portal managing 500+ patient records), FindiInsure (an insurance marketplace with multi-role access), and an AEPS Agent Onboarding System with AES-256 encryption for fintech biometric workflows.

My core stack:
→ Backend: Java, Spring Boot, REST APIs, Microservices, PostgreSQL, Kafka
→ Cloud: Microsoft Azure (AKS, App Services), Docker
→ Frontend: React.js, Next.js, TypeScript, Tailwind CSS
→ Agentic AI / Automation: Claude (Anthropic), LLM integration, Playwright

What I'm good at:
• Taking a product from idea → architecture → working system, fast
• Designing clean REST APIs and database schemas
• Integrating Agentic AI/LLMs into real workflows
• Building automation that replaces manual processes

I don't just use AI tools — I build systems that orchestrate them.

Open to backend, full-stack, or product engineering roles where I can build things that matter.`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);
let snapN = 0;
async function snap(page, label) {
  snapN++;
  const f = `update-profile-${snapN}-${label}.png`;
  try { await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); } catch {}
  console.log(`  [SNAP] ${f}`);
}

// Set a textarea/input/contenteditable value in a React-compatible way.
async function setFieldValue(page, handle, text) {
  return await page.evaluate(({ el, text }) => {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    // contenteditable (Quill / rich text): set text as paragraphs.
    el.focus();
    const html = text.split('\n').map(line => `<p>${line ? line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '<br>'}</p>`).join('');
    el.innerHTML = html;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { el: handle, text });
}

async function findEditableInDialog(page, preferHeadline) {
  const handle = await page.evaluateHandle((preferHeadline) => {
    const dialog = document.querySelector('[role="dialog"]') || document;
    if (preferHeadline) {
      const tas = [...dialog.querySelectorAll('textarea')];
      for (const ta of tas) {
        const lbl = ta.id ? document.querySelector(`label[for="${ta.id}"]`) : null;
        const txt = ((lbl && lbl.textContent) || ta.getAttribute('aria-label') || ta.name || ta.id || '').toLowerCase();
        if (txt.includes('headline')) return ta;
      }
      if (tas[0]) return tas[0];
    }
    return dialog.querySelector('textarea, [contenteditable="true"], div[role="textbox"]') || null;
  }, preferHeadline);
  return handle.asElement();
}

async function clickButtonByLabel(page, matchers) {
  return await page.evaluate((matchers) => {
    const btns = [...document.querySelectorAll('button, a')];
    const b = btns.find(el => {
      const t = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).toLowerCase();
      return matchers.every(m => t.includes(m));
    });
    if (b) { b.click(); return true; }
    return false;
  }, matchers);
}

async function clickSaveInDialog(page) {
  return await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') || document;
    const btns = [...dialog.querySelectorAll('button')];
    const b = btns.find(el => (el.textContent || '').trim().toLowerCase() === 'save')
      || btns.find(el => (el.getAttribute('aria-label') || '').toLowerCase().includes('save'));
    if (b && !b.disabled) { b.click(); return true; }
    return false;
  });
}

async function dismissDiscard(page) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      const t = (b.textContent || '').trim().toLowerCase();
      if (t === 'discard' || t === 'no thanks') { b.click(); return; }
    }
  });
  await sleep(600);
}

async function updateHeadline(page) {
  console.log('\n[HEADLINE]');
  await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(rand(4000, 6000));

  let opened = false;
  let el = null;
  const candidates = ['Edit intro', 'Edit profile', 'Edit'];
  // First: if the intro pencil is a link, navigate to its overlay route directly.
  const introHref = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find(el => {
      const l = (el.getAttribute('aria-label') || '').trim();
      return (l === 'Edit' || l === 'Edit intro') && /edit\/forms\/intro|overlay/i.test(el.getAttribute('href') || '');
    });
    return a ? a.href : null;
  });
  if (introHref) {
    console.log('  Navigating to intro overlay:', introHref);
    await page.goto(introHref, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(rand(3500, 5000));
  }
  for (const name of candidates) {
    try {
      const alreadyOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
      const didClick = alreadyOpen ? true : await page.evaluate((name) => {
        const els = [...document.querySelectorAll('button, a')].filter(el => (el.getAttribute('aria-label') || '').trim() === name);
        // Prefer a visible element that sits in the top intro card (low y).
        const vis = els.filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        const target = vis.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || els[0];
        if (target) { target.scrollIntoView({ block: 'center' }); target.click(); return true; }
        return false;
      }, name);
      if (!didClick) continue;
      // Wait up to 8s for a dialog to appear.
      let hasDialog = false;
      for (let i = 0; i < 16; i++) { await sleep(500); hasDialog = await page.evaluate(() => !!document.querySelector('[role="dialog"]')); if (hasDialog) break; }
      if (!hasDialog) { console.log(`  "${name}" clicked but no dialog appeared.`); continue; }
      // Diagnostic: dump the opened dialog's fields.
      const fields = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return null;
        const heading = (dialog.querySelector('h1,h2,h3') || {}).textContent || '';
        const list = [...dialog.querySelectorAll('textarea, input, [contenteditable="true"], [role="textbox"]')].map(t => {
          const lbl = t.id ? document.querySelector(`label[for="${t.id}"]`) : null;
          const alById = t.getAttribute('aria-labelledby');
          const alText = alById ? (document.getElementById(alById.split(' ')[0]) || {}).textContent : '';
          return {
            tag: t.tagName, ce: t.getAttribute('contenteditable') || '', id: t.id || '',
            label: ((lbl && lbl.textContent) || t.getAttribute('aria-label') || alText || t.name || '').trim().substring(0, 40),
            val: (t.value || t.textContent || '').trim().substring(0, 40),
          };
        });
        return { heading: heading.trim(), list };
      });
      if (fields) console.log(`  [DIALOG "${name}"] heading="${fields.heading}" fields=${JSON.stringify(fields.list)}`);
      // Accept this dialog only if it exposes a Headline field.
      el = await page.evaluateHandle(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return null;
        const cands = [...dialog.querySelectorAll('textarea, input[type="text"], [contenteditable="true"], [role="textbox"]')];
        for (const t of cands) {
          const lbl = t.id ? document.querySelector(`label[for="${t.id}"]`) : null;
          const alById = t.getAttribute('aria-labelledby');
          const alText = alById ? (document.getElementById(alById.split(' ')[0]) || {}).textContent : '';
          const txt = ((lbl && lbl.textContent) || t.getAttribute('aria-label') || alText || t.name || t.id || '').toLowerCase();
          if (txt.includes('headline')) return t;
        }
        return null;
      }).then(h => h.asElement());
      if (el) { opened = true; console.log(`  Opened headline editor via "${name}".`); break; }
      await page.keyboard.press('Escape'); await sleep(800); await dismissDiscard(page);
    } catch {}
  }
  if (!opened) {
    // Last resort: dump edit buttons for diagnosis.
    const labels = await page.evaluate(() => [...document.querySelectorAll('button, a')].map(b => b.getAttribute('aria-label')).filter(l => l && l.toLowerCase().includes('edit')));
    console.log('  Still not found. Edit buttons:', JSON.stringify(labels));
    await snap(page, 'no-edit-intro'); return false;
  }
  await sleep(rand(1000, 2000));
  await snap(page, 'intro-modal');

  await el.click();
  await setFieldValue(page, el, HEADLINE);
  await sleep(rand(800, 1400));
  await snap(page, 'headline-filled');

  const saved = await clickSaveInDialog(page);
  if (!saved) { console.log('  Save not found for headline.'); await page.keyboard.press('Escape'); await dismissDiscard(page); return false; }
  console.log('  >>> HEADLINE SAVED <<<');
  await sleep(rand(2500, 4000));
  await snap(page, 'headline-saved');
  return true;
}

async function updateAbout(page) {
  console.log('\n[ABOUT]');
  await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(rand(4000, 6000));

  // Try the direct edit-about button (aria-label "Edit about" / "Edit summary").
  let opened = await clickButtonByLabel(page, ['edit', 'about']);
  if (!opened) opened = await clickButtonByLabel(page, ['edit', 'summary']);
  if (!opened) {
    // Fallback: scroll to the About section then click its pencil.
    await page.evaluate(() => {
      const h = [...document.querySelectorAll('h2, span')].find(e => (e.textContent || '').trim().toLowerCase() === 'about');
      if (h) h.scrollIntoView({ block: 'center' });
    });
    await sleep(1500);
    opened = await clickButtonByLabel(page, ['edit', 'about']);
  }
  if (!opened) { console.log('  Edit about button not found.'); await snap(page, 'no-edit-about'); return false; }
  await sleep(rand(3000, 4500));
  await snap(page, 'about-modal');

  const el = await findEditableInDialog(page, false);
  if (!el) { console.log('  About field not found.'); await snap(page, 'no-about-field'); await page.keyboard.press('Escape'); await dismissDiscard(page); return false; }

  await el.click();
  await setFieldValue(page, el, ABOUT);
  await sleep(rand(800, 1400));
  await snap(page, 'about-filled');

  const saved = await clickSaveInDialog(page);
  if (!saved) { console.log('  Save not found for about.'); await page.keyboard.press('Escape'); await dismissDiscard(page); return false; }
  console.log('  >>> ABOUT SAVED <<<');
  await sleep(rand(2500, 4000));
  await snap(page, 'about-saved');
  return true;
}

async function main() {
  console.log('=== LinkedIn — Update Headline + About ===\n');

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
    console.log('  OK!');

    const h = await updateHeadline(page);
    const a = await updateAbout(page);

    console.log('\n=== DONE ===');
    console.log('Headline:', h ? 'updated' : 'FAILED');
    console.log('About   :', a ? 'updated' : 'FAILED');
  } catch (e) {
    console.error('FATAL:', e);
  } finally {
    await sleep(2000);
    await context.close();
  }
}

main();
