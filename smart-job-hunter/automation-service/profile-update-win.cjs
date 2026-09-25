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
async function snap(page, label) { snapN++; const f = `WIN-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

async function main() {
  console.log('=== LinkedIn Profile Updater — DEFINITIVE ===\n');

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
      console.log('  Not logged in!'); await context.close(); return;
    }
    console.log('  Session active!');

    // Profile
    console.log('\n[PROFILE]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 7000));
    await snap(page, 'BEFORE');

    // ============================================================
    // 1. HEADLINE UPDATE
    // Click pencil at ~(850,290) -> opens Edit Intro modal
    // Headline is a TEXTAREA (not input!) labeled "Headline*"
    // ============================================================
    console.log('\n[STEP 1] UPDATE HEADLINE');
    console.log('  Clicking intro edit pencil...');
    await page.mouse.click(850, 290);
    await sleep(rand(4000, 6000));

    // Detect modal by "First name" label presence
    const modalDetected = await page.evaluate(() => {
      const labels = document.querySelectorAll('label');
      for (const l of labels) { if (l.textContent.includes('First name')) return true; }
      return false;
    });

    if (!modalDetected) {
      console.log('  Modal not detected, retrying at (860, 305)...');
      await page.mouse.click(860, 305);
      await sleep(rand(3000, 5000));
    }

    await snap(page, 'edit-intro-opened');

    // Scroll modal to reveal Headline textarea
    console.log('  Scrolling modal to Headline field...');
    await page.evaluate(() => {
      // Find scrollable container inside the modal
      document.querySelectorAll('div').forEach(d => {
        const r = d.getBoundingClientRect();
        if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 100) {
          d.scrollTop += 500;
        }
      });
    });
    await sleep(2000);
    await snap(page, 'modal-scrolled-to-headline');

    // Find the Headline TEXTAREA by its label
    const headlineFieldId = await page.evaluate(() => {
      const labels = document.querySelectorAll('label');
      for (const l of labels) {
        if (l.textContent.trim().includes('Headline')) {
          const forId = l.getAttribute('for');
          if (forId) return forId;
        }
      }
      // Fallback: find textarea with "Attended" in value
      const textareas = document.querySelectorAll('textarea');
      for (const ta of textareas) {
        if (ta.value.includes('Attended') || ta.value.includes('Engineer') || ta.value.includes('SRM')) {
          return ta.id;
        }
      }
      return null;
    });

    console.log('  Headline field ID: ' + headlineFieldId);

    if (headlineFieldId) {
      const headlineEl = await page.$(`[id="${headlineFieldId}"]`);
      if (headlineEl) {
        await headlineEl.scrollIntoViewIfNeeded();
        await sleep(500);
        await headlineEl.click();
        await sleep(300);
        // Select all and clear
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await sleep(200);
        await headlineEl.fill(HEADLINE);
        await sleep(500);
        console.log('  >>> HEADLINE SET TO: "' + HEADLINE + '" <<<');
        await snap(page, 'headline-filled');

        // Click Save
        console.log('  Clicking Save...');
        await sleep(rand(1000, 2000));
        const savePos = await page.evaluate(() => {
          for (const b of document.querySelectorAll('button')) {
            if (b.textContent.trim() === 'Save') {
              const r = b.getBoundingClientRect();
              if (r.width > 30) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
            }
          }
          return null;
        });

        if (savePos) {
          await page.mouse.click(savePos.x, savePos.y);
          console.log('  >>> HEADLINE SAVED SUCCESSFULLY! <<<');
          await sleep(rand(4000, 6000));
          await snap(page, 'headline-saved');
        } else {
          console.log('  Save button not found!');
        }
      }
    } else {
      // Fallback: use getByLabel
      console.log('  Trying getByLabel fallback...');
      try {
        const headlineTa = page.getByLabel(/Headline/);
        await headlineTa.scrollIntoViewIfNeeded();
        await headlineTa.click();
        await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
        await headlineTa.fill(HEADLINE);
        console.log('  >>> HEADLINE SET via getByLabel! <<<');

        await sleep(1000);
        await page.locator('button:has-text("Save")').first().click();
        console.log('  >>> SAVED! <<<');
        await sleep(5000);
      } catch(e) {
        console.log('  getByLabel failed: ' + e.message.substring(0, 80));
      }
    }

    // ============================================================
    // 2. ABOUT SECTION
    // Add section -> expand "Core" -> click "About"
    // ============================================================
    console.log('\n[STEP 2] ADD ABOUT SECTION');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(4000, 6000));

    // Click "Add section" — find it in profile area (y > 300)
    console.log('  Clicking "Add section"...');
    const addSectionPos = await page.evaluate(() => {
      for (const el of document.querySelectorAll('button, a, [role="button"]')) {
        const text = el.textContent.trim();
        if ((text === 'Add section' || text.includes('Add section')) && text.length < 20) {
          const r = el.getBoundingClientRect();
          if (r.y > 300 && r.width > 50) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        }
      }
      return null;
    });

    if (addSectionPos) {
      await page.mouse.click(addSectionPos.x, addSectionPos.y);
      console.log('  Clicked "Add section" at (' + addSectionPos.x + ',' + addSectionPos.y + ')');
      await sleep(rand(2000, 3000));
      await snap(page, 'add-to-profile-modal');

      // Now expand "Core" section to reveal "About"
      console.log('  Expanding "Core" section...');
      const corePos = await page.evaluate(() => {
        for (const el of document.querySelectorAll('button, div, span, a')) {
          const text = el.textContent.trim();
          if (text === 'Core') {
            const r = el.getBoundingClientRect();
            if (r.width > 30 && r.y > 50) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
          }
        }
        return null;
      });

      if (corePos) {
        await page.mouse.click(corePos.x, corePos.y);
        console.log('  Clicked "Core"!');
        await sleep(rand(1500, 2500));
        await snap(page, 'core-expanded');

        // Now find and click "About" or "Add about"
        const aboutPos = await page.evaluate(() => {
          for (const el of document.querySelectorAll('button, a, li, span, div, p')) {
            const text = el.textContent.trim();
            if (text === 'About' || text === 'Add about' || text === 'Add summary') {
              const r = el.getBoundingClientRect();
              if (r.width > 10 && r.height > 10 && r.y > 50 && r.y < 700) {
                return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), text };
              }
            }
          }
          return null;
        });

        if (aboutPos) {
          console.log(`  Found "${aboutPos.text}" at (${aboutPos.x}, ${aboutPos.y})`);
          await page.mouse.click(aboutPos.x, aboutPos.y);
          console.log('  Clicked!');
          await sleep(rand(3000, 5000));
          await snap(page, 'about-editor');

          // Fill the About text — it should be a textarea or contenteditable
          let aboutDone = false;

          // Method 1: textarea
          const textareas = await page.$$('textarea:visible');
          for (const ta of textareas) {
            const box = await ta.boundingBox();
            if (box && box.width > 200 && box.height > 50) {
              await ta.click();
              await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
              await sleep(200);
              await ta.fill(ABOUT);
              aboutDone = true;
              console.log('  >>> ABOUT TEXT FILLED! <<<');
              break;
            }
          }

          // Method 2: contenteditable
          if (!aboutDone) {
            const editables = await page.$$('[contenteditable="true"]:visible');
            for (const ce of editables) {
              const box = await ce.boundingBox();
              if (box && box.width > 200) {
                await ce.click();
                await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
                await sleep(200); await page.keyboard.press('Delete');
                await page.keyboard.type(ABOUT, { delay: 1 });
                aboutDone = true;
                console.log('  >>> ABOUT FILLED via contenteditable! <<<');
                break;
              }
            }
          }

          // Method 3: getByRole
          if (!aboutDone) {
            try {
              const tb = page.getByRole('textbox');
              const cnt = await tb.count();
              if (cnt > 0) {
                await tb.first().click();
                await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
                await tb.first().fill(ABOUT);
                aboutDone = true;
                console.log('  >>> ABOUT FILLED via textbox role! <<<');
              }
            } catch(e) {}
          }

          if (aboutDone) {
            await snap(page, 'about-filled');
            await sleep(rand(1500, 2500));
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
              console.log('  >>> ABOUT SAVED SUCCESSFULLY! <<<');
              await sleep(rand(3000, 5000));
            }
          } else {
            console.log('  No text field found for About');
          }
        } else {
          console.log('  "About" option not found under Core');
          // List what's visible
          const items = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a, button, li')).filter(el => {
              const r = el.getBoundingClientRect();
              return r.width > 50 && r.y > 80 && r.y < 600 && el.textContent.trim().length < 50;
            }).map(el => el.textContent.trim()).filter((t, i, a) => a.indexOf(t) === i);
          });
          console.log('  Visible options:', items.join(', '));
        }
      } else {
        console.log('  "Core" section not found');
      }
    } else {
      console.log('  "Add section" button not found');
    }

    // ============================================================
    // 3. FINAL VERIFICATION
    // ============================================================
    console.log('\n[STEP 3] FINAL VERIFICATION');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 8000));
    await snap(page, 'AFTER-top');

    await page.evaluate(() => window.scrollTo(0, 500));
    await sleep(1500);
    await snap(page, 'AFTER-scroll');

    // Read final profile state
    const finalState = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const name = h1 ? h1.textContent.trim() : 'N/A';

      // Get all text divs below name
      let headline = 'N/A';
      if (h1) {
        const card = h1.closest('[class*="card"]') || h1.parentElement?.parentElement?.parentElement;
        if (card) {
          const divs = card.querySelectorAll('div');
          for (const d of divs) {
            const t = d.textContent.trim();
            if (t && t !== name && t.length > 10 && t.length < 200 &&
                !t.includes('connections') && !t.includes('Contact') &&
                !t.includes('Open to') && !t.includes('Add section') &&
                !t.includes('Enhance') && !t.includes('Resources')) {
              headline = t;
              break;
            }
          }
        }
      }

      const hasAbout = !!document.querySelector('#about');

      return { name, headline, hasAbout };
    });

    console.log('\n  ╔════════════════════════════════════════════════════════════════╗');
    console.log('  ║                      FINAL RESULTS                              ║');
    console.log('  ╠════════════════════════════════════════════════════════════════╣');
    console.log('  ║  Name:     ' + finalState.name.padEnd(53) + '║');
    console.log('  ║  Headline: ' + finalState.headline.substring(0, 53).padEnd(53) + '║');
    console.log('  ║  About:    ' + (finalState.hasAbout ? 'ADDED ✓' : 'Not added').padEnd(53) + '║');
    console.log('  ╚════════════════════════════════════════════════════════════════╝');

    const headOk = finalState.headline.includes('Backend Engineer');
    console.log('\n  Headline: ' + (headOk ? '✅ UPDATED SUCCESSFULLY' : '⚠️  Verify manually'));
    console.log('  About:    ' + (finalState.hasAbout ? '✅ ADDED SUCCESSFULLY' : '⚠️  Verify manually'));

    console.log('\n  Browser open 90s for review...');
    await sleep(90000);

  } catch (err) {
    console.error('[FATAL] ' + err.message);
    console.error(err.stack?.split('\n').slice(0, 3).join('\n'));
    await snap(page, 'fatal');
  } finally {
    await context.close();
    console.log('\n[DONE] Browser closed.');
  }
}

main();
