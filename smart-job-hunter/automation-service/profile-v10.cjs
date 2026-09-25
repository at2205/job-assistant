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
async function snap(page, label) { snapN++; const f = `v10-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

async function main() {
  console.log('=== LinkedIn Profile Updater v10 ===\n');

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
      console.log('  Not logged in!'); await context.close(); return;
    }
    console.log('  OK!');

    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 7000));
    await snap(page, 'BEFORE');

    // ============================================================
    // 1. HEADLINE: Click the pencil icon at (866, 315)
    //    From screenshot GO-1-BEFORE.png, the pencil is clearly visible
    //    at approximately x=866, y=315 (below banner, right side)
    // ============================================================
    console.log('\n[HEADLINE]');
    console.log('  Clicking pencil at (866, 315)...');
    await page.mouse.click(866, 315);
    await sleep(rand(5000, 7000));
    await snap(page, 'after-pencil');

    // Detect if Edit Intro modal opened
    const hasFirstName = await page.evaluate(() => {
      for (const l of document.querySelectorAll('label')) {
        if (l.textContent.includes('First name')) return true;
      }
      return false;
    });

    console.log('  Edit Intro modal: ' + (hasFirstName ? 'OPEN' : 'NOT DETECTED'));

    if (!hasFirstName) {
      // Try clicking neaby positions
      console.log('  Retrying clicks around pencil area...');
      for (const [x, y] of [[870, 318], [860, 310], [855, 320], [875, 310]]) {
        await page.mouse.click(x, y);
        await sleep(2000);
        const check = await page.evaluate(() => {
          for (const l of document.querySelectorAll('label')) {
            if (l.textContent.includes('First name')) return true;
          }
          return false;
        });
        if (check) { console.log(`  Modal opened at (${x},${y})!`); break; }
      }
    }

    // Re-check
    const modalOpen = await page.evaluate(() => {
      for (const l of document.querySelectorAll('label')) {
        if (l.textContent.includes('First name')) return true;
      }
      return false;
    });

    if (modalOpen) {
      console.log('  MODAL IS OPEN! Scrolling to Headline...');

      // Scroll modal down to reveal Headline textarea
      await page.evaluate(() => {
        document.querySelectorAll('div').forEach(d => {
          const r = d.getBoundingClientRect();
          if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
            d.scrollTop += 500;
          }
        });
      });
      await sleep(2000);
      await snap(page, 'modal-scrolled');

      // Enumerate all fields
      const fields = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input, textarea, select')).map(el => {
          const r = el.getBoundingClientRect();
          if (r.width < 30) return null;
          let label = '';
          if (el.id) { const lbl = document.querySelector(`label[for="${el.id}"]`); if (lbl) label = lbl.textContent.trim(); }
          if (!label) { let p = el.parentElement; for (let i = 0; i < 8 && p && !label; i++) { const lbl = p.querySelector('label'); if (lbl) label = lbl.textContent.trim(); p = p.parentElement; } }
          return { tag: el.tagName.toLowerCase(), id: el.id, label, value: (el.value || '').substring(0, 80), y: Math.round(r.y), w: Math.round(r.width) };
        }).filter(Boolean);
      });

      console.log('  Fields found:');
      fields.forEach((f, i) => console.log(`    [${i}] <${f.tag}> label="${f.label}" val="${f.value}" id="${f.id}"`));

      // Find headline - by label or by value containing "Attended"/"SRM"
      let headlineField = fields.find(f => f.label.toLowerCase().includes('headline'));
      if (!headlineField) {
        headlineField = fields.find(f => f.value.includes('Attended') || f.value.includes('SRM') || f.value.includes('University'));
      }

      if (headlineField) {
        console.log(`  Found headline: id="${headlineField.id}" val="${headlineField.value}"`);
        const el = await page.$(`[id="${headlineField.id}"]`);
        if (el) {
          await el.scrollIntoViewIfNeeded();
          await sleep(500);
          await el.click({ clickCount: 3 });
          await sleep(300);
          await el.fill('');
          await sleep(200);
          await el.fill(HEADLINE);
          console.log('  >>> HEADLINE SET: "' + HEADLINE + '" <<<');
          await snap(page, 'headline-filled');

          // Save
          await sleep(rand(1000, 2000));
          const saved = await page.evaluate(() => {
            for (const b of document.querySelectorAll('button')) {
              if (b.textContent.trim() === 'Save') {
                b.scrollIntoView();
                const r = b.getBoundingClientRect();
                if (r.width > 30) return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
              }
            }
            return null;
          });
          if (saved) {
            await page.mouse.click(saved.x, saved.y);
            console.log('  >>> HEADLINE SAVED! <<<');
            await sleep(rand(4000, 6000));
            await snap(page, 'headline-saved');
          } else {
            console.log('  Save button not found');
          }
        }
      } else {
        console.log('  Headline field NOT FOUND. Trying getByLabel...');
        try {
          await page.getByLabel(/headline/i).first().scrollIntoViewIfNeeded();
          await page.getByLabel(/headline/i).first().fill(HEADLINE);
          console.log('  >>> HEADLINE via getByLabel <<<');
          await page.locator('button:has-text("Save")').first().click();
          await sleep(5000);
        } catch(e) {
          console.log('  getByLabel failed: ' + e.message.substring(0, 80));
        }
      }
    } else {
      console.log('  ERROR: Could not open Edit Intro modal');
    }

    // ============================================================
    // 2. ABOUT: Add section -> expand Core -> find About
    //    From screenshot GO-2-add-section.png, Core is at top, collapsed
    // ============================================================
    console.log('\n[ABOUT]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(4000, 6000));

    // Click "Add section"
    console.log('  Clicking "Add section"...');
    const addPos = await page.evaluate(() => {
      for (const el of document.querySelectorAll('button, a, [role="button"]')) {
        if (el.textContent.trim() === 'Add section' && el.getBoundingClientRect().y > 300) {
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    });

    if (addPos) {
      await page.mouse.click(addPos.x, addPos.y);
      await sleep(rand(2000, 3000));
      await snap(page, 'add-section-modal');

      // Click "Core" to expand it
      console.log('  Expanding "Core"...');
      const corePos = await page.evaluate(() => {
        for (const el of document.querySelectorAll('button, div, span')) {
          if (el.textContent.trim() === 'Core') {
            const r = el.getBoundingClientRect();
            if (r.width > 30 && r.y > 50) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }
        return null;
      });

      if (corePos) {
        await page.mouse.click(corePos.x, corePos.y);
        await sleep(rand(1500, 2500));
        await snap(page, 'core-expanded');

        // List all items under Core
        const coreItems = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a, button, li, span')).filter(el => {
            const r = el.getBoundingClientRect();
            return r.width > 50 && r.y > 80 && r.y < 700 && el.textContent.trim().length < 50 && el.textContent.trim().length > 3;
          }).map(el => ({
            text: el.textContent.trim(),
            x: Math.round(el.getBoundingClientRect().x + el.getBoundingClientRect().width / 2),
            y: Math.round(el.getBoundingClientRect().y + el.getBoundingClientRect().height / 2)
          }));
        });

        console.log('  Core items:');
        coreItems.forEach(i => console.log(`    "${i.text}" at (${i.x},${i.y})`));

        // Find About
        const aboutItem = coreItems.find(i =>
          i.text === 'About' || i.text === 'Add about' || i.text === 'Add summary' ||
          i.text.includes('About') && i.text.length < 20
        );

        if (aboutItem) {
          console.log('  Found: "' + aboutItem.text + '" - clicking...');
          await page.mouse.click(aboutItem.x, aboutItem.y);
          await sleep(rand(3000, 5000));
          await snap(page, 'about-editor');

          // Fill About
          let aboutDone = false;

          // Try textarea
          const allTas = await page.$$('textarea');
          for (const ta of allTas) {
            const box = await ta.boundingBox();
            if (box && box.width > 200 && box.height > 40) {
              await ta.click();
              await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
              await sleep(200);
              await ta.fill(ABOUT);
              aboutDone = true;
              console.log('  >>> ABOUT FILLED! <<<');
              break;
            }
          }

          // Try contenteditable
          if (!aboutDone) {
            const ces = await page.$$('[contenteditable="true"]');
            for (const ce of ces) {
              const box = await ce.boundingBox();
              if (box && box.width > 200) {
                await ce.click();
                await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
                await sleep(200); await page.keyboard.press('Delete');
                await page.keyboard.type(ABOUT, { delay: 1 });
                aboutDone = true;
                console.log('  >>> ABOUT FILLED via CE! <<<');
                break;
              }
            }
          }

          if (aboutDone) {
            await sleep(1500);
            const sp = await page.evaluate(() => {
              for (const b of document.querySelectorAll('button')) {
                if (b.textContent.trim() === 'Save') { const r = b.getBoundingClientRect(); if (r.width > 30) return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
              }
              return null;
            });
            if (sp) {
              await page.mouse.click(sp.x, sp.y);
              console.log('  >>> ABOUT SAVED! <<<');
              await sleep(rand(3000, 5000));
            }
          } else {
            console.log('  No text field found for About');
          }
        } else {
          console.log('  "About" NOT found under Core');
        }
      } else {
        console.log('  "Core" not found');
      }
    } else {
      console.log('  "Add section" not found');
    }

    // ============================================================
    // 3. VERIFY
    // ============================================================
    console.log('\n[VERIFY]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 8000));
    await snap(page, 'FINAL');

    const result = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const name = h1 ? h1.textContent.trim() : 'N/A';
      const hasAbout = !!document.querySelector('#about');
      // Get subtitle text
      let headline = 'N/A';
      if (h1) {
        const card = h1.closest('[class*="card"]') || h1.parentElement?.parentElement?.parentElement;
        if (card) {
          for (const d of card.querySelectorAll('div')) {
            const t = d.textContent.trim();
            if (t && t !== name && t.length > 10 && t.length < 200 && !t.includes('connections') && !t.includes('Contact') && !t.includes('Open to') && !t.includes('Add section')) {
              headline = t; break;
            }
          }
        }
      }
      return { name, headline: headline.substring(0, 100), hasAbout };
    });

    console.log('\n  Name:     ' + result.name);
    console.log('  Headline: ' + result.headline);
    console.log('  About:    ' + (result.hasAbout ? 'EXISTS' : 'MISSING'));
    console.log('  Headline: ' + (result.headline.includes('Backend Engineer') ? 'UPDATED ✓' : 'CHECK NEEDED'));
    console.log('  About:    ' + (result.hasAbout ? 'ADDED ✓' : 'CHECK NEEDED'));

    await page.evaluate(() => window.scrollTo(0, 500));
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
