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
async function snap(page, label) { snapN++; const f = `v11-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

async function main() {
  console.log('=== LinkedIn Profile v11 — Headline Fix ===\n');

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
    // 1. HEADLINE
    // From v10 screenshot: pencil at (866,315) opens "Edit intro"
    // Headline textarea shows "Attended SRM University" after scroll
    // The bug: my field scan didn't find the textarea because
    // label lookup traversed wrong parents. Fix: find textarea by value.
    // ============================================================
    console.log('\n[HEADLINE]');
    console.log('  Opening Edit Intro...');
    await page.mouse.click(866, 315);
    await sleep(rand(5000, 7000));

    // Verify modal is open
    const modalOpen = await page.evaluate(() => {
      for (const l of document.querySelectorAll('label')) {
        if (l.textContent.includes('First name')) return true;
      }
      return false;
    });

    if (!modalOpen) {
      console.log('  Modal not open, retrying...');
      await page.mouse.click(866, 315);
      await sleep(5000);
    }

    console.log('  Modal open: ' + modalOpen);

    // Scroll modal down just enough to reveal Headline
    await page.evaluate(() => {
      document.querySelectorAll('div').forEach(d => {
        const r = d.getBoundingClientRect();
        if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
          d.scrollTop += 350; // Less than before to keep headline visible
        }
      });
    });
    await sleep(2000);
    await snap(page, 'modal-scrolled');

    // Find ALL textareas and log their values
    const textareaInfo = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('textarea')).map(ta => {
        const r = ta.getBoundingClientRect();
        return {
          id: ta.id,
          value: ta.value,
          visible: r.width > 0 && r.height > 0,
          x: Math.round(r.x), y: Math.round(r.y),
          w: Math.round(r.width), h: Math.round(r.height)
        };
      });
    });

    console.log('  All textareas:');
    textareaInfo.forEach((t, i) => console.log(`    [${i}] id="${t.id}" val="${t.value}" vis=${t.visible} at (${t.x},${t.y}) ${t.w}x${t.h}`));

    // Find the headline textarea by value
    let headlineDone = false;
    const allTas = await page.$$('textarea');
    for (const ta of allTas) {
      const val = await ta.inputValue().catch(() => '');
      console.log('  Textarea value: "' + val.substring(0, 50) + '"');
      if (val.includes('Attended') || val.includes('SRM') || val.includes('University') || val.includes('Backend Engineer')) {
        console.log('  >>> FOUND HEADLINE TEXTAREA <<<');
        await ta.scrollIntoViewIfNeeded();
        await sleep(500);
        await ta.click();
        await sleep(300);
        // Select all text
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await sleep(200);
        // Fill with new headline
        await ta.fill(HEADLINE);
        await sleep(500);
        headlineDone = true;
        console.log('  >>> HEADLINE SET: "' + HEADLINE + '" <<<');
        await snap(page, 'headline-filled');
        break;
      }
    }

    if (!headlineDone) {
      // Try clicking the textarea area directly from screenshot coordinates
      // In v10-3 screenshot, "Attended SRM University" textarea is at approximately (678, 381)
      console.log('  Trying direct click on textarea area...');
      await page.mouse.click(678, 381);
      await sleep(500);
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await sleep(200);
      await page.keyboard.type(HEADLINE, { delay: 5 });
      headlineDone = true;
      console.log('  >>> HEADLINE TYPED DIRECTLY <<<');
      await snap(page, 'headline-typed');
    }

    if (headlineDone) {
      // Click Save
      await sleep(rand(1000, 2000));

      // Scroll Save button into view
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
    // 2. ABOUT: Try the direct edit approach
    //    LinkedIn About can be edited at:
    //    /in/me/ -> scroll to About section -> click pencil
    //    OR if no About exists, it might be at the Edit Intro modal
    //    but we didn't see it there. Let's check if scrolling the
    //    profile reveals an About section we can edit.
    // ============================================================
    console.log('\n[ABOUT]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 7000));

    // Check if About section exists on the profile
    const aboutExists = await page.evaluate(() => {
      return !!document.querySelector('#about');
    });

    if (aboutExists) {
      console.log('  About section EXISTS. Looking for edit button...');
      // Scroll to About section
      await page.evaluate(() => {
        const about = document.querySelector('#about');
        if (about) about.scrollIntoView({ block: 'center' });
      });
      await sleep(1500);
      await snap(page, 'about-section');

      // Find pencil/edit button near About
      const editAboutPos = await page.evaluate(() => {
        const about = document.querySelector('#about');
        if (!about) return null;
        const section = about.closest('section') || about.parentElement;
        if (!section) return null;
        const btns = section.querySelectorAll('button, a, [role="button"]');
        for (const b of btns) {
          const label = b.getAttribute('aria-label') || b.textContent.trim();
          if (label.toLowerCase().includes('edit') || b.querySelector('svg')) {
            const r = b.getBoundingClientRect();
            if (r.width > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }
        return null;
      });

      if (editAboutPos) {
        await page.mouse.click(editAboutPos.x, editAboutPos.y);
        console.log('  Clicked edit About!');
        await sleep(rand(3000, 5000));
        await snap(page, 'about-editor');

        // Fill
        const allTas = await page.$$('textarea');
        for (const ta of allTas) {
          const box = await ta.boundingBox();
          if (box && box.width > 200 && box.height > 40) {
            await ta.click();
            await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
            await sleep(200);
            await ta.fill(ABOUT);
            console.log('  >>> ABOUT FILLED! <<<');
            break;
          }
        }

        // Save
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
      console.log('  About section does NOT exist. Trying to add via About URL...');
      // Try LinkedIn's direct About edit page
      await page.goto('https://www.linkedin.com/in/me/edit/about/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(rand(3000, 5000));
      await snap(page, 'about-direct-url');

      // Check if a textarea appeared
      const allTas = await page.$$('textarea');
      let aboutDone = false;
      for (const ta of allTas) {
        const box = await ta.boundingBox();
        if (box && box.width > 200 && box.height > 40) {
          await ta.click();
          await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
          await sleep(200);
          await ta.fill(ABOUT);
          aboutDone = true;
          console.log('  >>> ABOUT FILLED via direct URL! <<<');
          break;
        }
      }

      if (!aboutDone) {
        // Try contenteditable
        const ces = await page.$$('[contenteditable="true"]');
        for (const ce of ces) {
          const box = await ce.boundingBox();
          if (box && box.width > 200) {
            await ce.click();
            await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
            await sleep(200); await page.keyboard.press('Delete');
            await page.keyboard.type(ABOUT, { delay: 1 });
            aboutDone = true;
            console.log('  >>> ABOUT FILLED via CE direct URL! <<<');
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
        if (sp) { await page.mouse.click(sp.x, sp.y); console.log('  >>> ABOUT SAVED! <<<'); await sleep(rand(3000, 5000)); }
      } else {
        console.log('  Could not find About text field. Taking screenshot of current state.');
        await snap(page, 'about-failed');

        // Log what page we're on and what's visible
        console.log('  Current URL: ' + page.url());
        const pageContent = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('h1, h2, textarea, [contenteditable], input')).map(el => {
            const r = el.getBoundingClientRect();
            return { tag: el.tagName, text: (el.textContent || el.value || '').substring(0, 60), w: Math.round(r.width), y: Math.round(r.y) };
          });
        });
        pageContent.forEach(p => console.log(`    <${p.tag}> "${p.text}" w=${p.w} y=${p.y}`));
      }
    }

    // ============================================================
    // 3. VERIFY
    // ============================================================
    console.log('\n[VERIFY]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 8000));
    await snap(page, 'FINAL');

    // Read headline from page
    const subtitle = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      if (!h1) return 'N/A';
      // The next sibling div-text after h1 is the headline
      let el = h1.nextElementSibling;
      while (el) {
        const t = el.textContent.trim();
        if (t && t.length > 5 && t.length < 200) return t;
        el = el.nextElementSibling;
      }
      return 'N/A';
    });

    const hasAbout = await page.evaluate(() => !!document.querySelector('#about'));

    console.log('\n  Headline: "' + subtitle.substring(0, 100) + '"');
    console.log('  About:    ' + (hasAbout ? 'EXISTS' : 'MISSING'));
    console.log('  Headline: ' + (subtitle.includes('Backend Engineer') ? '✓ UPDATED' : '✗ CHECK'));
    console.log('  About:    ' + (hasAbout ? '✓ ADDED' : '✗ CHECK'));

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
