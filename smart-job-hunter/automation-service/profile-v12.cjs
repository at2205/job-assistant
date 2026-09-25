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
async function snap(page, label) { snapN++; const f = `v12-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

async function main() {
  console.log('=== LinkedIn Profile v12 — Click Inside Textarea ===\n');

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
    // ============================================================
    console.log('\n[HEADLINE]');
    console.log('  Opening Edit Intro...');
    await page.mouse.click(866, 315);
    await sleep(rand(5000, 7000));

    // Verify modal
    const modalOpen = await page.evaluate(() => {
      for (const l of document.querySelectorAll('label')) {
        if (l.textContent.includes('First name')) return true;
      }
      return false;
    });
    console.log('  Modal: ' + (modalOpen ? 'OPEN' : 'CLOSED'));

    if (!modalOpen) {
      await page.mouse.click(866, 315);
      await sleep(5000);
    }

    // Scroll modal to show Headline textarea (less scroll than before)
    await page.evaluate(() => {
      document.querySelectorAll('div').forEach(d => {
        const r = d.getBoundingClientRect();
        if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
          d.scrollTop += 350;
        }
      });
    });
    await sleep(2000);
    await snap(page, 'modal-scrolled');

    // Debug: count textareas via evaluate
    const taDebug = await page.evaluate(() => {
      const all = document.querySelectorAll('textarea');
      return {
        count: all.length,
        details: Array.from(all).map(ta => ({
          id: ta.id,
          value: ta.value.substring(0, 50),
          rect: {
            x: Math.round(ta.getBoundingClientRect().x),
            y: Math.round(ta.getBoundingClientRect().y),
            w: Math.round(ta.getBoundingClientRect().width),
            h: Math.round(ta.getBoundingClientRect().height)
          }
        }))
      };
    });
    console.log('  Textarea debug (via evaluate): ' + JSON.stringify(taDebug));

    let headlineDone = false;

    if (taDebug.count > 0) {
      // Found textareas via evaluate — try to fill using native setter
      for (const ta of taDebug.details) {
        if (ta.value.includes('Attended') || ta.value.includes('SRM') || ta.value.includes('University') || ta.value.includes('Backend')) {
          console.log('  Found headline textarea via evaluate: id="' + ta.id + '" at y=' + ta.rect.y);

          // Method 1: Use native value setter (React-compatible)
          const setResult = await page.evaluate((newVal, taId) => {
            const textarea = document.getElementById(taId);
            if (!textarea) return { success: false, reason: 'not found by id' };
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            nativeSetter.call(textarea, newVal);
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            // Also dispatch React synthetic events
            textarea.dispatchEvent(new Event('blur', { bubbles: true }));
            return { success: true, newValue: textarea.value.substring(0, 50) };
          }, HEADLINE, ta.id);

          console.log('  Native setter result: ' + JSON.stringify(setResult));

          if (setResult.success) {
            headlineDone = true;

            // Also try clicking into it and using keyboard for good measure
            await page.mouse.click(ta.rect.x + ta.rect.w / 2, ta.rect.y + ta.rect.h / 2);
            await sleep(500);
            await snap(page, 'headline-after-set');
          }
          break;
        }
      }
    }

    if (!headlineDone) {
      // Textareas not found via evaluate either. Try clicking directly.
      // From v11-1 screenshot, the Headline textarea "Attended SRM University" is at:
      // x ≈ 678, y ≈ 545 (center of the textarea)
      console.log('  No textareas found. Clicking directly at textarea coordinates...');

      // First, take a screenshot to see current positions
      await snap(page, 'before-direct-click');

      // Find the exact position of the "Headline*" label and click below it
      const headlineLabelPos = await page.evaluate(() => {
        for (const el of document.querySelectorAll('label, span, div')) {
          const text = el.textContent.trim();
          if (text === 'Headline*' || text === 'Headline') {
            const r = el.getBoundingClientRect();
            if (r.width > 30 && r.y > 100) {
              return { x: r.x + 50, y: r.y + r.height + 30 }; // Below the label, inside textarea
            }
          }
        }
        return null;
      });

      if (headlineLabelPos) {
        console.log('  Found Headline label, clicking below at (' + Math.round(headlineLabelPos.x) + ',' + Math.round(headlineLabelPos.y) + ')');
        await page.mouse.click(headlineLabelPos.x, headlineLabelPos.y);
        await sleep(500);

        // Triple-click to select all in textarea
        await page.mouse.click(headlineLabelPos.x, headlineLabelPos.y, { clickCount: 3 });
        await sleep(300);
        await snap(page, 'text-selected');

        // Type the new headline
        await page.keyboard.type(HEADLINE, { delay: 8 });
        await sleep(500);
        headlineDone = true;
        console.log('  >>> HEADLINE TYPED: "' + HEADLINE + '" <<<');
        await snap(page, 'headline-typed');
      } else {
        console.log('  Headline label not found either!');
      }
    }

    if (headlineDone) {
      // Click Save
      await sleep(rand(1000, 2000));
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
        console.log('  >>> SAVE CLICKED! <<<');
        await sleep(rand(5000, 8000));
        await snap(page, 'after-save');
      }
    }

    // ============================================================
    // 2. ABOUT — Try scrolling the Edit Intro modal further down
    //    LinkedIn may have an About/Summary field BELOW the
    //    Current position, Industry, School, etc. fields.
    // ============================================================
    console.log('\n[ABOUT]');
    // If modal is still open or re-open it
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 7000));

    // Check if About section already exists on profile
    const aboutOnProfile = await page.evaluate(() => !!document.querySelector('#about'));
    console.log('  About on profile: ' + aboutOnProfile);

    if (!aboutOnProfile) {
      // Open Edit Intro again, scroll ALL the way down to see if Summary/About is there
      console.log('  Opening Edit Intro to look for Summary/About field...');
      await page.mouse.click(866, 315);
      await sleep(rand(5000, 7000));

      // Scroll modal ALL the way down
      await page.evaluate(() => {
        document.querySelectorAll('div').forEach(d => {
          const r = d.getBoundingClientRect();
          if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
            d.scrollTop = d.scrollHeight; // scroll to bottom
          }
        });
      });
      await sleep(2000);
      await snap(page, 'modal-bottom');

      // List all visible fields and labels at the bottom
      const bottomFields = await page.evaluate(() => {
        const result = [];
        document.querySelectorAll('label, h2, h3, span').forEach(el => {
          const r = el.getBoundingClientRect();
          const text = el.textContent.trim();
          if (r.width > 30 && r.y > 0 && r.y < 768 && text.length > 2 && text.length < 60) {
            result.push({ text, y: Math.round(r.y), tag: el.tagName });
          }
        });
        // dedup
        const seen = new Set();
        return result.filter(r => { if (seen.has(r.text)) return false; seen.add(r.text); return true; });
      });

      console.log('  Labels at bottom of modal:');
      bottomFields.forEach(f => console.log(`    "${f.text}" <${f.tag}> y=${f.y}`));

      // Close modal
      const closeBtn = await page.$('button[aria-label="Dismiss"], button[aria-label="Close"]');
      if (closeBtn) await closeBtn.click();
      await sleep(1000);
    }

    // ============================================================
    // 3. VERIFY
    // ============================================================
    console.log('\n[VERIFY]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 8000));
    await snap(page, 'FINAL');

    const subtitle = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      if (!h1) return 'N/A';
      // Look for text below name
      const parent = h1.closest('section') || h1.parentElement.parentElement.parentElement;
      if (!parent) return 'N/A';
      for (const d of parent.querySelectorAll('div')) {
        const t = d.textContent.trim();
        if (t && t !== h1.textContent.trim() && t.length > 5 && t.length < 200 &&
            !t.includes('connections') && !t.includes('Contact') &&
            !t.includes('Open to') && !t.includes('Add section') &&
            !t.includes('Enhance') && !t.includes('Resources') &&
            !t.includes('FindiBANKIT') && !t.includes('SRM University') &&
            !t.includes('Ghaziabad')) {
          return t;
        }
      }
      return 'N/A';
    });

    console.log('\n  Headline on profile: "' + subtitle.substring(0, 100) + '"');
    console.log('  Status: ' + (subtitle.includes('Backend Engineer') ? '✓ UPDATED!' : '✗ NOT UPDATED'));

    await page.evaluate(() => window.scrollTo(0, 500));
    await sleep(1500);
    await snap(page, 'FINAL-scroll');

    console.log('\n  Browser open 90s...');
    await sleep(90000);

  } catch (err) {
    console.error('[FATAL] ' + err.message);
    console.error(err.stack?.split('\n').slice(0, 3).join('\n'));
    await snap(page, 'fatal');
  } finally {
    await context.close();
    console.log('[DONE]');
  }
}

main();
