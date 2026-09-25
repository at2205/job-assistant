const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);
let snapN = 0;
async function snap(page, label) { snapN++; const f = `expv4-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

const EXP_DESC = `• Developed scalable REST APIs using Spring Boot handling 10,000+ daily financial transactions with 99.9% uptime
• Migrated 3 legacy Struts-based modules to Spring Boot microservices, reducing response latency by 25%
• Built insurance marketplace backend (FindiInsure) with multi-role JWT authentication and PostgreSQL
• Designed AEPS Agent Onboarding System with AES-256 encryption for biometric fintech workflows
• Implemented automated testing pipelines and CI/CD workflows using Docker and GitHub Actions
• Integrated third-party payment and KYC APIs, handling secure data exchange for financial compliance`;

async function main() {
  console.log('=== LinkedIn Experience v4 ===\n');

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
    // STEP 1: Click "Add section" at known coordinates (267, 524)
    // ============================================================
    console.log('\n[ADD SECTION]');
    console.log('  Clicking "Add section" at (267, 524)...');
    await page.mouse.click(267, 524);
    await sleep(rand(2000, 3000));
    await snap(page, 'after-add-section-click');

    // Verify modal opened - check for "Core" text
    const hasCore = await page.evaluate(() => {
      for (const el of document.querySelectorAll('button, div, h3, span')) {
        if (el.textContent.trim() === 'Core') return true;
      }
      return false;
    });

    if (!hasCore) {
      console.log('  Modal not open. Let me find "Add section" more carefully...');
      // Debug: what elements are at the button area?
      const atPoint = await page.evaluate(() => {
        const els = [];
        for (let y = 500; y <= 540; y += 5) {
          const el = document.elementFromPoint(267, y);
          if (el) els.push({ y, tag: el.tagName, text: el.textContent.trim().substring(0, 30), classes: el.className?.toString().substring(0, 40) });
        }
        return els;
      });
      console.log('  Elements at x=267:');
      atPoint.forEach(e => console.log(`    y=${e.y} <${e.tag}> "${e.text}" cls="${e.classes}"`));

      // Try clicking the element directly
      const addBtn = await page.evaluate(() => {
        for (const btn of document.querySelectorAll('button')) {
          const t = btn.textContent.trim();
          if (t === 'Add section' || t === 'Add to profile') {
            const r = btn.getBoundingClientRect();
            if (r.y > 200 && r.width > 50) return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: t, rY: Math.round(r.y) };
          }
        }
        return null;
      });
      console.log('  Found button: ' + JSON.stringify(addBtn));
      if (addBtn) {
        await page.mouse.click(addBtn.x, addBtn.y);
        await sleep(2000);
      } else {
        await context.close(); return;
      }
    } else {
      console.log('  Modal opened!');
    }
    await snap(page, 'modal-state');

    // ============================================================
    // STEP 2: Expand "Core" and click "Add position"
    // ============================================================
    console.log('\n[CORE -> ADD POSITION]');

    // Check if Core is already expanded
    let hasCoreExpanded = await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) {
        if (el.textContent.trim() === 'Add position') {
          const r = el.getBoundingClientRect();
          if (r.y > 50 && r.y < 700 && r.width > 50) return true;
        }
      }
      return false;
    });

    if (!hasCoreExpanded) {
      // Click Core to expand
      const coreEl = await page.evaluate(() => {
        for (const el of document.querySelectorAll('button, div, h3')) {
          if (el.textContent.trim() === 'Core') {
            const r = el.getBoundingClientRect();
            if (r.width > 30 && r.y > 50) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }
        return null;
      });
      if (coreEl) {
        await page.mouse.click(coreEl.x, coreEl.y);
        await sleep(rand(1500, 2500));
      }
    }

    await snap(page, 'core-state');

    // Click "Add position"
    const addPosEl = await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) {
        if (el.textContent.trim() === 'Add position') {
          const r = el.getBoundingClientRect();
          if (r.y > 50 && r.y < 700 && r.width > 50) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    });

    if (!addPosEl) {
      console.log('  "Add position" still not found!');
      await context.close(); return;
    }

    console.log('  Clicking "Add position"...');
    await page.mouse.click(addPosEl.x, addPosEl.y);
    await sleep(rand(3000, 5000));
    await snap(page, 'position-form');

    // ============================================================
    // STEP 3: FILL THE FORM
    // ============================================================
    console.log('\n[FORM]');

    // List all form labels
    const labels = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('label')).filter(l => l.getBoundingClientRect().width > 30).map(l => ({
        text: l.textContent.trim(), forId: l.getAttribute('for'), y: Math.round(l.getBoundingClientRect().y)
      }));
    });
    console.log('  Labels: ' + labels.map(l => `"${l.text}"`).join(', '));

    // Fill Title
    for (const l of labels) {
      if (l.text.toLowerCase().includes('title') && l.forId) {
        const el = await page.$(`[id="${l.forId}"]`);
        if (el) { await el.click(); await sleep(200); await el.fill('Java Developer'); console.log('  ✓ Title'); await sleep(500); }
        break;
      }
    }

    // Fill Company (typeahead)
    for (const l of labels) {
      if (l.text.toLowerCase().includes('company') && l.forId) {
        const el = await page.$(`[id="${l.forId}"]`);
        if (el) {
          await el.click(); await sleep(200);
          await page.keyboard.type('FINDI Bankit', { delay: 40 });
          await sleep(3000);
          const sugg = await page.evaluate(() => {
            for (const opt of document.querySelectorAll('[role="option"]')) {
              const r = opt.getBoundingClientRect();
              if (r.width > 50 && r.y > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: opt.textContent.trim().substring(0, 50) };
            }
            return null;
          });
          if (sugg) { await page.mouse.click(sugg.x, sugg.y); console.log('  ✓ Company: ' + sugg.text); }
          else { await page.keyboard.press('Escape'); console.log('  Company typed (no suggestion)'); }
          await sleep(1000);
        }
        break;
      }
    }

    await snap(page, 'title-company');

    // Scroll form down for more fields
    const scrollModal = async (amount) => {
      await page.evaluate((amt) => {
        document.querySelectorAll('div').forEach(d => {
          const r = d.getBoundingClientRect();
          if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
            d.scrollTop += amt;
          }
        });
      }, amount);
      await sleep(1500);
    };

    // Look for and fill remaining fields
    await scrollModal(300);

    // Re-scan labels
    const labels2 = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('label')).filter(l => {
        const r = l.getBoundingClientRect();
        return r.width > 30 && r.y > 0 && r.y < 768;
      }).map(l => ({ text: l.textContent.trim(), forId: l.getAttribute('for'), y: Math.round(l.getBoundingClientRect().y) }));
    });
    console.log('  Labels after scroll: ' + labels2.map(l => `"${l.text}"`).join(', '));

    // Fill dates
    for (const l of labels2) {
      if ((l.text.toLowerCase().includes('start') && l.text.toLowerCase().includes('month')) && l.forId) {
        const sel = await page.$(`[id="${l.forId}"]`);
        if (sel) { await sel.selectOption({ label: 'August' }); console.log('  ✓ Start month: August'); }
      }
      if ((l.text.toLowerCase().includes('start') && l.text.toLowerCase().includes('year')) && l.forId) {
        const sel = await page.$(`[id="${l.forId}"]`);
        if (sel) { await sel.selectOption({ label: '2024' }); console.log('  ✓ Start year: 2024'); }
      }
    }

    // "I currently work here" checkbox
    const currentlyWork = await page.evaluate(() => {
      for (const label of document.querySelectorAll('label')) {
        if (label.textContent.trim().toLowerCase().includes('currently work')) {
          const checkbox = label.querySelector('input[type="checkbox"]') ||
                          label.parentElement?.querySelector('input[type="checkbox"]');
          if (checkbox && !checkbox.checked) {
            const r = label.getBoundingClientRect();
            return { x: r.x + 10, y: r.y + r.height / 2 };
          }
        }
      }
      return null;
    });
    if (currentlyWork) {
      await page.mouse.click(currentlyWork.x, currentlyWork.y);
      console.log('  ✓ "I currently work here" checked');
      await sleep(500);
    }

    await snap(page, 'dates-filled');

    // Scroll to Description
    await scrollModal(500);
    await snap(page, 'scrolled-to-desc');

    // Fill Description
    console.log('\n  [DESCRIPTION]');
    const descCE = await page.evaluate(() => {
      for (const el of document.querySelectorAll('[contenteditable="true"], [role="textbox"]')) {
        const r = el.getBoundingClientRect();
        // Filter out small ones (headline, search bars, etc.)
        if (r.width > 300 && r.height >= 30 && r.y > 0 && r.y < 768) {
          // Make sure this one is in a modal/form context
          const parent = el.closest('form, [role="dialog"], [class*="modal"]');
          return { x: r.x + 50, y: r.y + 15, w: Math.round(r.width), h: Math.round(r.height) };
        }
      }
      return null;
    });

    if (descCE) {
      console.log('  Description CE: ' + JSON.stringify(descCE));
      await page.mouse.click(descCE.x, descCE.y);
      await sleep(500);

      const lines = EXP_DESC.split('\n');
      for (let i = 0; i < lines.length; i++) {
        await page.keyboard.type(lines[i], { delay: 2 });
        if (i < lines.length - 1) {
          await page.keyboard.press('Enter');
          await sleep(50);
        }
      }
      console.log('  >>> DESCRIPTION FILLED <<<');
      await snap(page, 'desc-filled');
    } else {
      console.log('  Description CE NOT FOUND. Listing all CE elements...');
      const ces = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[contenteditable="true"]')).map(el => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y), text: el.textContent.substring(0, 30) };
        });
      });
      console.log('  CEs: ' + JSON.stringify(ces));
    }

    // ============================================================
    // STEP 4: SAVE
    // ============================================================
    console.log('\n[SAVE]');
    await sleep(rand(1500, 2500));

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

      // Handle any follow-up prompts
      const promptBtns = await page.evaluate(() => {
        const btns = [];
        for (const b of document.querySelectorAll('button')) {
          const t = b.textContent.trim();
          if (['No thanks', 'Skip', 'Done', 'Not now'].includes(t)) {
            const r = b.getBoundingClientRect();
            if (r.width > 30) btns.push({ text: t, x: r.x + r.width / 2, y: r.y + r.height / 2 });
          }
        }
        return btns;
      });
      for (const btn of promptBtns) {
        console.log('  Clicking "' + btn.text + '"');
        await page.mouse.click(btn.x, btn.y);
        await sleep(2000);
      }
    }

    // ============================================================
    // VERIFY
    // ============================================================
    console.log('\n[VERIFY]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 8000));
    await snap(page, 'verify-top');

    // Scroll through profile
    for (const y of [500, 1000, 1500, 2000, 2500]) {
      await page.evaluate((p) => window.scrollTo(0, p), y);
      await sleep(1500);
    }
    await snap(page, 'verify-scrolled');

    // Check for Experience
    const sections = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim());
    });
    console.log('  Sections: ' + JSON.stringify(sections));
    console.log('  Experience: ' + (sections.includes('Experience') ? '✓' : '✗'));

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
