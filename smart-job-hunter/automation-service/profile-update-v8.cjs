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
async function snap(page, label) { snapN++; const f = `v8-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

async function main() {
  console.log('=== LinkedIn Profile Updater v8 ===');
  console.log('=== FINAL: Grid Click + Modal Scroll ===\n');

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
    if (page.url().includes('/login') || page.url().includes('/authwall')) {
      console.log('  Not logged in. Exiting.'); await context.close(); return;
    }
    console.log('  OK!');

    // ===== PROFILE =====
    console.log('\n[PROFILE]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 7000));
    await snap(page, 'before');

    // ============================================================
    // HEADLINE: Click pencil at (850, 290) to open Edit Intro
    // ============================================================
    console.log('\n[HEADLINE] Clicking pencil icon at (850, 290)...');
    await page.mouse.click(850, 290);
    await sleep(rand(4000, 6000));
    await snap(page, 'edit-intro-modal');

    // Verify modal opened
    const modalOpen = await page.$('[role="dialog"]');
    if (!modalOpen) {
      console.log('  No modal detected. Retrying at nearby position...');
      await page.mouse.click(860, 300);
      await sleep(3000);
      await page.mouse.click(865, 310);
      await sleep(3000);
    }

    const hasDialog = await page.$('[role="dialog"]');
    if (!hasDialog) {
      console.log('  ERROR: Edit intro modal did not open!');
      await snap(page, 'no-modal');
    } else {
      console.log('  Edit intro MODAL IS OPEN!');

      // Scroll DOWN in the modal to find Headline field
      // The modal has: First name, Last name, Additional name, Pronouns, Headline, Industry, etc.
      console.log('  Scrolling modal to find Headline field...');

      // Get the modal element and scroll it
      const modalEl = await page.$('[role="dialog"]');
      const scrollContainer = await modalEl.$('.artdeco-modal__content, [class*="modal__content"], [class*="overflow"]');

      if (scrollContainer) {
        await scrollContainer.evaluate(el => el.scrollTop = 300);
        await sleep(1000);
      } else {
        // Scroll inside modal by scrolling the dialog itself
        await modalEl.evaluate(el => {
          const scrollable = el.querySelector('[style*="overflow"], .artdeco-modal__content') || el;
          scrollable.scrollTop = 300;
        });
        await sleep(1000);
      }

      await snap(page, 'modal-scrolled');

      // Enumerate ALL form fields in the modal
      const allFields = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        if (!modal) return [];
        const fields = [];
        modal.querySelectorAll('input, textarea, select').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width < 20) return;

          // Find associated label
          let label = '';
          const id = el.id;
          if (id) {
            const lbl = document.querySelector(`label[for="${id}"]`);
            if (lbl) label = lbl.textContent.trim();
          }
          if (!label) {
            let p = el.parentElement;
            for (let i = 0; i < 6 && p && !label; i++) {
              const lbl = p.querySelector('label');
              if (lbl) label = lbl.textContent.trim();
              p = p.parentElement;
            }
          }

          fields.push({
            tag: el.tagName.toLowerCase(),
            id: el.id,
            type: el.type || '',
            label: label,
            value: (el.value || '').substring(0, 80),
            y: Math.round(r.y),
          });
        });
        return fields;
      });

      console.log('\n  ALL form fields in Edit Intro modal:');
      allFields.forEach((f, i) => {
        console.log(`    [${i}] <${f.tag}> label="${f.label}" id="${f.id}" val="${f.value}" y=${f.y}`);
      });

      // Find and fill Headline
      let headlineFilled = false;
      for (const f of allFields) {
        if (f.label.toLowerCase().includes('headline')) {
          const selector = `[id="${f.id}"]`;
          console.log(`\n  Found Headline field: id="${f.id}" current="${f.value}"`);
          const inp = await page.$(selector);
          if (inp) {
            await inp.scrollIntoViewIfNeeded();
            await sleep(500);
            await inp.click({ clickCount: 3 });
            await sleep(300);
            await inp.fill('');
            await sleep(200);
            await inp.fill(HEADLINE);
            headlineFilled = true;
            console.log('  >>> HEADLINE UPDATED: "' + HEADLINE + '" <<<');
          }
          break;
        }
      }

      // Fallback: getByLabel
      if (!headlineFilled) {
        try {
          await page.getByLabel(/headline/i).first().fill(HEADLINE);
          headlineFilled = true;
          console.log('  >>> HEADLINE UPDATED via getByLabel <<<');
        } catch(e) {
          console.log('  getByLabel failed: ' + e.message.substring(0, 80));
        }
      }

      // Fallback: try filling by position (headline is usually the 4th or 5th input)
      if (!headlineFilled && allFields.length >= 4) {
        // Headline typically comes after First name, Last name, Additional name
        for (let i = 3; i < allFields.length && i < 6; i++) {
          const f = allFields[i];
          if (f.tag === 'input' && f.type !== 'hidden' && !f.label.toLowerCase().includes('name') && !f.label.toLowerCase().includes('pronoun')) {
            const inp = await page.$(`[id="${f.id}"]`);
            if (inp) {
              await inp.scrollIntoViewIfNeeded(); await sleep(500);
              await inp.click({ clickCount: 3 }); await sleep(200);
              await inp.fill(HEADLINE);
              headlineFilled = true;
              console.log(`  >>> HEADLINE UPDATED (position ${i}): "${HEADLINE}" <<<`);
              break;
            }
          }
        }
      }

      await snap(page, 'headline-filled');

      // SAVE
      if (headlineFilled) {
        console.log('  Saving...');
        await sleep(rand(1000, 2000));

        // Find and click Save button
        const saveBtn = await page.locator('[role="dialog"] button', { hasText: 'Save' }).first();
        try {
          await saveBtn.scrollIntoViewIfNeeded();
          await sleep(500);
          await saveBtn.click();
          console.log('  >>> INTRO SAVED! <<<');
        } catch(e) {
          // Fallback
          const btns = await page.$$('[role="dialog"] button');
          for (const b of btns) {
            const t = (await b.textContent() || '').trim();
            if (t === 'Save') { await b.click(); console.log('  >>> SAVED (fallback) <<<'); break; }
          }
        }
        await sleep(rand(4000, 6000));
        await snap(page, 'after-save');
      } else {
        console.log('  ERROR: Could not find or fill headline');
        // Close modal
        try { const x = await page.$('[role="dialog"] button[aria-label="Dismiss"]'); if (x) await x.click(); } catch(e) {}
        await sleep(1000);
      }
    }

    // ============================================================
    // ABOUT SECTION: Use "Add section" dropdown
    // ============================================================
    console.log('\n[ABOUT] Opening Add section...');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(4000, 6000));

    // Find "Add section" — it might be a link/anchor not a button
    const addSectionEl = await page.evaluate(() => {
      const all = document.querySelectorAll('button, a, [role="button"]');
      for (const el of all) {
        if (el.textContent.trim().includes('Add section')) {
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), tag: el.tagName, text: el.textContent.trim().substring(0, 30) };
        }
      }
      // Also try by innerText
      for (const el of all) {
        if (el.innerText && el.innerText.includes('Add section')) {
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), tag: el.tagName, text: el.innerText.substring(0, 30) };
        }
      }
      return null;
    });

    if (addSectionEl) {
      console.log(`  Found "Add section" <${addSectionEl.tag}> at (${addSectionEl.x},${addSectionEl.y})`);
      await page.mouse.click(addSectionEl.x, addSectionEl.y);
      console.log('  Clicked!');
      await sleep(rand(2000, 4000));
      await snap(page, 'add-section-menu');

      // Find and click "About"
      const aboutEl = await page.evaluate(() => {
        const all = document.querySelectorAll('button, a, li, [role="menuitem"], [role="option"], span, div');
        for (const el of all) {
          const text = el.textContent.trim();
          if (text === 'About') {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && r.y > 0) {
              return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), tag: el.tagName };
            }
          }
        }
        return null;
      });

      if (aboutEl) {
        console.log(`  Found "About" <${aboutEl.tag}> at (${aboutEl.x},${aboutEl.y})`);
        await page.mouse.click(aboutEl.x, aboutEl.y);
        console.log('  Clicked "About"!');
        await sleep(rand(3000, 5000));
        await snap(page, 'about-editor');

        // Fill the About text
        let aboutDone = false;

        // Method 1: textarea
        const ta = await page.$('[role="dialog"] textarea:visible, textarea:visible');
        if (ta) {
          await ta.click();
          await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
          await sleep(200);
          await ta.fill(ABOUT);
          aboutDone = true;
          console.log('  >>> ABOUT TEXT FILLED! <<<');
        }

        // Method 2: getByRole textbox in dialog
        if (!aboutDone) {
          try {
            const textboxes = page.locator('[role="dialog"] [role="textbox"], [role="dialog"] textarea, [role="dialog"] [contenteditable="true"]');
            const cnt = await textboxes.count();
            if (cnt > 0) {
              await textboxes.first().click();
              await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
              await sleep(200);
              await textboxes.first().fill(ABOUT);
              aboutDone = true;
              console.log('  >>> ABOUT TEXT FILLED via locator! <<<');
            }
          } catch(e) {}
        }

        // Method 3: contenteditable
        if (!aboutDone) {
          const ce = await page.$('[contenteditable="true"]:visible');
          if (ce) {
            await ce.click();
            await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
            await sleep(200);
            await page.keyboard.press('Delete');
            await page.keyboard.type(ABOUT, { delay: 1 });
            aboutDone = true;
            console.log('  >>> ABOUT TEXT FILLED via contenteditable! <<<');
          }
        }

        if (aboutDone) {
          await sleep(rand(1500, 2500));
          // Save
          try {
            const saveBtn = page.locator('[role="dialog"] button', { hasText: 'Save' }).first();
            await saveBtn.scrollIntoViewIfNeeded();
            await saveBtn.click();
            console.log('  >>> ABOUT SAVED! <<<');
          } catch(e) {
            const btns = await page.$$('button');
            for (const b of btns) { if ((await b.textContent() || '').trim() === 'Save') { await b.click(); console.log('  Saved!'); break; } }
          }
          await sleep(rand(3000, 5000));
        } else {
          console.log('  WARNING: No text field found for About');
        }
      } else {
        console.log('  "About" option not found in dropdown');
        // List what IS in the dropdown
        const items = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('[role="dialog"] *, .artdeco-dropdown__content-inner *')).filter(el => {
            const r = el.getBoundingClientRect();
            return r.width > 20 && r.height > 10 && el.textContent.trim().length > 0 && el.textContent.trim().length < 50;
          }).map(el => el.textContent.trim()).filter((t, i, a) => a.indexOf(t) === i).slice(0, 20);
        });
        console.log('  Visible items:', items.join(', '));
      }
    } else {
      console.log('  "Add section" not found on page');
    }

    // ============================================================
    // FINAL VERIFICATION
    // ============================================================
    console.log('\n[VERIFY] Final profile check...');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 8000));
    await snap(page, 'FINAL-top');

    // Read profile data
    const finalData = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const name = h1 ? h1.textContent.trim() : 'N/A';
      // Headline is the text right below name
      const subtitles = h1 ? h1.parentElement?.parentElement?.querySelectorAll('div') : [];
      let headline = 'N/A';
      if (subtitles) {
        for (const div of subtitles) {
          const t = div.textContent.trim();
          if (t && t !== name && t.length > 10 && t.length < 200 && !t.includes('connections') && !t.includes('Contact')) {
            headline = t;
            break;
          }
        }
      }
      const hasAbout = !!document.querySelector('#about');
      return { name, headline, hasAbout };
    });

    console.log('\n  ╔════════════════════════════════════════════════════════════╗');
    console.log('  ║                    FINAL RESULTS                            ║');
    console.log('  ╠════════════════════════════════════════════════════════════╣');
    console.log('  ║  Name:     ' + finalData.name.padEnd(50) + '║');
    console.log('  ║  Headline: ' + finalData.headline.substring(0, 50).padEnd(50) + '║');
    console.log('  ║  About:    ' + (finalData.hasAbout ? 'EXISTS' : 'MISSING').padEnd(50) + '║');
    console.log('  ╚════════════════════════════════════════════════════════════╝');

    const headOk = finalData.headline.includes('Backend Engineer');
    console.log('\n  Headline: ' + (headOk ? 'UPDATED ✓' : 'CHECK NEEDED'));
    console.log('  About:    ' + (finalData.hasAbout ? 'ADDED ✓' : 'CHECK NEEDED'));

    await page.evaluate(() => window.scrollTo(0, 400));
    await sleep(1500);
    await snap(page, 'FINAL-scroll');

    console.log('\n  Browser open 90s for review...');
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
