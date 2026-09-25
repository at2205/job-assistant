const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const HEADLINE = 'Backend Engineer | Java + Spring Boot | Building AI-Powered Career Automation Platform';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);
let snapN = 0;
async function snap(page, label) { snapN++; const f = `v14-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

async function main() {
  console.log('=== LinkedIn Profile v14 — Fix Industry + Headline ===\n');

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
    // 1. Open Edit Intro modal
    // ============================================================
    console.log('\n[EDIT INTRO]');
    console.log('  Clicking pencil...');
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
    await snap(page, 'modal-scrolled');

    // ============================================================
    // 2. Fill HEADLINE (contenteditable div with role="textbox")
    // ============================================================
    console.log('\n[HEADLINE]');

    // Find the contenteditable with "Attended SRM" text
    const headlineEl = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.includes('Attended SRM') || node.textContent.includes('Backend Engineer')) {
          let el = node.parentElement;
          while (el) {
            if (el.contentEditable === 'true' && el.getAttribute('role') === 'textbox') {
              const r = el.getBoundingClientRect();
              return { x: r.x + 50, y: r.y + 10, w: r.width, h: r.height };
            }
            el = el.parentElement;
          }
        }
      }
      return null;
    });

    if (headlineEl) {
      console.log('  Found headline CE at (' + Math.round(headlineEl.x) + ',' + Math.round(headlineEl.y) + ')');
      await page.mouse.click(headlineEl.x, headlineEl.y);
      await sleep(300);
      await page.mouse.click(headlineEl.x, headlineEl.y, { clickCount: 3 });
      await sleep(300);

      // Type the new headline
      await page.keyboard.type(HEADLINE, { delay: 8 });
      await sleep(500);
      console.log('  >>> HEADLINE SET <<<');
      await snap(page, 'headline-filled');
    } else {
      console.log('  Headline element not found!');
    }

    // ============================================================
    // 3. Fill INDUSTRY (required field that blocked the save)
    //    From v13-4 screenshot: Industry is a search input at (678, 97)
    //    with error "Industry is a required field"
    // ============================================================
    console.log('\n[INDUSTRY]');

    // Scroll modal to show Industry field
    await page.evaluate(() => {
      document.querySelectorAll('div').forEach(d => {
        const r = d.getBoundingClientRect();
        if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
          d.scrollTop += 200; // scroll more to show Industry
        }
      });
    });
    await sleep(1500);
    await snap(page, 'scrolled-to-industry');

    // Find Industry input
    const industryInput = await page.evaluate(() => {
      // Look for label "Industry*" or "Industry"
      for (const label of document.querySelectorAll('label')) {
        if (label.textContent.trim().includes('Industry')) {
          const forId = label.getAttribute('for');
          if (forId) {
            const input = document.getElementById(forId);
            if (input) {
              const r = input.getBoundingClientRect();
              return { id: forId, x: r.x + r.width / 2, y: r.y + r.height / 2, val: input.value };
            }
          }
          // Try sibling
          const parent = label.closest('div');
          if (parent) {
            const input = parent.querySelector('input');
            if (input) {
              const r = input.getBoundingClientRect();
              return { id: input.id, x: r.x + r.width / 2, y: r.y + r.height / 2, val: input.value };
            }
          }
        }
      }
      return null;
    });

    if (industryInput) {
      console.log('  Found Industry input: id="' + industryInput.id + '" val="' + industryInput.val + '"');

      if (!industryInput.val) {
        // Click the industry input
        await page.mouse.click(industryInput.x, industryInput.y);
        await sleep(500);

        // Type "Software Development"
        await page.keyboard.type('Software Development', { delay: 30 });
        await sleep(2000); // Wait for dropdown
        await snap(page, 'industry-dropdown');

        // Click first suggestion
        const suggestion = await page.evaluate(() => {
          // Look for dropdown options
          for (const el of document.querySelectorAll('[role="option"], [role="listbox"] li, .basic-typeahead__selectable')) {
            const r = el.getBoundingClientRect();
            if (r.width > 50 && r.height > 10 && r.y > 0) {
              return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: el.textContent.trim().substring(0, 50) };
            }
          }
          // Also try any clickable list items
          for (const el of document.querySelectorAll('li, div[role]')) {
            const text = el.textContent.trim();
            if (text.includes('Software Development') && !text.includes('Industry')) {
              const r = el.getBoundingClientRect();
              if (r.width > 50 && r.height > 10) return { x: r.x + r.width / 2, y: r.y + r.height / 2, text };
            }
          }
          return null;
        });

        if (suggestion) {
          console.log('  Selecting: "' + suggestion.text + '"');
          await page.mouse.click(suggestion.x, suggestion.y);
          await sleep(1000);
          console.log('  >>> INDUSTRY SET <<<');
        } else {
          // Press Enter to accept first suggestion
          console.log('  No suggestion found, pressing Enter...');
          await page.keyboard.press('ArrowDown');
          await sleep(300);
          await page.keyboard.press('Enter');
          await sleep(1000);
        }
        await snap(page, 'industry-set');
      } else {
        console.log('  Industry already set: "' + industryInput.val + '"');
      }
    } else {
      console.log('  Industry input not found (might need to scroll)');
      // Try scrolling down more
      await page.evaluate(() => {
        document.querySelectorAll('div').forEach(d => {
          const r = d.getBoundingClientRect();
          if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
            d.scrollTop += 300;
          }
        });
      });
      await sleep(1500);

      // Try again
      const retry = await page.evaluate(() => {
        for (const label of document.querySelectorAll('label')) {
          if (label.textContent.trim().includes('Industry')) {
            const parent = label.closest('div')?.parentElement;
            const input = parent?.querySelector('input');
            if (input) {
              const r = input.getBoundingClientRect();
              return { id: input.id, x: r.x + r.width / 2, y: r.y + r.height / 2 };
            }
          }
        }
        return null;
      });

      if (retry) {
        console.log('  Found Industry after extra scroll');
        await page.mouse.click(retry.x, retry.y);
        await sleep(500);
        await page.keyboard.type('Software Development', { delay: 30 });
        await sleep(2000);
        await page.keyboard.press('ArrowDown');
        await sleep(300);
        await page.keyboard.press('Enter');
        await sleep(1000);
        console.log('  >>> INDUSTRY SET <<<');
      }
    }

    // ============================================================
    // 4. SAVE
    // ============================================================
    console.log('\n[SAVE]');
    await sleep(rand(1000, 2000));

    // Scroll to Save button
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

      // Check if there's still an error
      const hasError = await page.evaluate(() => {
        for (const el of document.querySelectorAll('span, div, p')) {
          if (el.textContent.includes('required field')) return el.textContent.trim().substring(0, 60);
        }
        return null;
      });

      if (hasError) {
        console.log('  ERROR still present: "' + hasError + '"');
      } else {
        console.log('  No errors — save likely succeeded!');
      }
    }

    // ============================================================
    // 5. VERIFY
    // ============================================================
    console.log('\n[VERIFY]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 8000));
    await snap(page, 'FINAL');

    // Check headline
    const profileData = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const name = h1 ? h1.textContent.trim() : 'N/A';
      // The subtitle text right below name
      let headline = 'N/A';
      const subtitleEl = h1?.parentElement?.querySelector('div:not(:first-child)');
      if (subtitleEl) headline = subtitleEl.textContent.trim();
      // Fallback
      if (headline === 'N/A' || headline === name) {
        const allText = h1?.parentElement?.parentElement?.textContent || '';
        const lines = allText.split('\n').map(l => l.trim()).filter(l => l && l !== name && l.length > 5 && l.length < 200);
        headline = lines[0] || 'N/A';
      }
      return { name, headline: headline.substring(0, 120) };
    });

    console.log('\n  Name:     ' + profileData.name);
    console.log('  Headline: ' + profileData.headline);
    console.log('  Status:   ' + (profileData.headline.includes('Backend Engineer') ? '✓ UPDATED!' : '✗ NOT UPDATED'));

    // Check About
    await page.evaluate(() => window.scrollTo(0, 500));
    await sleep(1500);
    await snap(page, 'FINAL-scroll');

    const aboutText = await page.evaluate(() => {
      for (const h2 of document.querySelectorAll('h2')) {
        if (h2.textContent.trim() === 'About') {
          const section = h2.closest('section');
          if (section) {
            const spans = section.querySelectorAll('span');
            for (const s of spans) {
              if (s.textContent.length > 50) return s.textContent.substring(0, 100);
            }
          }
        }
      }
      return 'N/A';
    });

    console.log('  About:    ' + aboutText.substring(0, 80));
    console.log('  About ok: ' + (aboutText.includes('build backend') ? '✓ UPDATED!' : '✗ CHECK'));

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
