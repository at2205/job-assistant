const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);
let snapN = 0;
async function snap(page, label) { snapN++; const f = `expv3-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

const EXP_DESC = `• Developed scalable REST APIs using Spring Boot handling 10,000+ daily financial transactions with 99.9% uptime
• Migrated 3 legacy Struts-based modules to Spring Boot microservices, reducing response latency by 25%
• Built insurance marketplace backend (FindiInsure) with multi-role JWT authentication and PostgreSQL
• Designed AEPS Agent Onboarding System with AES-256 encryption for biometric fintech workflows
• Implemented automated testing pipelines and CI/CD workflows using Docker and GitHub Actions
• Integrated third-party payment and KYC APIs, handling secure data exchange for financial compliance`;

async function main() {
  console.log('=== LinkedIn Experience v3 ===\n');

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
    // Click the PROFILE "Add section" button (NOT the navbar one)
    // From screenshots: profile buttons are at y≈507-514
    // Multiple stacked <BUTTON> elements - pick the one that's inside
    // the main profile intro section (closest to h1 "Aryan Tomar")
    // ============================================================
    console.log('\n[ADD SECTION]');

    const addSectionBtn = await page.evaluate(() => {
      // Find the intro section with the name
      for (const h1 of document.querySelectorAll('h1')) {
        if (h1.textContent.trim().includes('Aryan Tomar')) {
          const section = h1.closest('section');
          if (!section) continue;
          // Now look for "Add section" button within this section
          for (const btn of section.querySelectorAll('button')) {
            if (btn.textContent.trim() === 'Add section') {
              const r = btn.getBoundingClientRect();
              if (r.width > 30) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            }
          }
        }
      }
      // Fallback: find button with y > 400
      for (const btn of document.querySelectorAll('button')) {
        if (btn.textContent.trim() === 'Add section') {
          const r = btn.getBoundingClientRect();
          if (r.y > 400 && r.width > 50) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    });

    if (!addSectionBtn) {
      console.log('  "Add section" not found in profile!');
      await snap(page, 'no-add-section');
      await context.close(); return;
    }

    console.log('  Found "Add section" at (' + Math.round(addSectionBtn.x) + ',' + Math.round(addSectionBtn.y) + ')');
    await page.mouse.click(addSectionBtn.x, addSectionBtn.y);
    await sleep(rand(2000, 3000));
    await snap(page, 'add-section-modal');

    // Expand "Core"
    console.log('  Expanding Core...');
    const coreBtn = await page.evaluate(() => {
      for (const el of document.querySelectorAll('button, div, h3')) {
        if (el.textContent.trim() === 'Core') {
          const r = el.getBoundingClientRect();
          if (r.width > 30 && r.y > 50 && r.y < 700) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    });

    if (coreBtn) {
      await page.mouse.click(coreBtn.x, coreBtn.y);
      await sleep(rand(1500, 2500));
      await snap(page, 'core-expanded');
    }

    // Click "Add position"
    console.log('  Clicking "Add position"...');
    const addPosBtn = await page.evaluate(() => {
      for (const el of document.querySelectorAll('li, button, a, div, span')) {
        const t = el.textContent.trim();
        if (t === 'Add position') {
          const r = el.getBoundingClientRect();
          if (r.width > 50 && r.y > 50 && r.y < 700) return { x: r.x + r.width / 2, y: r.y + r.height / 2, tag: el.tagName };
        }
      }
      return null;
    });

    if (!addPosBtn) {
      console.log('  "Add position" not found! Visible items:');
      const items = await page.evaluate(() => {
        const seen = new Set();
        return Array.from(document.querySelectorAll('li, button, a, span')).filter(el => {
          const r = el.getBoundingClientRect();
          const t = el.textContent.trim();
          if (t.length > 3 && t.length < 40 && r.y > 80 && r.y < 600 && r.width > 50 && !seen.has(t)) {
            seen.add(t);
            return true;
          }
          return false;
        }).map(el => ({ text: el.textContent.trim(), y: Math.round(el.getBoundingClientRect().y), tag: el.tagName }));
      });
      items.forEach(i => console.log(`    "${i.text}" <${i.tag}> y=${i.y}`));
      await context.close(); return;
    }

    console.log('  "Add position" at (' + Math.round(addPosBtn.x) + ',' + Math.round(addPosBtn.y) + ') <' + addPosBtn.tag + '>');
    await page.mouse.click(addPosBtn.x, addPosBtn.y);
    await sleep(rand(3000, 5000));
    await snap(page, 'position-form');

    // ============================================================
    // FILL THE POSITION FORM
    // ============================================================
    console.log('\n[FORM]');

    // List all labels
    const labels = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('label')).filter(l => {
        const r = l.getBoundingClientRect();
        return r.width > 30 && r.y > 0;
      }).map(l => ({
        text: l.textContent.trim(),
        forId: l.getAttribute('for'),
        y: Math.round(l.getBoundingClientRect().y)
      }));
    });

    console.log('  Labels:');
    labels.forEach(l => console.log(`    "${l.text}" for="${l.forId}" y=${l.y}`));

    // TITLE
    console.log('\n  [TITLE]');
    const titleLabel = labels.find(l => l.text.toLowerCase().includes('title'));
    if (titleLabel?.forId) {
      const el = await page.$(`#${CSS.escape(titleLabel.forId)}`);
      if (el) { await el.click(); await sleep(200); await el.fill('Java Developer'); console.log('  ✓ Title: Java Developer'); }
    }

    // EMPLOYMENT TYPE
    const empLabel = labels.find(l => l.text.toLowerCase().includes('employment'));
    if (empLabel?.forId) {
      const sel = await page.$(`#${CSS.escape(empLabel.forId)}`);
      if (sel) {
        await sel.selectOption({ label: 'Full-time' });
        console.log('  ✓ Employment: Full-time');
      }
    }

    // COMPANY
    console.log('\n  [COMPANY]');
    const compLabel = labels.find(l => l.text.toLowerCase().includes('company'));
    if (compLabel?.forId) {
      const el = await page.$(`#${CSS.escape(compLabel.forId)}`);
      if (el) {
        await el.click(); await sleep(200);
        await page.keyboard.type('FINDI Bankit Pvt Ltd', { delay: 40 });
        await sleep(3000);

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
          console.log('  No suggestion, pressing Escape');
          await page.keyboard.press('Escape');
        }
        await sleep(1000);
      }
    }

    await snap(page, 'title-company');

    // LOCATION
    const locLabel = labels.find(l => l.text.toLowerCase().includes('location'));
    if (locLabel?.forId) {
      const el = await page.$(`#${CSS.escape(locLabel.forId)}`);
      if (el) {
        await el.click(); await sleep(200);
        await page.keyboard.type('Ghaziabad, Uttar Pradesh, India', { delay: 30 });
        await sleep(2000);
        const sugg = await page.evaluate(() => {
          for (const opt of document.querySelectorAll('[role="option"]')) {
            const r = opt.getBoundingClientRect();
            if (r.width > 50 && r.y > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
          return null;
        });
        if (sugg) { await page.mouse.click(sugg.x, sugg.y); console.log('  ✓ Location set'); }
        else { await page.keyboard.press('Escape'); }
        await sleep(500);
      }
    }

    // DATES — scroll form to find Start date
    console.log('\n  [DATES]');
    await page.evaluate(() => {
      document.querySelectorAll('div').forEach(d => {
        const r = d.getBoundingClientRect();
        if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
          d.scrollTop += 300;
        }
      });
    });
    await sleep(1500);

    // Find Start month/year selects
    const dateSelects = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('select')).filter(s => {
        const r = s.getBoundingClientRect();
        return r.width > 30 && r.y > 0 && r.y < 768;
      }).map(s => {
        let label = '';
        if (s.id) { const lbl = document.querySelector(`label[for="${s.id}"]`); if (lbl) label = lbl.textContent.trim(); }
        return { id: s.id, label, y: Math.round(s.getBoundingClientRect().y), val: s.value, opts: Array.from(s.options).map(o => o.text).slice(0, 5) };
      });
    });

    console.log('  Date selects:');
    dateSelects.forEach(s => console.log(`    id="${s.id}" label="${s.label}" val="${s.val}" opts=${JSON.stringify(s.opts)}`));

    // Set start month to August
    const startMonth = dateSelects.find(s => s.label.toLowerCase().includes('start') && s.label.toLowerCase().includes('month'));
    if (startMonth) {
      const sel = await page.$(`#${CSS.escape(startMonth.id)}`);
      if (sel) { await sel.selectOption({ label: 'August' }); console.log('  ✓ Start month: August'); }
    }

    const startYear = dateSelects.find(s => s.label.toLowerCase().includes('start') && s.label.toLowerCase().includes('year'));
    if (startYear) {
      const sel = await page.$(`#${CSS.escape(startYear.id)}`);
      if (sel) { await sel.selectOption({ label: '2024' }); console.log('  ✓ Start year: 2024'); }
    }

    await snap(page, 'dates-filled');

    // DESCRIPTION — scroll more
    console.log('\n  [DESCRIPTION]');
    await page.evaluate(() => {
      document.querySelectorAll('div').forEach(d => {
        const r = d.getBoundingClientRect();
        if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
          d.scrollTop += 500;
        }
      });
    });
    await sleep(1500);
    await snap(page, 'scrolled-to-desc');

    // Find Description contenteditable
    const descEl = await page.evaluate(() => {
      for (const el of document.querySelectorAll('[contenteditable="true"], [role="textbox"]')) {
        const r = el.getBoundingClientRect();
        if (r.width > 300 && r.height >= 30 && r.y > 0 && r.y < 768) {
          return { x: r.x + 50, y: r.y + 15, w: r.width, h: r.height };
        }
      }
      return null;
    });

    if (descEl) {
      console.log('  Description CE found at (' + Math.round(descEl.x) + ',' + Math.round(descEl.y) + ')');
      await page.mouse.click(descEl.x, descEl.y);
      await sleep(500);

      // Type description
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
      console.log('  Description CE NOT found. Checking for textarea...');
      const ta = await page.evaluate(() => {
        for (const el of document.querySelectorAll('textarea')) {
          const r = el.getBoundingClientRect();
          if (r.width > 200 && r.y > 0) return { id: el.id, y: Math.round(r.y) };
        }
        return null;
      });
      console.log('  Textarea: ' + JSON.stringify(ta));
    }

    // ============================================================
    // SAVE
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
    }

    // ============================================================
    // VERIFY
    // ============================================================
    console.log('\n[VERIFY]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 8000));

    for (const y of [0, 500, 1000, 1500]) {
      await page.evaluate((p) => window.scrollTo(0, p), y);
      await sleep(1500);
    }
    await snap(page, 'verify');

    const expExists = await page.evaluate(() => {
      for (const h2 of document.querySelectorAll('h2')) {
        if (h2.textContent.trim() === 'Experience') return true;
      }
      return false;
    });
    console.log('  Experience: ' + (expExists ? '✓ EXISTS' : '✗ MISSING'));

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
