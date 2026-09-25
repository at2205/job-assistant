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
async function snap(page, label) { snapN++; const f = `v13-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

async function main() {
  console.log('=== LinkedIn Profile v13 — ContentEditable + About Edit ===\n');

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
    // 1. HEADLINE — Deep DOM analysis
    // The "textarea" that shows "Attended SRM University" is NOT a real
    // <textarea>. It returns 0 from querySelectorAll('textarea').
    // It must be: contenteditable div, custom element, or Shadow DOM.
    // ============================================================
    console.log('\n[HEADLINE]');
    console.log('  Opening Edit Intro...');
    await page.mouse.click(866, 315);
    await sleep(rand(5000, 7000));

    // Scroll to show Headline
    await page.evaluate(() => {
      document.querySelectorAll('div').forEach(d => {
        const r = d.getBoundingClientRect();
        if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
          d.scrollTop += 350;
        }
      });
    });
    await sleep(2000);

    // Deep analysis of the "Headline" area
    const domAnalysis = await page.evaluate(() => {
      const results = [];

      // Find everything that contains "Attended SRM" text
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ALL);
      let node;
      while (node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.includes('Attended SRM')) {
          let el = node.parentElement;
          const chain = [];
          for (let i = 0; i < 10 && el; i++) {
            chain.push({
              tag: el.tagName,
              id: el.id,
              classes: el.className?.toString().substring(0, 80),
              contentEditable: el.contentEditable,
              role: el.getAttribute('role'),
              isTextarea: el.tagName === 'TEXTAREA',
              isInput: el.tagName === 'INPUT',
              rect: el.getBoundingClientRect ? {
                x: Math.round(el.getBoundingClientRect().x),
                y: Math.round(el.getBoundingClientRect().y),
                w: Math.round(el.getBoundingClientRect().width),
                h: Math.round(el.getBoundingClientRect().height)
              } : null
            });
            el = el.parentElement;
          }
          results.push({ text: node.textContent.trim().substring(0, 50), chain });
        }
      }
      return results;
    });

    console.log('  DOM analysis of "Attended SRM" text:');
    if (domAnalysis.length > 0) {
      const firstChain = domAnalysis[0].chain;
      firstChain.forEach((el, i) => {
        console.log(`    [${i}] <${el.tag}> id="${el.id}" CE="${el.contentEditable}" role="${el.role}" classes="${(el.classes || '').substring(0,40)}" rect=(${el.rect?.x},${el.rect?.y}) ${el.rect?.w}x${el.rect?.h}`);
      });
    } else {
      console.log('  "Attended SRM" text NOT FOUND in DOM!');
    }

    // Also check for any shadow roots
    const shadowRoots = await page.evaluate(() => {
      let count = 0;
      document.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) count++;
      });
      return count;
    });
    console.log('  Shadow roots: ' + shadowRoots);

    // Check for iframes
    const iframes = await page.frames();
    console.log('  Frames: ' + iframes.length);

    // Try to find via elementFromPoint at the textarea location
    // From v12-1 screenshot: textarea center is at approximately (678, 545)
    const elementAtPoint = await page.evaluate(() => {
      const el = document.elementFromPoint(678, 545);
      if (!el) return null;
      const chain = [];
      let current = el;
      for (let i = 0; i < 8 && current; i++) {
        chain.push({
          tag: current.tagName,
          id: current.id,
          contentEditable: current.contentEditable,
          role: current.getAttribute('role'),
          value: current.value,
          textContent: current.textContent?.substring(0, 50),
          classes: current.className?.toString().substring(0, 60)
        });
        current = current.parentElement;
      }
      return chain;
    });

    console.log('\n  Element at (678, 545):');
    if (elementAtPoint) {
      elementAtPoint.forEach((el, i) => {
        console.log(`    [${i}] <${el.tag}> id="${el.id}" CE="${el.contentEditable}" val="${el.value}" text="${el.textContent}"`);
      });
    }

    await snap(page, 'headline-analysis');

    // NOW: based on analysis, try to fill the headline
    // Strategy: click into it, triple-click select all, type new headline
    let headlineDone = false;

    // Try to find the element containing "Attended SRM" and click it
    if (domAnalysis.length > 0) {
      const headlineRect = domAnalysis[0].chain[0]?.rect;
      if (headlineRect && headlineRect.w > 100) {
        console.log('\n  Clicking inside headline element at (' + (headlineRect.x + 50) + ',' + (headlineRect.y + 10) + ')');
        await page.mouse.click(headlineRect.x + 50, headlineRect.y + 10);
        await sleep(500);

        // Triple-click to select all text inside this element
        await page.mouse.click(headlineRect.x + 50, headlineRect.y + 10, { clickCount: 3 });
        await sleep(300);
        await snap(page, 'headline-selected');

        // Type new headline
        await page.keyboard.type(HEADLINE, { delay: 8 });
        await sleep(500);
        headlineDone = true;
        console.log('  >>> HEADLINE TYPED <<<');
        await snap(page, 'headline-typed');
      }
    }

    if (!headlineDone && elementAtPoint) {
      // Use the elementFromPoint approach
      console.log('\n  Trying elementFromPoint click...');
      await page.mouse.click(678, 545);
      await sleep(500);
      await page.mouse.click(678, 545, { clickCount: 3 });
      await sleep(300);
      await page.keyboard.type(HEADLINE, { delay: 8 });
      headlineDone = true;
      console.log('  >>> HEADLINE TYPED via point click <<<');
      await snap(page, 'headline-typed');
    }

    if (headlineDone) {
      await sleep(rand(1000, 2000));
      // Scroll Save into view
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
        console.log('  >>> SAVE CLICKED <<<');
        await sleep(rand(5000, 8000));
        await snap(page, 'after-save');
      }
    }

    // ============================================================
    // 2. ABOUT — Found on profile at y≈357 with pencil edit icon
    //    Scroll to About, click pencil, edit text
    // ============================================================
    console.log('\n[ABOUT]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 7000));

    // Scroll to About section
    console.log('  Scrolling to About section...');
    await page.evaluate(() => {
      // Find About heading
      for (const h2 of document.querySelectorAll('h2')) {
        if (h2.textContent.trim() === 'About') {
          h2.scrollIntoView({ block: 'center' });
          return true;
        }
      }
      return false;
    });
    await sleep(2000);
    await snap(page, 'about-section');

    // Find the pencil/edit button near About
    const aboutEditPos = await page.evaluate(() => {
      for (const h2 of document.querySelectorAll('h2')) {
        if (h2.textContent.trim() === 'About') {
          const section = h2.closest('section') || h2.parentElement?.parentElement;
          if (section) {
            // Find buttons/links with edit-related attributes
            for (const btn of section.querySelectorAll('button, a, [role="button"]')) {
              const label = btn.getAttribute('aria-label') || '';
              const r = btn.getBoundingClientRect();
              if (r.width > 0 && r.height > 0 && (label.toLowerCase().includes('edit') || btn.querySelector('svg, [data-icon]'))) {
                return { x: r.x + r.width / 2, y: r.y + r.height / 2, label };
              }
            }
            // Fallback: any button in the section
            for (const btn of section.querySelectorAll('button')) {
              const r = btn.getBoundingClientRect();
              if (r.width > 10 && r.width < 60 && r.height > 10 && r.height < 60) {
                return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: 'small-btn' };
              }
            }
          }
        }
      }
      return null;
    });

    if (aboutEditPos) {
      console.log('  Found About edit: label="' + aboutEditPos.label + '" at (' + Math.round(aboutEditPos.x) + ',' + Math.round(aboutEditPos.y) + ')');
      await page.mouse.click(aboutEditPos.x, aboutEditPos.y);
      console.log('  Clicked!');
      await sleep(rand(3000, 5000));
      await snap(page, 'about-editor');

      // Try to find any text input in the opened editor
      // Check for textarea, contenteditable, or textbox role
      const aboutFieldInfo = await page.evaluate(() => {
        // Check all possible text input types
        const results = { textareas: 0, contentEditables: [], textboxRoles: [] };

        results.textareas = document.querySelectorAll('textarea').length;

        document.querySelectorAll('[contenteditable="true"]').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width > 100) {
            results.contentEditables.push({
              text: el.textContent?.substring(0, 60),
              x: Math.round(r.x), y: Math.round(r.y),
              w: Math.round(r.width), h: Math.round(r.height)
            });
          }
        });

        document.querySelectorAll('[role="textbox"]').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width > 100) {
            results.textboxRoles.push({
              text: el.textContent?.substring(0, 60),
              x: Math.round(r.x), y: Math.round(r.y),
              w: Math.round(r.width), h: Math.round(r.height)
            });
          }
        });

        return results;
      });

      console.log('  About field analysis: ' + JSON.stringify(aboutFieldInfo));

      let aboutDone = false;

      // Try contenteditable
      if (aboutFieldInfo.contentEditables.length > 0) {
        const ce = aboutFieldInfo.contentEditables[0];
        console.log('  Clicking contenteditable at (' + ce.x + ',' + ce.y + ')');
        await page.mouse.click(ce.x + 50, ce.y + 10);
        await sleep(300);
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await sleep(200);
        await page.keyboard.press('Delete');
        await sleep(200);
        await page.keyboard.type(ABOUT, { delay: 2 });
        aboutDone = true;
        console.log('  >>> ABOUT FILLED via CE <<<');
      }

      // Try textbox role
      if (!aboutDone && aboutFieldInfo.textboxRoles.length > 0) {
        const tb = aboutFieldInfo.textboxRoles[0];
        await page.mouse.click(tb.x + 50, tb.y + 10);
        await sleep(300);
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await sleep(200);
        await page.keyboard.press('Delete');
        await page.keyboard.type(ABOUT, { delay: 2 });
        aboutDone = true;
        console.log('  >>> ABOUT FILLED via textbox <<<');
      }

      if (aboutDone) {
        await snap(page, 'about-filled');
        await sleep(rand(1500, 2500));
        // Save
        const sp = await page.evaluate(() => {
          for (const b of document.querySelectorAll('button')) {
            if (b.textContent.trim() === 'Save') {
              const r = b.getBoundingClientRect();
              if (r.width > 30) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            }
          }
          return null;
        });
        if (sp) {
          await page.mouse.click(sp.x, sp.y);
          console.log('  >>> ABOUT SAVED! <<<');
          await sleep(rand(3000, 5000));
        }
      } else {
        console.log('  No editable field found for About');
      }
    } else {
      console.log('  About edit button not found');
    }

    // ============================================================
    // 3. VERIFY
    // ============================================================
    console.log('\n[VERIFY]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 8000));
    await snap(page, 'FINAL');

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
