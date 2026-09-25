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
async function snap(page, label) { snapN++; const f = `GO-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

async function main() {
  console.log('=== LinkedIn Profile Updater — THE ONE ===\n');

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
    console.log('  OK!');

    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 7000));
    await snap(page, 'BEFORE');

    // ============================================================
    // 1. HEADLINE: Open Edit Intro, find textarea by value, fill it
    // ============================================================
    console.log('\n[HEADLINE]');
    console.log('  Opening Edit Intro modal...');
    await page.mouse.click(850, 290);
    await sleep(rand(4000, 6000));

    // Scroll modal to show Headline
    console.log('  Scrolling to Headline...');
    await page.evaluate(() => {
      document.querySelectorAll('div').forEach(d => {
        const r = d.getBoundingClientRect();
        if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 100) {
          d.scrollTop += 500;
        }
      });
    });
    await sleep(2000);

    // Find headline textarea by its current value "Attended SRM University"
    // or by being a textarea near the "Headline" text
    const headlineFilled = await page.evaluate((newHeadline) => {
      // Strategy 1: Find textarea with "Attended" in value
      const textareas = document.querySelectorAll('textarea');
      for (const ta of textareas) {
        if (ta.value.includes('Attended') || ta.value.includes('SRM') || ta.value.includes('University')) {
          // Found it! Use native value setter to trigger React state
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          nativeSetter.call(ta, newHeadline);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
          // Also try React's synthetic event
          const reactKey = Object.keys(ta).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
          return { success: true, method: 'value-match', oldValue: 'Attended SRM University' };
        }
      }

      // Strategy 2: Find textarea near "Headline" label text
      const allLabels = document.querySelectorAll('label, span, div, p');
      for (const lbl of allLabels) {
        if (lbl.textContent.trim() === 'Headline*' || lbl.textContent.trim() === 'Headline') {
          // Look for nearby textarea
          const parent = lbl.closest('div') || lbl.parentElement;
          if (parent) {
            const ta = parent.querySelector('textarea') || parent.parentElement?.querySelector('textarea');
            if (ta) {
              const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
              nativeSetter.call(ta, newHeadline);
              ta.dispatchEvent(new Event('input', { bubbles: true }));
              ta.dispatchEvent(new Event('change', { bubbles: true }));
              return { success: true, method: 'label-sibling' };
            }
          }
        }
      }

      // Strategy 3: Just find all visible textareas and pick the likely one
      for (const ta of textareas) {
        const r = ta.getBoundingClientRect();
        if (r.width > 200 && r.height > 50 && r.y > 100) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          nativeSetter.call(ta, newHeadline);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, method: 'large-textarea' };
        }
      }

      return { success: false, method: 'none' };
    }, HEADLINE);

    console.log('  Fill result: ' + JSON.stringify(headlineFilled));

    if (!headlineFilled.success) {
      // Playwright-level fallback: find textarea with "Attended" and fill via Playwright API
      console.log('  Trying Playwright native textarea fill...');
      const allTas = await page.$$('textarea');
      for (const ta of allTas) {
        const val = await ta.inputValue().catch(() => '');
        console.log('  Textarea value: "' + val.substring(0, 40) + '"');
        if (val.includes('Attended') || val.includes('SRM') || val.includes('University')) {
          await ta.scrollIntoViewIfNeeded();
          await sleep(500);
          await ta.click();
          await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
          await sleep(200);
          await ta.fill(HEADLINE);
          console.log('  >>> HEADLINE FILLED via Playwright! <<<');
          headlineFilled.success = true;
          break;
        }
      }
    }

    if (headlineFilled.success) {
      console.log('  >>> HEADLINE SET: "' + HEADLINE + '" <<<');
      await snap(page, 'headline-set');

      // Click Save
      console.log('  Saving...');
      await sleep(rand(1000, 2000));

      // Scroll to Save button first
      await page.evaluate(() => {
        for (const b of document.querySelectorAll('button')) {
          if (b.textContent.trim() === 'Save') b.scrollIntoView({ block: 'center' });
        }
      });
      await sleep(500);

      const savePos = await page.evaluate(() => {
        for (const b of document.querySelectorAll('button')) {
          if (b.textContent.trim() === 'Save') {
            const r = b.getBoundingClientRect();
            if (r.width > 30) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }
        return null;
      });

      if (savePos) {
        await page.mouse.click(savePos.x, savePos.y);
        console.log('  >>> HEADLINE SAVED! <<<');
        await sleep(rand(4000, 6000));
        await snap(page, 'headline-saved');
      }
    }

    // ============================================================
    // 2. ABOUT: Add section -> Core (expanded) already doesn't have
    //    About. Try "Additional" section instead.
    // ============================================================
    console.log('\n[ABOUT]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(4000, 6000));

    // Click Add section (profile area, y > 300)
    console.log('  Opening "Add section"...');
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
      await snap(page, 'add-section');

      // Expand "Additional" to look for About
      console.log('  Expanding "Additional"...');
      const addlPos = await page.evaluate(() => {
        for (const el of document.querySelectorAll('button, div, span')) {
          if (el.textContent.trim() === 'Additional') {
            const r = el.getBoundingClientRect();
            if (r.width > 30) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }
        return null;
      });

      if (addlPos) {
        await page.mouse.click(addlPos.x, addlPos.y);
        await sleep(rand(1500, 2500));
        await snap(page, 'additional-expanded');

        // List all visible items now
        const items = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a, button')).filter(el => {
            const r = el.getBoundingClientRect();
            return r.width > 50 && r.y > 80 && r.y < 700 && el.textContent.trim().length < 50 && el.textContent.trim().length > 3;
          }).map(el => ({ text: el.textContent.trim(), x: Math.round(el.getBoundingClientRect().x + el.getBoundingClientRect().width / 2), y: Math.round(el.getBoundingClientRect().y + el.getBoundingClientRect().height / 2) }));
        });

        console.log('  Items visible:');
        items.forEach(i => console.log(`    "${i.text}" at (${i.x},${i.y})`));

        // Find About
        const aboutItem = items.find(i => i.text.includes('About') || i.text.includes('about') || i.text === 'Add about' || i.text === 'Add summary');
        if (aboutItem) {
          console.log('  Found About: "' + aboutItem.text + '"');
          await page.mouse.click(aboutItem.x, aboutItem.y);
          await sleep(rand(3000, 5000));
          await snap(page, 'about-editor');

          // Fill About textarea
          let aboutDone = false;
          const allTas = await page.$$('textarea');
          for (const ta of allTas) {
            const box = await ta.boundingBox();
            if (box && box.width > 200 && box.height > 50) {
              await ta.click();
              await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
              await sleep(200);
              await ta.fill(ABOUT);
              aboutDone = true;
              console.log('  >>> ABOUT FILLED! <<<');
              break;
            }
          }

          if (!aboutDone) {
            // contenteditable
            const ce = await page.$('[contenteditable="true"]:visible');
            if (ce) {
              await ce.click();
              await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
              await page.keyboard.press('Delete');
              await page.keyboard.type(ABOUT, { delay: 1 });
              aboutDone = true;
              console.log('  >>> ABOUT FILLED via CE! <<<');
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
            if (sp) { await page.mouse.click(sp.x, sp.y); console.log('  >>> ABOUT SAVED! <<<'); await sleep(rand(3000, 5000)); }
          }
        } else {
          console.log('  "About" not found in Additional either');

          // Last resort: try "Recommended" section
          console.log('  Trying "Recommended"...');
          // Close current and reopen
          try { const x = await page.$('button[aria-label="Dismiss"], button[aria-label="Close"]'); if (x) await x.click(); } catch(e) {}
          await sleep(1000);
        }
      }
    }

    // ============================================================
    // 3. VERIFY
    // ============================================================
    console.log('\n[VERIFY]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 8000));
    await snap(page, 'AFTER');

    await page.evaluate(() => window.scrollTo(0, 500));
    await sleep(1500);
    await snap(page, 'AFTER-scroll');

    console.log('\n  Screenshots: ' + SCREENSHOTS_DIR);
    console.log('  Browser open 90s...');
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
