const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

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
async function snap(page, label) { snapN++; const f = `v7-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

async function main() {
  console.log('=== LinkedIn Profile Updater v7 ===');
  console.log('=== Hover + Precise Click Edition ===\n');

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
    // Login check
    console.log('[LOGIN]');
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(rand(3000, 5000));
    const url = page.url();
    if (url.includes('/login') || url.includes('/authwall')) {
      console.log('  Need login. Exiting — use v5/v6 to login first.');
      await context.close(); return;
    }
    console.log('  Logged in!');

    // Profile
    console.log('\n[PROFILE]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 7000));
    await snap(page, 'loaded');

    // ============================================================
    // STEP 1: FIND THE INTRO EDIT BUTTON
    // The pencil icon between the banner and name is likely rendered
    // as a SIBLING of the banner, not inside a <button>.
    // It may be an <a> tag or rendered on hover.
    // Let's hover over the intro area to expose it.
    // ============================================================
    console.log('\n[HEADLINE] Step 1: Hover over intro area...');

    // Hover over the name to expose edit affordances
    const nameEl = await page.$('h1');
    if (nameEl) {
      const nameBox = await nameEl.boundingBox();
      if (nameBox) {
        console.log(`  Name at: (${nameBox.x}, ${nameBox.y}) ${nameBox.width}x${nameBox.height}`);
        // Hover near the name
        await page.mouse.move(nameBox.x + nameBox.width + 20, nameBox.y + nameBox.height / 2, { steps: 10 });
        await sleep(2000);

        // Check for newly revealed buttons
        const newBtns = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('button, a, [role="button"]')).map(el => {
            const r = el.getBoundingClientRect();
            if (r.width < 5 || r.y < 200 || r.y > 500) return null;
            return {
              tag: el.tagName,
              label: el.getAttribute('aria-label') || '',
              text: el.textContent.trim().substring(0, 40),
              x: Math.round(r.x), y: Math.round(r.y),
              w: Math.round(r.width), h: Math.round(r.height),
              href: el.getAttribute('href') || '',
            };
          }).filter(Boolean);
        });
        console.log('  Visible clickable elements after hover:');
        newBtns.forEach(b => console.log(`    <${b.tag}> "${b.label || b.text}" at (${b.x},${b.y}) ${b.w}x${b.h} href="${b.href}"`));
      }
    }

    // ============================================================
    // STEP 2: Try clicking the pencil icon area directly
    // The icon at ~(866, 315) in screenshots is between banner bottom
    // (y ~275) and name (y ~385)
    // In 1366x768 viewport this translates to approximately (613, 223)
    // But v6 showed <IMG> there. Let's check exact position.
    // ============================================================
    console.log('\n[HEADLINE] Step 2: Precise pencil scan...');

    // Scan a GRID of positions in the area between banner and name
    const gridScan = await page.evaluate(() => {
      const results = [];
      // Scan from x=550 to x=900, y=270 to y=340 in steps of 10
      for (let y = 270; y <= 340; y += 10) {
        for (let x = 550; x <= 900; x += 20) {
          const el = document.elementFromPoint(x, y);
          if (el) {
            const tag = el.tagName;
            const label = el.getAttribute('aria-label') || '';
            const isClickable = tag === 'BUTTON' || tag === 'A' || el.closest('button') || el.closest('a');
            if (isClickable) {
              results.push({ x, y, tag, label, text: el.textContent?.trim().substring(0, 30) });
            }
          }
        }
      }
      return results;
    });

    if (gridScan.length > 0) {
      console.log('  Found clickable elements in grid:');
      gridScan.forEach(g => console.log(`    (${g.x},${g.y}) <${g.tag}> "${g.label}"`));
      // Click the first one
      await page.mouse.click(gridScan[0].x, gridScan[0].y);
      await sleep(3000);
      await snap(page, 'grid-click');
    } else {
      console.log('  No clickable elements in grid area.');
    }

    // ============================================================
    // STEP 3: CLICK THE NAME DIRECTLY
    // On LinkedIn, clicking your own name sometimes opens edit mode
    // ============================================================
    console.log('\n[HEADLINE] Step 3: Click on name text...');
    if (nameEl) {
      await nameEl.click();
      await sleep(2000);

      const hasModal = await page.$('[role="dialog"]');
      if (hasModal) {
        console.log('  Modal opened from name click!');
      } else {
        console.log('  No modal from name click.');
      }
    }

    // ============================================================
    // STEP 4: Use Enhance Profile or find edit via LinkedIn's UI
    // The "Enhance profile" button might lead to editing options
    // ============================================================
    console.log('\n[HEADLINE] Step 4: Try "Enhance profile" button...');

    // First, let's check ALL button text content including inner elements
    const allBtnTexts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).map(b => {
        const r = b.getBoundingClientRect();
        if (r.width < 10) return null;
        // Get ALL text including child spans
        const spans = Array.from(b.querySelectorAll('span'));
        const fullText = spans.map(s => s.textContent.trim()).join(' ') || b.textContent.trim();
        return {
          text: fullText.substring(0, 60),
          innerText: b.innerText?.trim().substring(0, 60),
          x: Math.round(r.x), y: Math.round(r.y),
        };
      }).filter(Boolean);
    });

    console.log('  All button texts:');
    allBtnTexts.filter(b => b.y >= 460 && b.y <= 520).forEach(b => {
      console.log(`    "${b.text}" innerText="${b.innerText}" at (${b.x},${b.y})`);
    });

    // Find "Add section" — it might have nested spans
    let addSectionBtn = null;
    const allBtns = await page.$$('button');
    for (const btn of allBtns) {
      const innerText = await btn.innerText().catch(() => '');
      if (innerText.includes('Add section') || innerText.includes('Add profile section')) {
        addSectionBtn = btn;
        break;
      }
    }

    if (!addSectionBtn) {
      // Try using locator
      try {
        addSectionBtn = page.locator('button', { hasText: 'Add section' }).first();
        const cnt = await addSectionBtn.count();
        if (cnt === 0) addSectionBtn = null;
      } catch(e) { addSectionBtn = null; }
    }

    // ============================================================
    // STEP 5: Use "Add section" -> "Intro" to add headline
    // LinkedIn's "Add section" dropdown includes "Intro" which
    // lets you edit name, headline, etc.
    // ============================================================
    console.log('\n[HEADLINE] Step 5: Using "Add section" dropdown...');

    if (addSectionBtn) {
      await addSectionBtn.scrollIntoViewIfNeeded();
      await sleep(500);
      if (typeof addSectionBtn.click === 'function') {
        await addSectionBtn.click({ force: true, timeout: 5000 });
      } else {
        // It's a Locator
        await addSectionBtn.click({ force: true, timeout: 5000 });
      }
      console.log('  Clicked "Add section"');
      await sleep(rand(2000, 3000));
      await snap(page, 'add-section-opened');

      // Get all visible items
      const afterAddBtn = await page.evaluate(() => {
        const items = [];
        // Check different types of menus/dropdowns
        document.querySelectorAll('li, [role="menuitem"], [role="option"], .artdeco-dropdown__item, button, a, span').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width < 10 || r.height < 10) return;
          const text = el.textContent.trim();
          // Only items visible in viewport
          if (r.y > 0 && r.y < window.innerHeight && text.length > 0 && text.length < 100) {
            items.push({ text: text.substring(0, 60), tag: el.tagName, x: Math.round(r.x), y: Math.round(r.y) });
          }
        });
        // Dedup by text
        const seen = new Set();
        return items.filter(i => {
          if (seen.has(i.text)) return false;
          seen.add(i.text);
          return true;
        });
      });

      console.log('  Visible items after Add section click:');
      afterAddBtn.slice(0, 30).forEach(i => console.log(`    "${i.text}" <${i.tag}> at y=${i.y}`));

      // Look for "Intro" or "About" in items
      const targets = ['Intro', 'About', 'Summary', 'Add intro', 'Edit intro'];
      for (const target of targets) {
        try {
          const loc = page.locator(`text="${target}"`).first();
          const cnt = await loc.count();
          if (cnt > 0) {
            const box = await loc.boundingBox();
            if (box) {
              await loc.click();
              console.log(`  >>> Clicked "${target}" <<<`);
              await sleep(rand(3000, 5000));
              await snap(page, `clicked-${target.toLowerCase()}`);

              // Check if we got a modal with headline field
              const modalFields = await page.evaluate(() => {
                const modal = document.querySelector('[role="dialog"]');
                if (!modal) return null;
                const heading = modal.querySelector('h2, h1')?.textContent?.trim() || '';
                const fields = Array.from(modal.querySelectorAll('input, textarea')).filter(e => {
                  const r = e.getBoundingClientRect();
                  return r.width > 50;
                }).map(e => {
                  let label = '';
                  if (e.id) { const l = document.querySelector(`label[for="${e.id}"]`); if (l) label = l.textContent.trim(); }
                  return { tag: e.tagName, id: e.id, label, value: (e.value || '').substring(0, 60), type: e.type || '' };
                });
                return { heading, fields };
              });

              if (modalFields) {
                console.log(`  Modal: "${modalFields.heading}"`);
                modalFields.fields.forEach((f, i) => console.log(`    [${i}] <${f.tag}> id="${f.id}" label="${f.label}" val="${f.value}"`));

                // Fill headline
                for (const f of modalFields.fields) {
                  if (f.label.toLowerCase().includes('headline') || f.id.toLowerCase().includes('headline')) {
                    const el = await page.$(`[id="${f.id}"]`);
                    if (el) {
                      await el.click({ clickCount: 3 }); await sleep(200); await el.fill(HEADLINE);
                      console.log('  >>> HEADLINE SET <<<');
                    }
                    break;
                  }
                }

                // Try getByLabel fallback
                try { await page.getByLabel(/headline/i).fill(HEADLINE); console.log('  >>> HEADLINE SET via getByLabel <<<'); } catch(e) {}

                // Save
                await sleep(rand(1000, 2000));
                try { await page.getByRole('button', { name: /save/i }).click(); console.log('  >>> SAVED <<<'); }
                catch(e) { for (const b of await page.$$('button')) { if ((await b.textContent() || '').trim() === 'Save') { await b.click(); break; } } }
                await sleep(rand(3000, 5000));
              }
              break;  // Done with this target
            }
          }
        } catch(e) {}
      }

      // Now try About
      console.log('\n  Looking for "About" in Add section...');
      // Need to reopen Add section
      await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(rand(4000, 6000));

      // Click Add section again
      const addBtn2 = page.locator('button', { hasText: 'Add section' }).first();
      try {
        await addBtn2.click({ force: true, timeout: 5000 });
        console.log('  Re-opened Add section');
        await sleep(rand(2000, 3000));

        // Click About
        try {
          await page.locator('text="About"').first().click();
          console.log('  >>> Clicked "About" <<<');
          await sleep(rand(3000, 5000));
          await snap(page, 'about-form');

          // Fill About
          let aboutDone = false;
          const ta = await page.$('textarea:visible');
          if (ta) { await ta.click(); await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control'); await sleep(200); await ta.fill(ABOUT); aboutDone = true; console.log('  >>> ABOUT FILLED <<<'); }
          if (!aboutDone) { try { await page.getByRole('textbox').first().fill(ABOUT); aboutDone = true; console.log('  >>> ABOUT FILLED via textbox <<<'); } catch(e) {} }
          if (!aboutDone) { const ce = await page.$('[contenteditable="true"]:visible'); if (ce) { await ce.click(); await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control'); await page.keyboard.press('Delete'); await page.keyboard.type(ABOUT, { delay: 1 }); aboutDone = true; console.log('  >>> ABOUT FILLED via CE <<<'); } }

          if (aboutDone) {
            await sleep(rand(1000, 2000));
            try { await page.getByRole('button', { name: /save/i }).click(); console.log('  >>> ABOUT SAVED <<<'); }
            catch(e) { for (const b of await page.$$('button')) { if ((await b.textContent() || '').trim() === 'Save') { await b.click(); break; } } }
            await sleep(rand(3000, 5000));
          }
        } catch(e) { console.log('  "About" not found: ' + e.message.substring(0, 80)); }
      } catch(e) { console.log('  Add section reopen failed: ' + e.message.substring(0, 80)); }
    } else {
      console.log('  "Add section" button not found — skipping.');
    }

    // ===== FINAL =====
    console.log('\n[FINAL]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 8000));
    await snap(page, 'FINAL');
    await page.evaluate(() => window.scrollTo(0, 400));
    await sleep(1500);
    await snap(page, 'FINAL-scroll');

    console.log('\n  Browser open 90s...');
    await sleep(90000);

  } catch (err) {
    console.error('[FATAL] ' + err.message);
    await snap(page, 'fatal');
  } finally {
    await context.close();
    console.log('[DONE]');
  }
}

main();
