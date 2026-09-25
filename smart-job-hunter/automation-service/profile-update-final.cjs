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
async function snap(page, label) { snapN++; const f = `FINAL-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

async function main() {
  console.log('=== LinkedIn Profile Updater — FINAL VERSION ===\n');

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
    // Login
    console.log('[LOGIN]');
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(rand(3000, 5000));
    if (page.url().includes('/login') || page.url().includes('/authwall')) {
      console.log('  Not logged in. Run v5 first.'); await context.close(); return;
    }
    console.log('  OK!');

    // Profile
    console.log('\n[PROFILE]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 7000));
    await snap(page, 'BEFORE');

    // ============================================================
    // HEADLINE: Click pencil at ~(850,290) to open Edit Intro
    // We know from v7/v8 this WORKS and opens the modal.
    // The modal does NOT have role="dialog" — detect by heading text.
    // ============================================================
    console.log('\n[HEADLINE] Opening Edit Intro modal...');
    await page.mouse.click(850, 290);
    await sleep(rand(4000, 6000));
    await snap(page, 'after-pencil-click');

    // Detect modal by searching for "Edit intro" heading text
    const editIntroVisible = await page.evaluate(() => {
      const headings = document.querySelectorAll('h1, h2, h3, [class*="header"], [class*="title"]');
      for (const h of headings) {
        if (h.textContent.trim().toLowerCase().includes('edit intro')) return true;
      }
      // Also check for the modal overlay
      const overlays = document.querySelectorAll('.artdeco-modal-overlay, [class*="overlay"]');
      if (overlays.length > 0) return true;
      // Check for "First name" field which only appears in edit intro
      const labels = document.querySelectorAll('label');
      for (const l of labels) { if (l.textContent.trim().includes('First name')) return true; }
      return false;
    });

    console.log('  Edit Intro modal visible: ' + editIntroVisible);

    if (editIntroVisible) {
      console.log('  MODAL OPENED! Scanning all form fields...');

      // Enumerate ALL form fields on the entire page (modal might not be in a dialog container)
      const allFields = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input, textarea, select')).map(el => {
          const r = el.getBoundingClientRect();
          if (r.width < 30) return null;

          // Find label
          let label = '';
          const id = el.id;
          if (id) { const lbl = document.querySelector(`label[for="${id}"]`); if (lbl) label = lbl.textContent.trim(); }
          if (!label) {
            let p = el.parentElement;
            for (let i = 0; i < 8 && p && !label; i++) {
              const lbl = p.querySelector('label');
              if (lbl) label = lbl.textContent.trim();
              p = p.parentElement;
            }
          }

          return {
            tag: el.tagName.toLowerCase(),
            id: el.id,
            type: el.type || '',
            label,
            value: (el.value || '').substring(0, 80),
            x: Math.round(r.x), y: Math.round(r.y),
            w: Math.round(r.width),
          };
        }).filter(Boolean);
      });

      console.log('  Form fields found:');
      allFields.forEach((f, i) => {
        console.log(`    [${i}] <${f.tag}> label="${f.label}" id="${f.id}" val="${f.value}" at y=${f.y}`);
      });

      // Find headline field
      let headlineField = allFields.find(f => f.label.toLowerCase().includes('headline'));

      if (!headlineField) {
        // Scroll modal down to reveal more fields
        console.log('  Headline not visible — scrolling modal...');
        await page.evaluate(() => {
          // Find the scrollable container
          const containers = document.querySelectorAll('[class*="modal"], [class*="overflow"], [style*="overflow"]');
          for (const c of containers) {
            if (c.scrollHeight > c.clientHeight) {
              c.scrollTop += 400;
              return;
            }
          }
          // Fallback: scroll any large div
          document.querySelectorAll('div').forEach(d => {
            const r = d.getBoundingClientRect();
            if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
              d.scrollTop += 400;
            }
          });
        });
        await sleep(2000);
        await snap(page, 'modal-scrolled');

        // Re-scan fields
        const moreFields = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('input, textarea, select')).map(el => {
            const r = el.getBoundingClientRect();
            if (r.width < 30) return null;
            let label = '';
            const id = el.id;
            if (id) { const lbl = document.querySelector(`label[for="${id}"]`); if (lbl) label = lbl.textContent.trim(); }
            if (!label) { let p = el.parentElement; for (let i = 0; i < 8 && p && !label; i++) { const lbl = p.querySelector('label'); if (lbl) label = lbl.textContent.trim(); p = p.parentElement; } }
            return { tag: el.tagName.toLowerCase(), id: el.id, label, value: (el.value || '').substring(0, 80), y: Math.round(r.y) };
          }).filter(Boolean);
        });

        console.log('  Fields after scroll:');
        moreFields.forEach((f, i) => console.log(`    [${i}] label="${f.label}" id="${f.id}" val="${f.value}" y=${f.y}`));

        headlineField = moreFields.find(f => f.label.toLowerCase().includes('headline'));
      }

      if (headlineField) {
        console.log(`\n  >>> Found Headline field: id="${headlineField.id}" current="${headlineField.value}" <<<`);

        // Fill headline using Playwright native
        const inp = await page.$(`[id="${headlineField.id}"]`);
        if (inp) {
          await inp.scrollIntoViewIfNeeded();
          await sleep(500);
          await inp.click({ clickCount: 3 });
          await sleep(300);
          await inp.fill('');
          await sleep(200);
          await inp.fill(HEADLINE);
          console.log('  >>> HEADLINE UPDATED TO: "' + HEADLINE + '" <<<');
          await sleep(1000);
          await snap(page, 'headline-filled');

          // Click Save
          console.log('  Saving...');
          await sleep(rand(1000, 2000));

          // Find Save button
          const saved = await page.evaluate(() => {
            const btns = document.querySelectorAll('button');
            for (const b of btns) {
              const text = b.textContent.trim();
              const r = b.getBoundingClientRect();
              if (text === 'Save' && r.width > 30 && r.height > 20) {
                b.scrollIntoView();
                return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
              }
            }
            return null;
          });

          if (saved) {
            await page.mouse.click(saved.x, saved.y);
            console.log('  >>> HEADLINE SAVED! <<<');
          } else {
            // Try Playwright selector
            try { await page.locator('button:has-text("Save")').first().click(); console.log('  >>> SAVED via locator <<<'); }
            catch(e) { console.log('  Save button not found'); }
          }

          await sleep(rand(4000, 6000));
          await snap(page, 'after-headline-save');
        }
      } else {
        console.log('  ERROR: Headline field not found even after scrolling');
        // Try getByLabel as last resort
        try {
          await page.getByLabel(/headline/i).first().scrollIntoViewIfNeeded();
          await page.getByLabel(/headline/i).first().fill(HEADLINE);
          console.log('  >>> HEADLINE via getByLabel <<<');
          await page.locator('button:has-text("Save")').first().click();
          await sleep(4000);
        } catch(e) { console.log('  getByLabel failed: ' + e.message.substring(0, 60)); }
      }
    } else {
      console.log('  ERROR: Edit Intro modal did not open');
    }

    // ============================================================
    // ABOUT: Click the correct "Add section" button (on profile, not navbar)
    // From screenshots we know it's visible as a pill button at ~y=503
    // ============================================================
    console.log('\n[ABOUT] Adding About section...');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(4000, 6000));

    // Find "Add section" button SPECIFICALLY in the profile area (y > 400, not navbar)
    const addSectionPos = await page.evaluate(() => {
      const all = document.querySelectorAll('button, a, [role="button"]');
      for (const el of all) {
        const text = el.textContent.trim();
        if (text.includes('Add section') || text === 'Add section') {
          const r = el.getBoundingClientRect();
          // Profile buttons are in y range 470-520 area, not in navbar (y < 60)
          if (r.y > 300 && r.width > 50) {
            return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), tag: el.tagName };
          }
        }
      }
      return null;
    });

    if (addSectionPos) {
      console.log(`  Found "Add section" at (${addSectionPos.x}, ${addSectionPos.y})`);
      await page.mouse.click(addSectionPos.x, addSectionPos.y);
      console.log('  Clicked!');
      await sleep(rand(2000, 4000));
      await snap(page, 'add-section-dropdown');

      // Look for "About" in whatever appeared
      // Search for it specifically in the profile area (not navbar which is at y < 60)
      const aboutPos = await page.evaluate(() => {
        // Look for elements that say exactly "About" and are in the main content area
        const candidates = document.querySelectorAll('button, a, li, span, div, [role="menuitem"]');
        for (const el of candidates) {
          // Must be exact "About" text (not "About this profile" etc.)
          if (el.textContent.trim() === 'About') {
            const r = el.getBoundingClientRect();
            if (r.width > 10 && r.height > 10 && r.y > 100 && r.y < 700) {
              return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), tag: el.tagName };
            }
          }
        }
        // Also try "Summary"
        for (const el of candidates) {
          if (el.textContent.trim() === 'Summary' || el.textContent.trim() === 'Add summary') {
            const r = el.getBoundingClientRect();
            if (r.width > 10 && r.y > 100) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), tag: el.tagName };
          }
        }
        return null;
      });

      if (aboutPos) {
        console.log(`  Found "About" at (${aboutPos.x}, ${aboutPos.y})`);
        await page.mouse.click(aboutPos.x, aboutPos.y);
        console.log('  Clicked "About"!');
        await sleep(rand(3000, 5000));
        await snap(page, 'about-editor-opened');

        // Fill about text
        let aboutDone = false;

        // Try textarea first
        const ta = await page.$('textarea:visible');
        if (ta) {
          await ta.click();
          await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
          await sleep(200);
          await ta.fill(ABOUT);
          aboutDone = true;
          console.log('  >>> ABOUT TEXT FILLED! <<<');
        }

        // Try contenteditable
        if (!aboutDone) {
          const ce = await page.$('[contenteditable="true"]:visible');
          if (ce) {
            await ce.click();
            await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
            await sleep(200); await page.keyboard.press('Delete'); await sleep(200);
            await page.keyboard.type(ABOUT, { delay: 1 });
            aboutDone = true;
            console.log('  >>> ABOUT FILLED via contenteditable! <<<');
          }
        }

        if (aboutDone) {
          await sleep(1500);
          // Save
          const savePos = await page.evaluate(() => {
            for (const b of document.querySelectorAll('button')) {
              if (b.textContent.trim() === 'Save') {
                const r = b.getBoundingClientRect();
                if (r.width > 30 && r.y > 100) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
              }
            }
            return null;
          });
          if (savePos) {
            await page.mouse.click(savePos.x, savePos.y);
            console.log('  >>> ABOUT SAVED! <<<');
          }
          await sleep(rand(3000, 5000));
        }
      } else {
        console.log('  "About" option not found. Listing dropdown contents...');
        const items = await page.evaluate(() => {
          const visible = [];
          document.querySelectorAll('*').forEach(el => {
            const r = el.getBoundingClientRect();
            const text = el.textContent?.trim();
            if (r.width > 30 && r.height > 10 && r.y > 300 && r.y < 700 && text && text.length < 40 && text.length > 2) {
              visible.push({ text, y: Math.round(r.y), tag: el.tagName });
            }
          });
          const seen = new Set();
          return visible.filter(i => { if (seen.has(i.text + i.y)) return false; seen.add(i.text + i.y); return true; }).slice(0, 20);
        });
        items.forEach(i => console.log(`    "${i.text}" <${i.tag}> y=${i.y}`));
      }
    } else {
      console.log('  "Add section" not found in profile area');
    }

    // ============================================================
    // FINAL VERIFICATION
    // ============================================================
    console.log('\n[FINAL VERIFICATION]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 8000));
    await snap(page, 'FINAL');

    await page.evaluate(() => window.scrollTo(0, 400));
    await sleep(1500);
    await snap(page, 'FINAL-scroll');

    console.log('\n  Screenshots saved to: ' + SCREENSHOTS_DIR);
    console.log('  Browser open 90s for review...');
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
