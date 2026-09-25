const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);
let snapN = 0;
async function snap(page, label) { snapN++; const f = `expv2-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

const EXP_DESC = `• Developed scalable REST APIs using Spring Boot handling 10,000+ daily financial transactions with 99.9% uptime
• Migrated 3 legacy Struts-based modules to Spring Boot microservices, reducing response latency by 25%
• Built insurance marketplace backend (FindiInsure) with multi-role JWT authentication and PostgreSQL
• Designed AEPS Agent Onboarding System with AES-256 encryption for biometric fintech workflows
• Implemented automated testing pipelines and CI/CD workflows using Docker and GitHub Actions
• Integrated third-party payment and KYC APIs, handling secure data exchange for financial compliance`;

async function main() {
  console.log('=== LinkedIn Experience v2 ===\n');

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

    // ============================================================
    // Navigate directly to Add Experience page
    // ============================================================
    console.log('\n[ADD EXPERIENCE]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 7000));

    // Find and click "Add section" with no minY filter
    console.log('  Looking for "Add section"...');
    const addSectionPos = await page.evaluate(() => {
      for (const el of document.querySelectorAll('button, a, [role="button"]')) {
        if (el.textContent.trim() === 'Add section') {
          const r = el.getBoundingClientRect();
          if (r.width > 30) return { x: r.x + r.width / 2, y: r.y + r.height / 2, tag: el.tagName };
        }
      }
      return null;
    });

    console.log('  Add section: ' + JSON.stringify(addSectionPos));

    if (addSectionPos) {
      await page.mouse.click(addSectionPos.x, addSectionPos.y);
      await sleep(rand(2000, 3000));
      await snap(page, 'add-section-modal');

      // Click "Core" to expand
      const corePos = await page.evaluate(() => {
        for (const el of document.querySelectorAll('button, div, span, h3')) {
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
      }

      // Click "Add position"
      const addPosPos = await page.evaluate(() => {
        for (const el of document.querySelectorAll('button, a, li, div, span')) {
          const t = el.textContent.trim();
          if (t === 'Add position' || t === 'Add Position') {
            const r = el.getBoundingClientRect();
            if (r.width > 50 && r.y > 50 && r.y < 700) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }
        return null;
      });

      if (addPosPos) {
        console.log('  Clicking "Add position"...');
        await page.mouse.click(addPosPos.x, addPosPos.y);
        await sleep(rand(3000, 5000));
        await snap(page, 'add-position-form');
      } else {
        console.log('  "Add position" not found!');
        // List all visible items
        const items = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('button, a, li, span')).filter(el => {
            const r = el.getBoundingClientRect();
            return r.width > 50 && r.y > 50 && r.y < 700 && el.textContent.trim().length > 3 && el.textContent.trim().length < 40;
          }).map(el => ({ text: el.textContent.trim(), y: Math.round(el.getBoundingClientRect().y) }));
        });
        items.forEach(i => console.log(`    "${i.text}" y=${i.y}`));
        await context.close();
        return;
      }
    } else {
      console.log('  "Add section" button not found! Trying scroll...');
      await page.evaluate(() => window.scrollTo(0, 300));
      await sleep(1500);

      const retry = await page.evaluate(() => {
        for (const el of document.querySelectorAll('button, a, [role="button"]')) {
          if (el.textContent.trim() === 'Add section') {
            const r = el.getBoundingClientRect();
            if (r.width > 30) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }
        return null;
      });

      if (!retry) {
        console.log('  Still not found!'); await context.close(); return;
      }

      await page.mouse.click(retry.x, retry.y);
      await sleep(2000);
      // ... would continue but let's simplify
    }

    // ============================================================
    // FILL THE ADD POSITION FORM
    // ============================================================
    console.log('\n[FORM]');

    // Scan ALL form fields
    const allLabels = await page.evaluate(() => {
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
    allLabels.forEach(l => console.log(`    "${l.text}" y=${l.y} for="${l.forId}"`));

    // Fill Title
    console.log('\n  [TITLE]');
    const titleInput = allLabels.find(l => l.text.includes('Title'));
    if (titleInput && titleInput.forId) {
      const el = await page.$(`[id="${titleInput.forId}"]`);
      if (el) {
        await el.click();
        await sleep(200);
        await el.fill('Java Developer');
        console.log('  Set: Java Developer');
        await sleep(500);
      }
    }

    // Fill Company name (typeahead)
    console.log('\n  [COMPANY]');
    const companyInput = allLabels.find(l => l.text.includes('Company'));
    if (companyInput && companyInput.forId) {
      const el = await page.$(`[id="${companyInput.forId}"]`);
      if (el) {
        await el.click();
        await sleep(200);
        await el.fill('');
        await page.keyboard.type('FindiBANKIT', { delay: 40 });
        await sleep(3000);
        await snap(page, 'company-typeahead');

        // Select suggestion
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
          await sleep(1000);
        } else {
          console.log('  No suggestion, keeping typed text');
          await page.keyboard.press('Escape');
          await sleep(500);
        }
      }
    }

    await snap(page, 'after-title-company');

    // Scroll form to see date fields and Description
    await page.evaluate(() => {
      document.querySelectorAll('div').forEach(d => {
        const r = d.getBoundingClientRect();
        if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
          d.scrollTop += 400;
        }
      });
    });
    await sleep(1500);
    await snap(page, 'form-scrolled');

    // Log visible labels after scroll
    const scrolledLabels = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('label')).filter(l => {
        const r = l.getBoundingClientRect();
        return r.width > 30 && r.y > 0 && r.y < 768;
      }).map(l => ({
        text: l.textContent.trim(),
        forId: l.getAttribute('for'),
        y: Math.round(l.getBoundingClientRect().y)
      }));
    });

    console.log('\n  Labels after scroll:');
    scrolledLabels.forEach(l => console.log(`    "${l.text}" y=${l.y} for="${l.forId}"`));

    // Find and fill Description (contenteditable div)
    console.log('\n  [DESCRIPTION]');

    // Scroll more if needed to find Description
    await page.evaluate(() => {
      document.querySelectorAll('div').forEach(d => {
        const r = d.getBoundingClientRect();
        if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
          d.scrollTop += 400;
        }
      });
    });
    await sleep(1500);
    await snap(page, 'form-scrolled-2');

    // Find Description contenteditable
    const descPos = await page.evaluate(() => {
      for (const el of document.querySelectorAll('[contenteditable="true"], [role="textbox"]')) {
        const r = el.getBoundingClientRect();
        if (r.width > 300 && r.height > 30 && r.y > 0 && r.y < 768) {
          // Check if it's near a "Description" label
          return { x: r.x + 50, y: r.y + 15, w: r.width, h: r.height };
        }
      }
      return null;
    });

    if (descPos) {
      console.log('  Found CE: ' + JSON.stringify(descPos));
      await page.mouse.click(descPos.x, descPos.y);
      await sleep(500);
      await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
      await sleep(200);
      await page.keyboard.press('Delete');
      await sleep(200);

      // Type description line by line for reliability
      const lines = EXP_DESC.split('\n');
      for (let i = 0; i < lines.length; i++) {
        await page.keyboard.type(lines[i], { delay: 2 });
        if (i < lines.length - 1) {
          await page.keyboard.press('Enter');
          await sleep(100);
        }
      }

      console.log('  >>> DESCRIPTION FILLED <<<');
      await snap(page, 'description-filled');
    } else {
      console.log('  Description CE not found!');
      // List all large visible elements
      const bigEls = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('*')).filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 300 && r.height > 30 && r.y > 0 && r.y < 768 &&
                 (el.contentEditable === 'true' || el.tagName === 'TEXTAREA' || el.getAttribute('role') === 'textbox');
        }).map(el => ({
          tag: el.tagName, ce: el.contentEditable, role: el.getAttribute('role'),
          y: Math.round(el.getBoundingClientRect().y), h: Math.round(el.getBoundingClientRect().height)
        }));
      });
      console.log('  Large editable elements: ' + JSON.stringify(bigEls));
    }

    // ============================================================
    // SAVE
    // ============================================================
    console.log('\n[SAVE]');
    await sleep(rand(1500, 2500));

    // Scroll to Save
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
          if (r.width > 30 && r.y > 100) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    });

    if (savePos) {
      await page.mouse.click(savePos.x, savePos.y);
      console.log('  >>> SAVE CLICKED <<<');
      await sleep(rand(5000, 8000));
      await snap(page, 'after-save');

      // Handle discard dialog if it appears
      const hasDiscard = await page.evaluate(() => {
        for (const b of document.querySelectorAll('button')) {
          if (b.textContent.trim() === 'No thanks') {
            const r = b.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }
        return null;
      });
      if (hasDiscard) {
        console.log('  Dismissing discard dialog...');
        await page.mouse.click(hasDiscard.x, hasDiscard.y);
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

    // Scroll down
    for (const y of [500, 1000, 1500, 2000]) {
      await page.evaluate((p) => window.scrollTo(0, p), y);
      await sleep(1500);
    }
    await snap(page, 'verify-scrolled');

    const hasExp = await page.evaluate(() => {
      for (const h2 of document.querySelectorAll('h2')) {
        if (h2.textContent.trim() === 'Experience') return true;
      }
      return false;
    });

    console.log('  Experience section: ' + (hasExp ? '✓ EXISTS' : '✗ MISSING'));

    console.log('\n  Browser open 60s...');
    await sleep(60000);

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
