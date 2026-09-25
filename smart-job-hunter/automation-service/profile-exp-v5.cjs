const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);
let snapN = 0;
async function snap(page, label) { snapN++; const f = `expv5-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

const EXP_DESC = `• Developed scalable REST APIs using Spring Boot handling 10,000+ daily financial transactions with 99.9% uptime
• Migrated 3 legacy Struts-based modules to Spring Boot microservices, reducing response latency by 25%
• Built insurance marketplace backend (FindiInsure) with multi-role JWT authentication and PostgreSQL
• Designed AEPS Agent Onboarding System with AES-256 encryption for biometric fintech workflows
• Implemented automated testing pipelines and CI/CD workflows using Docker and GitHub Actions
• Integrated third-party payment and KYC APIs, handling secure data exchange for financial compliance`;

// Helper to scroll the modal
async function scrollModal(page, amount) {
  await page.evaluate((amt) => {
    document.querySelectorAll('div').forEach(d => {
      const r = d.getBoundingClientRect();
      if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
        d.scrollTop += amt;
      }
    });
  }, amount);
  await sleep(1500);
}

async function main() {
  console.log('=== LinkedIn Experience v5 — Fill All Fields ===\n');

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
    // Open Add Experience form
    // ============================================================
    console.log('\n[OPEN FORM]');
    await page.mouse.click(267, 524); // "Add section"
    await sleep(rand(2000, 3000));

    // Core -> Add position
    const coreBtn = await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) {
        if (el.textContent.trim() === 'Core') {
          const r = el.getBoundingClientRect();
          if (r.width > 30 && r.y > 50 && r.y < 700) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    });
    if (coreBtn) { await page.mouse.click(coreBtn.x, coreBtn.y); await sleep(1500); }

    const addPosBtn = await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) {
        if (el.textContent.trim() === 'Add position') {
          const r = el.getBoundingClientRect();
          if (r.y > 50 && r.y < 700 && r.width > 50) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    });
    if (addPosBtn) { await page.mouse.click(addPosBtn.x, addPosBtn.y); await sleep(rand(3000, 5000)); }
    else { console.log('  "Add position" not found!'); await context.close(); return; }

    await snap(page, 'form-opened');

    // ============================================================
    // FILL: Title (first input field with placeholder "Ex: Retail Sales Manager")
    // ============================================================
    console.log('\n[TITLE]');
    const titleInput = await page.$('input[placeholder*="Retail"]');
    if (titleInput) {
      await titleInput.click();
      await sleep(200);
      await titleInput.fill('Java Developer');
      console.log('  ✓ Java Developer');
    } else {
      // Fallback: first visible input in the form
      const firstInput = await page.evaluate(() => {
        for (const inp of document.querySelectorAll('input[type="text"], input:not([type])')) {
          const r = inp.getBoundingClientRect();
          if (r.width > 200 && r.y > 60 && r.y < 400) return { id: inp.id, ph: inp.placeholder?.substring(0, 30) };
        }
        return null;
      });
      console.log('  First input: ' + JSON.stringify(firstInput));
      if (firstInput?.id) {
        const el = await page.$(`[id="${firstInput.id}"]`);
        if (el) { await el.click(); await sleep(200); await el.fill('Java Developer'); console.log('  ✓ Java Developer (fallback)'); }
      }
    }
    await sleep(500);

    // ============================================================
    // FILL: Employment Type (select)
    // ============================================================
    console.log('\n[EMPLOYMENT]');
    const empSelect = await page.evaluate(() => {
      for (const label of document.querySelectorAll('label')) {
        if (label.textContent.trim() === 'Employment type') {
          const forId = label.getAttribute('for');
          if (forId) return forId;
        }
      }
      return null;
    });
    if (empSelect) {
      const sel = await page.$(`[id="${empSelect}"]`);
      if (sel) { await sel.selectOption({ label: 'Full-time' }); console.log('  ✓ Full-time'); }
    }
    await sleep(500);

    // ============================================================
    // FILL: Company (typeahead input with placeholder "Ex: Microsoft")
    // ============================================================
    console.log('\n[COMPANY]');
    const compInput = await page.$('input[placeholder*="Microsoft"]');
    if (compInput) {
      await compInput.click();
      await sleep(200);
      await page.keyboard.type('FINDI Bankit', { delay: 40 });
      await sleep(3000);
      await snap(page, 'company-typeahead');

      const sugg = await page.evaluate(() => {
        for (const opt of document.querySelectorAll('[role="option"]')) {
          const r = opt.getBoundingClientRect();
          if (r.width > 50 && r.y > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: opt.textContent.trim().substring(0, 50) };
        }
        return null;
      });

      if (sugg) {
        console.log('  Selected: ' + sugg.text);
        await page.mouse.click(sugg.x, sugg.y);
      } else {
        // Keep typed text, press Escape to close any typeahead
        console.log('  No suggestion - keeping typed text');
        await page.keyboard.press('Escape');
      }
      await sleep(1000);
    } else {
      console.log('  Company input not found by placeholder');
    }

    await snap(page, 'title-company-filled');

    // ============================================================
    // FILL: Start date (Month and Year selects)
    // From screenshot: "Start date" with Month and Year* dropdowns
    // ============================================================
    console.log('\n[DATES]');

    // Find all selects
    const selects = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('select')).map(s => {
        const r = s.getBoundingClientRect();
        let label = '';
        if (s.id) { const lbl = document.querySelector(`label[for="${s.id}"]`); if (lbl) label = lbl.textContent.trim(); }
        return { id: s.id, label, y: Math.round(r.y), val: s.value, visible: r.width > 30 && r.y > 0 && r.y < 768 };
      }).filter(s => s.visible);
    });

    console.log('  Selects: ' + selects.map(s => `"${s.label}" id=${s.id}`).join(', '));

    // Month select (labeled "Month")
    const monthSel = selects.find(s => s.label === 'Month');
    if (monthSel) {
      const sel = await page.$(`[id="${monthSel.id}"]`);
      if (sel) {
        await sel.selectOption({ label: 'August' });
        console.log('  ✓ Month: August');
      }
    }

    // Year select (labeled "Year*")
    const yearSel = selects.find(s => s.label.includes('Year'));
    if (yearSel) {
      const sel = await page.$(`[id="${yearSel.id}"]`);
      if (sel) {
        await sel.selectOption({ label: '2024' });
        console.log('  ✓ Year: 2024');
      }
    }

    await snap(page, 'dates-filled');

    // ============================================================
    // FILL: Description (contenteditable, needs scrolling)
    // From screenshot expv4-7: Description is a TipTap CE at the bottom
    // ============================================================
    console.log('\n[DESCRIPTION]');

    // Scroll modal to show Description
    await scrollModal(page, 500);
    await snap(page, 'scrolled-to-desc');

    // Find Description CE - look for it specifically
    const descResult = await page.evaluate(() => {
      // Method 1: find by "Description" label
      for (const el of document.querySelectorAll('label, span, div')) {
        if (el.textContent.trim() === 'Description') {
          const r = el.getBoundingClientRect();
          if (r.y > 0 && r.y < 768 && r.width > 30) {
            // Found label, now find the CE below it
            let parent = el.parentElement;
            for (let i = 0; i < 8 && parent; i++) {
              const ce = parent.querySelector('[contenteditable="true"], [role="textbox"]');
              if (ce && ce !== el) {
                const cr = ce.getBoundingClientRect();
                return { x: cr.x + 50, y: cr.y + 15, w: Math.round(cr.width), h: Math.round(cr.height), method: 'label' };
              }
              parent = parent.parentElement;
            }
          }
        }
      }
      // Method 2: find large CE
      for (const ce of document.querySelectorAll('[contenteditable="true"]')) {
        const r = ce.getBoundingClientRect();
        if (r.width > 300 && r.height > 30 && r.y > 0 && r.y < 768) {
          return { x: r.x + 50, y: r.y + 15, w: Math.round(r.width), h: Math.round(r.height), method: 'large-ce' };
        }
      }
      // Method 3: find role="textbox" that's not the headline
      for (const tb of document.querySelectorAll('[role="textbox"]')) {
        const r = tb.getBoundingClientRect();
        if (r.width > 300 && r.height > 30 && r.y > 0 && r.y < 768) {
          const text = tb.textContent.trim();
          if (!text.includes('Backend Engineer')) {
            return { x: r.x + 50, y: r.y + 15, w: Math.round(r.width), h: Math.round(r.height), method: 'textbox' };
          }
        }
      }
      return null;
    });

    if (descResult) {
      console.log('  Found Description: ' + JSON.stringify(descResult));
      await page.mouse.click(descResult.x, descResult.y);
      await sleep(500);

      // Type description
      const lines = EXP_DESC.split('\n');
      for (let i = 0; i < lines.length; i++) {
        await page.keyboard.type(lines[i], { delay: 2 });
        if (i < lines.length - 1) {
          await page.keyboard.press('Enter');
          await sleep(30);
        }
      }
      console.log('  >>> DESCRIPTION FILLED <<<');
      await snap(page, 'desc-filled');
    } else {
      console.log('  Description NOT found after scroll. Trying more scroll...');
      await scrollModal(page, 400);
      await snap(page, 'more-scroll');

      // Retry
      const retryDesc = await page.evaluate(() => {
        for (const ce of document.querySelectorAll('[contenteditable="true"], [role="textbox"]')) {
          const r = ce.getBoundingClientRect();
          if (r.width > 300 && r.height > 30 && r.y > 0 && r.y < 768) {
            const text = ce.textContent.trim();
            if (!text.includes('Backend Engineer')) {
              return { x: r.x + 50, y: r.y + 15, w: Math.round(r.width), h: Math.round(r.height) };
            }
          }
        }
        return null;
      });
      if (retryDesc) {
        await page.mouse.click(retryDesc.x, retryDesc.y);
        await sleep(500);
        const lines = EXP_DESC.split('\n');
        for (let i = 0; i < lines.length; i++) {
          await page.keyboard.type(lines[i], { delay: 2 });
          if (i < lines.length - 1) { await page.keyboard.press('Enter'); await sleep(30); }
        }
        console.log('  >>> DESCRIPTION FILLED (retry) <<<');
        await snap(page, 'desc-filled-retry');
      } else {
        console.log('  Still not found!');
      }
    }

    // ============================================================
    // SAVE
    // ============================================================
    console.log('\n[SAVE]');
    await sleep(rand(2000, 3000));

    // Scroll Save into view
    await page.evaluate(() => {
      for (const b of document.querySelectorAll('button')) {
        if (b.textContent.trim() === 'Save') b.scrollIntoView({ block: 'center' });
      }
    });
    await sleep(500);

    const saveBtn = await page.evaluate(() => {
      for (const b of document.querySelectorAll('button')) {
        if (b.textContent.trim() === 'Save') {
          const r = b.getBoundingClientRect();
          if (r.width > 30 && r.y > 100) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    });

    if (saveBtn) {
      await page.mouse.click(saveBtn.x, saveBtn.y);
      console.log('  >>> SAVE CLICKED <<<');
      await sleep(rand(5000, 8000));
      await snap(page, 'after-save');

      // Check for errors
      const errors = await page.evaluate(() => {
        const errs = [];
        for (const el of document.querySelectorAll('span, div')) {
          const t = el.textContent.trim();
          if (t.includes('required field') || t.includes('is required') || t.includes('are required')) {
            const r = el.getBoundingClientRect();
            if (r.width > 30 && r.y > 0) errs.push(t.substring(0, 60));
          }
        }
        return errs;
      });

      if (errors.length > 0) {
        console.log('  ERRORS: ' + JSON.stringify(errors));
      } else {
        console.log('  No errors — save succeeded!');

        // Dismiss any follow-up prompts
        for (const text of ['No thanks', 'Skip', 'Done', 'Not now', 'Got it']) {
          const btn = await page.evaluate((t) => {
            for (const b of document.querySelectorAll('button')) {
              if (b.textContent.trim() === t) {
                const r = b.getBoundingClientRect();
                if (r.width > 30) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
              }
            }
            return null;
          }, text);
          if (btn) {
            console.log('  Clicking "' + text + '"');
            await page.mouse.click(btn.x, btn.y);
            await sleep(2000);
          }
        }
      }
    }

    // ============================================================
    // VERIFY
    // ============================================================
    console.log('\n[VERIFY]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 8000));
    await snap(page, 'verify-top');

    // Scroll to find sections
    for (const y of [500, 1000, 1500, 2000, 2500]) {
      await page.evaluate((p) => window.scrollTo(0, p), y);
      await sleep(1200);
    }
    await snap(page, 'verify-scrolled');

    const allSections = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim()).filter(t => t.length < 50);
    });
    console.log('  Sections: ' + JSON.stringify(allSections));
    console.log('  Experience: ' + (allSections.includes('Experience') ? '✓ EXISTS' : '✗ MISSING'));

    console.log('\n  Browser open 60s...');
    await sleep(60000);

  } catch (err) {
    console.error('[FATAL] ' + err.message);
    await snap(page, 'fatal');
  } finally {
    await context.close();
    console.log('[DONE]');
  }
}

main();
