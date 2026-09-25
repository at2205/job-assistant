const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const EMAIL = 'tomar.aryan16j@gmail.com';
const PASSWORD = 'Luck@16072002';
const HEADLINE = 'Backend Engineer | Java + Spring Boot | Building AI-Powered Career Automation Platform';
const ABOUT = `I build backend systems and full-stack products — then wire AI into them to make them smarter.

Right now, I'm building JobFlow AI: a career automation platform that scrapes jobs, scores them with ATS analysis, generates tailored resumes using Groq AI, and manages the entire application pipeline. The stack: Express + TypeScript backend, PostgreSQL on Supabase, Groq LLM integration, Playwright browser automation, and a Next.js dashboard.

Before that, I built ConnectVerse (a real-time social platform with WebRTC video calling), mSwasth (a healthcare portal managing 500+ patient records), FindiInsure (an insurance marketplace with multi-role access), and an AEPS Agent Onboarding System with AES-256 encryption for fintech biometric workflows.

My core stack:
→ Backend: Java, Spring Boot, REST APIs, Microservices, PostgreSQL
→ Frontend: React.js, Next.js, TypeScript, Tailwind CSS
→ AI/Automation: Groq AI, LLM integration, Playwright, Puppeteer
→ Infrastructure: Docker, Supabase, JWT Auth, WebSocket

What I'm good at:
• Taking a product from idea → architecture → working system, fast
• Designing clean REST APIs and database schemas
• Integrating AI/LLMs into real workflows (not toy demos)
• Building automation that replaces manual processes

I don't just use AI tools — I build systems that orchestrate them.

Open to backend, full-stack, or product engineering roles where I can build things that matter.`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);
let snapN = 0;
async function snap(page, label) { snapN++; const f = `v6-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

async function main() {
  console.log('=== LinkedIn Profile Updater v6 ===\n');

  const userDataDir = path.resolve(__dirname, 'sessions', 'li-persistent');
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

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
    // ===== LOGIN =====
    console.log('[LOGIN]');
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(rand(3000, 5000));
    let url = page.url();
    if (url.includes('/login') || url.includes('/authwall') || url.includes('/checkpoint')) {
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000);
      try { const cb = await page.$('button[action-type="ACCEPT"]'); if (cb) await cb.click(); } catch(e) {}
      const emailEl = await page.$('#username');
      if (emailEl) { await emailEl.click(); await sleep(300); for (const ch of EMAIL) { await page.keyboard.type(ch, { delay: rand(40, 100) }); } }
      await sleep(rand(500, 800));
      const passEl = await page.$('#password');
      if (passEl) { await passEl.click(); await sleep(300); for (const ch of PASSWORD) { await page.keyboard.type(ch, { delay: rand(40, 100) }); } }
      await sleep(rand(600, 1200));
      const sub = await page.$('button[type="submit"]'); if (sub) await sub.click();
      await sleep(rand(6000, 10000));
      url = page.url();
      if (!url.includes('/feed') && !url.includes('/in/') && !url.includes('/mynetwork')) {
        console.log('  Security checkpoint — waiting 5 min...');
        const dl = Date.now() + 300000;
        while (Date.now() < dl) { await sleep(3000); url = page.url(); if (url.includes('/feed') || url.includes('/in/')) break; }
      }
      if (url.includes('/feed') || url.includes('/in/') || url.includes('/mynetwork')) console.log('  Logged in!');
      else { console.log('  FAILED: ' + url); await context.close(); return; }
    } else {
      console.log('  Session active!');
    }

    // ===== PROFILE =====
    console.log('\n[PROFILE]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 7000));
    await snap(page, 'before');

    // ===== FULL BUTTON AUDIT =====
    console.log('\n[AUDIT] Complete button scan...');
    const allBtnInfo = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).map((b, i) => {
        const r = b.getBoundingClientRect();
        return {
          idx: i,
          label: b.getAttribute('aria-label') || '',
          text: b.textContent.trim().substring(0, 50),
          x: Math.round(r.x), y: Math.round(r.y),
          w: Math.round(r.width), h: Math.round(r.height),
          visible: r.width > 0 && r.height > 0,
        };
      }).filter(b => b.visible);
    });

    // Find the pencil icon between banner (~y100) and name (~y390)
    // The intro edit pencil is around y=300-350 area from screenshot
    const candidateBtns = allBtnInfo.filter(b =>
      b.y >= 280 && b.y <= 400 &&
      (b.label.toLowerCase().includes('edit') || b.label === '' || b.w < 50)
    );

    console.log('  Candidate intro edit buttons (y 280-400):');
    candidateBtns.forEach(b => {
      console.log(`    [${b.idx}] label="${b.label}" text="${b.text}" at (${b.x},${b.y}) ${b.w}x${b.h}`);
    });

    // Also show all buttons with "edit" in label
    const editLabelBtns = allBtnInfo.filter(b => b.label.toLowerCase().includes('edit'));
    console.log('  All "edit" labeled buttons:');
    editLabelBtns.forEach(b => {
      console.log(`    [${b.idx}] "${b.label}" at (${b.x},${b.y})`);
    });

    // ===== CLICK INTRO EDIT =====
    console.log('\n[HEADLINE] Opening intro editor...');

    // Strategy 1: Click the pencil icon at the known visual position
    // From the BEFORE screenshot, the pencil is at approximately (866, 315) in the 1366x768 viewport
    // In the v5 audit, the only "Edit" not-background button was at (459, 544) which was wrong
    // The real intro edit button might not have "edit" in its label!

    // Let's look for the small pencil-sized button in the y=280-350 range
    let introClicked = false;

    // Check the candidates
    if (candidateBtns.length > 0) {
      // Click the rightmost one (pencil icons are usually on the right side)
      const rightmost = candidateBtns.sort((a, b) => b.x - a.x)[0];
      console.log(`  Clicking candidate button [${rightmost.idx}] at (${rightmost.x},${rightmost.y})`);

      const btn = (await page.$$('button'))[rightmost.idx];
      if (btn) {
        await btn.scrollIntoViewIfNeeded();
        await sleep(500);
        await btn.click({ force: true });
        introClicked = true;
      }
    }

    if (!introClicked) {
      // Strategy 2: Direct coordinate click on the pencil icon position
      // From BEFORE screenshot at 1366x768 viewport, pencil is at roughly:
      // x=866*(1366/1366)=~613(scaled?) or actual position
      // Actually let me just use the raw coordinates from the screenshot
      console.log('  Trying coordinate-based click at (866, 315) area...');

      // First let me scan what's at that position
      const elementAtPos = await page.evaluate(() => {
        // Check elements around the intro edit pencil area
        // In 1366x768 viewport, the pencil is at roughly x=610, y=225 (scaled from 1920x1080 screenshots)
        const positions = [
          { x: 610, y: 225 },  // scaled from 866/1366 viewport
          { x: 620, y: 225 },
          { x: 600, y: 220 },
          { x: 615, y: 230 },
        ];

        const results = [];
        for (const pos of positions) {
          const el = document.elementFromPoint(pos.x, pos.y);
          if (el) {
            results.push({
              x: pos.x, y: pos.y,
              tag: el.tagName,
              label: el.getAttribute('aria-label') || '',
              text: el.textContent.trim().substring(0, 30),
              isButton: el.tagName === 'BUTTON' || el.closest('button') !== null,
            });
          }
        }
        return results;
      });

      console.log('  Elements at pencil area:');
      elementAtPos.forEach(e => console.log(`    (${e.x},${e.y}): <${e.tag}> label="${e.label}" button=${e.isButton}`));

      // Click at the pencil position
      await page.mouse.click(613, 225);
      await sleep(1000);

      // Check if a dropdown or modal appeared
      const afterClick = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('[role="dialog"]');
        const modals = document.querySelectorAll('.artdeco-modal');
        return { dialogs: dialogs.length, modals: modals.length };
      });

      if (afterClick.dialogs > 0 || afterClick.modals > 0) {
        introClicked = true;
        console.log('  Modal opened!');
      } else {
        // The pencil might be an SVG icon inside a button - try clicking nearby
        console.log('  No modal. Trying broader search...');

        // Find ALL clickable elements in the intro card area
        const introArea = await page.evaluate(() => {
          // The intro card is roughly the area with the name, headline, location
          const h1 = document.querySelector('h1');
          if (!h1) return [];

          // Go up to find the card container
          let card = h1;
          for (let i = 0; i < 10; i++) {
            card = card.parentElement;
            if (!card) break;
            if (card.querySelector('[aria-label]') && card.querySelectorAll('button').length > 1) break;
          }

          if (!card) return [];

          return Array.from(card.querySelectorAll('button, [role="button"], a')).map(el => {
            const r = el.getBoundingClientRect();
            return {
              tag: el.tagName,
              label: el.getAttribute('aria-label') || '',
              text: el.textContent.trim().substring(0, 40),
              href: el.href || '',
              x: Math.round(r.x), y: Math.round(r.y),
              w: Math.round(r.width), h: Math.round(r.height),
            };
          }).filter(e => e.w > 0);
        });

        console.log('  Clickable elements in intro card:');
        introArea.forEach(e => console.log(`    <${e.tag}> "${e.label || e.text}" at (${e.x},${e.y}) ${e.w}x${e.h}`));
      }
    }

    await sleep(rand(3000, 5000));
    await snap(page, 'after-intro-attempt');

    // Check if modal opened
    const hasModal = await page.evaluate(() => {
      return document.querySelectorAll('[role="dialog"]').length > 0 || document.querySelectorAll('.artdeco-modal').length > 0;
    });

    if (hasModal) {
      console.log('  MODAL IS OPEN! Scanning fields...');

      // Enumerate all form fields in the modal
      const fields = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"], .artdeco-modal');
        if (!modal) return [];
        return Array.from(modal.querySelectorAll('input, textarea, select, [contenteditable="true"]')).map(el => {
          const r = el.getBoundingClientRect();
          if (r.width < 10) return null;

          // Find label
          let labelText = '';
          const id = el.id;
          if (id) { const lbl = document.querySelector(`label[for="${id}"]`); if (lbl) labelText = lbl.textContent.trim(); }
          if (!labelText) {
            let p = el.parentElement;
            for (let i = 0; i < 5 && p; i++) {
              const lbl = p.querySelector('label');
              if (lbl && lbl !== el) { labelText = lbl.textContent.trim(); break; }
              p = p.parentElement;
            }
          }

          return {
            tag: el.tagName.toLowerCase(),
            id: el.id,
            type: el.type || '',
            label: labelText,
            ariaLabel: el.getAttribute('aria-label') || '',
            value: (el.value || el.textContent || '').substring(0, 60),
          };
        }).filter(Boolean);
      });

      console.log('  Form fields:');
      fields.forEach((f, i) => console.log(`    [${i}] <${f.tag}> id="${f.id}" label="${f.label}" ariaLabel="${f.ariaLabel}" val="${f.value}"`));

      // Fill headline
      let headlineFilled = false;
      for (const f of fields) {
        if (f.label.toLowerCase().includes('headline') || f.ariaLabel.toLowerCase().includes('headline') || f.id.toLowerCase().includes('headline')) {
          const sel = f.id ? `[id="${f.id}"]` : `[aria-label="${f.ariaLabel}"]`;
          const el = await page.$(sel);
          if (el) {
            await el.click({ clickCount: 3 }); await sleep(200);
            await el.fill(HEADLINE);
            headlineFilled = true;
            console.log('  >>> HEADLINE FILLED! <<<');
          }
          break;
        }
      }

      if (!headlineFilled) {
        try {
          await page.getByLabel(/headline/i).fill(HEADLINE);
          headlineFilled = true;
          console.log('  >>> HEADLINE FILLED via getByLabel! <<<');
        } catch(e) { console.log('  getByLabel failed: ' + e.message.substring(0, 80)); }
      }

      if (headlineFilled) {
        await sleep(rand(1000, 2000));
        try { await page.getByRole('button', { name: /save/i }).click(); console.log('  >>> HEADLINE SAVED! <<<'); }
        catch(e) {
          const btns = await page.$$('button');
          for (const b of btns) { if ((await b.textContent() || '').trim().toLowerCase() === 'save') { await b.click(); console.log('  Saved!'); break; } }
        }
        await sleep(rand(3000, 5000));
      }
    } else {
      console.log('  No modal opened. Need different approach.');
      console.log('  Attempting to find pencil via SVG/icon scan...');

      // Scan specifically for SVG pencil icons
      const svgButtons = await page.evaluate(() => {
        const svgs = document.querySelectorAll('svg, li-icon');
        return Array.from(svgs).map(svg => {
          const btn = svg.closest('button');
          if (!btn) return null;
          const r = btn.getBoundingClientRect();
          if (r.width < 5 || r.height < 5) return null;
          const iconType = svg.getAttribute('type') || svg.getAttribute('data-test-icon') || '';
          return {
            iconType,
            label: btn.getAttribute('aria-label') || '',
            x: Math.round(r.x), y: Math.round(r.y),
            w: Math.round(r.width), h: Math.round(r.height),
          };
        }).filter(Boolean);
      });

      console.log('  SVG/icon buttons:');
      svgButtons.forEach(b => console.log(`    icon="${b.iconType}" label="${b.label}" at (${b.x},${b.y}) ${b.w}x${b.h}`));

      // Find the edit-medium icon that's in the intro area
      const introPencil = svgButtons.find(b =>
        (b.iconType.includes('edit') || b.label.toLowerCase() === 'edit intro') &&
        b.y >= 200 && b.y <= 400 &&
        !b.label.toLowerCase().includes('background') &&
        !b.label.toLowerCase().includes('cover')
      );

      if (introPencil) {
        console.log(`  Found intro pencil: "${introPencil.label}" at (${introPencil.x},${introPencil.y})`);
        await page.mouse.click(introPencil.x + introPencil.w / 2, introPencil.y + introPencil.h / 2);
        await sleep(rand(3000, 5000));
        await snap(page, 'pencil-click-retry');
      }
    }

    // ===== ABOUT SECTION =====
    console.log('\n[ABOUT] Handling About section...');

    // Close any open modal first
    try { const d = await page.$('button[aria-label="Dismiss"], button[aria-label="Close"]'); if (d) await d.click(); } catch(e) {}
    await sleep(1000);

    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(4000, 6000));

    // Click "Add section" using text matching
    console.log('  Looking for "Add section" button...');
    const addSectionBtns = await page.$$('button');
    let addSectionClicked = false;
    for (const btn of addSectionBtns) {
      const text = (await btn.textContent() || '').trim();
      if (text === 'Add section' || text === 'Add profile section') {
        const box = await btn.boundingBox();
        if (box && box.width > 0) {
          await btn.scrollIntoViewIfNeeded();
          await sleep(500);
          await btn.click({ force: true });
          addSectionClicked = true;
          console.log('  Clicked "Add section"!');
          break;
        }
      }
    }

    if (addSectionClicked) {
      await sleep(rand(2000, 3000));
      await snap(page, 'add-section-menu');

      // Look for "About" or "Summary" in whatever appeared
      // LinkedIn might show a dropdown or a side panel
      const menuItems = await page.evaluate(() => {
        // Check for dropdown, modal, or list items
        const items = document.querySelectorAll('[role="menuitem"], [role="option"], [role="listbox"] li, .artdeco-dropdown__item, .pvs-profile-actions__item');
        return Array.from(items).map(i => ({
          text: i.textContent.trim().substring(0, 60),
          tag: i.tagName,
        }));
      });

      console.log('  Menu items:');
      menuItems.forEach(i => console.log(`    "${i.text}"`));

      // Try clicking About
      let aboutClicked = false;

      // Method: click elements containing just "About" text
      const clickTargets = await page.$$('button, a, li, [role="menuitem"], [role="option"], span');
      for (const target of clickTargets) {
        const text = (await target.textContent() || '').trim();
        if (text === 'About' || text === 'Summary') {
          const box = await target.boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            await target.click();
            aboutClicked = true;
            console.log(`  Clicked "${text}" menu item`);
            break;
          }
        }
      }

      if (!aboutClicked) {
        // Maybe need to expand "Core" section first
        for (const target of clickTargets) {
          const text = (await target.textContent() || '').trim();
          if (text.includes('Core') || text.includes('Intro')) {
            const box = await target.boundingBox();
            if (box && box.width > 0) {
              await target.click();
              console.log('  Expanded "' + text + '" section');
              await sleep(1500);
              // Now try to find About
              for (const t2 of await page.$$('button, a, li, [role="menuitem"], span')) {
                const t2text = (await t2.textContent() || '').trim();
                if (t2text === 'About' || t2text === 'Summary') {
                  const b2 = await t2.boundingBox();
                  if (b2 && b2.width > 0) { await t2.click(); aboutClicked = true; console.log('  Clicked About'); break; }
                }
              }
              break;
            }
          }
        }
      }

      await sleep(rand(3000, 5000));
      await snap(page, 'about-form');

      // Fill about
      if (aboutClicked) {
        let aboutFilled = false;

        // Method 1: textarea
        const ta = await page.$('textarea:visible');
        if (ta) {
          await ta.click();
          await page.keyboard.down('Control');
          await page.keyboard.press('a');
          await page.keyboard.up('Control');
          await sleep(200);
          await ta.fill(ABOUT);
          aboutFilled = true;
          console.log('  >>> ABOUT FILLED (textarea)! <<<');
        }

        // Method 2: textbox role
        if (!aboutFilled) {
          try {
            const tb = page.getByRole('textbox');
            const cnt = await tb.count();
            if (cnt > 0) {
              await tb.first().click();
              await page.keyboard.down('Control');
              await page.keyboard.press('a');
              await page.keyboard.up('Control');
              await sleep(200);
              await tb.first().fill(ABOUT);
              aboutFilled = true;
              console.log('  >>> ABOUT FILLED (textbox role)! <<<');
            }
          } catch(e) {}
        }

        // Method 3: contenteditable
        if (!aboutFilled) {
          const ce = await page.$('[contenteditable="true"]:visible');
          if (ce) {
            await ce.click();
            await page.keyboard.down('Control');
            await page.keyboard.press('a');
            await page.keyboard.up('Control');
            await sleep(200);
            await page.keyboard.press('Delete');
            await page.keyboard.type(ABOUT, { delay: 1 });
            aboutFilled = true;
            console.log('  >>> ABOUT FILLED (contenteditable)! <<<');
          }
        }

        if (aboutFilled) {
          await sleep(rand(1000, 2000));
          // Save
          const saveBtns = await page.$$('button');
          for (const btn of saveBtns) {
            const text = (await btn.textContent() || '').trim().toLowerCase();
            if (text === 'save') {
              const box = await btn.boundingBox();
              if (box && box.width > 0) { await btn.click(); console.log('  >>> ABOUT SAVED! <<<'); break; }
            }
          }
          await sleep(rand(3000, 5000));
        }
      }
    } else {
      console.log('  "Add section" button not found in page');
    }

    // ===== FINAL =====
    console.log('\n[FINAL]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 8000));
    await snap(page, 'FINAL');

    await page.evaluate(() => window.scrollTo(0, 400));
    await sleep(1500);
    await snap(page, 'FINAL-scroll');

    console.log('\n  Browser open 90s for review...');
    await sleep(90000);

  } catch (err) {
    console.error('\n[FATAL] ' + err.message);
    await snap(page, 'fatal');
  } finally {
    await context.close();
    console.log('[DONE]');
  }
}

main();
