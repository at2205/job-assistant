const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);
let snapN = 0;
async function snap(page, label) { snapN++; const f = `exp-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

// Helper: find and click element by text
async function clickByText(page, text, tag = '*', minY = 0) {
  const pos = await page.evaluate(({ text, tag, minY }) => {
    for (const el of document.querySelectorAll(tag)) {
      const t = el.textContent.trim();
      if (t === text || t.includes(text)) {
        const r = el.getBoundingClientRect();
        if (r.width > 5 && r.y >= minY && r.y < 768) {
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
    }
    return null;
  }, { text, tag, minY });
  if (pos) {
    await page.mouse.click(pos.x, pos.y);
    return true;
  }
  return false;
}

// Helper: fill a field by label text
async function fillFieldByLabel(page, labelText, value) {
  const fieldInfo = await page.evaluate((labelText) => {
    for (const label of document.querySelectorAll('label')) {
      if (label.textContent.trim().toLowerCase().includes(labelText.toLowerCase())) {
        const forId = label.getAttribute('for');
        if (forId) {
          const input = document.getElementById(forId);
          if (input) {
            const r = input.getBoundingClientRect();
            return { id: forId, tag: input.tagName, x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }
        // Try sibling
        let parent = label.parentElement;
        for (let i = 0; i < 4 && parent; i++) {
          const input = parent.querySelector('input, textarea, [contenteditable="true"], [role="textbox"]');
          if (input && input !== label) {
            const r = input.getBoundingClientRect();
            return { id: input.id, tag: input.tagName, x: r.x + r.width / 2, y: r.y + r.height / 2, ce: input.contentEditable === 'true' };
          }
          parent = parent.parentElement;
        }
      }
    }
    return null;
  }, labelText);

  if (!fieldInfo) {
    console.log(`    Field "${labelText}" not found`);
    return false;
  }

  console.log(`    Found "${labelText}" - <${fieldInfo.tag}> id="${fieldInfo.id}"`);

  if (fieldInfo.id) {
    const el = await page.$(`[id="${fieldInfo.id}"]`);
    if (el) {
      await el.scrollIntoViewIfNeeded();
      await sleep(300);
      await el.click();
      await sleep(200);
      if (fieldInfo.tag === 'INPUT' || fieldInfo.tag === 'TEXTAREA') {
        await el.fill(value);
      } else {
        // contenteditable
        await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
        await sleep(100);
        await page.keyboard.type(value, { delay: 3 });
      }
      return true;
    }
  }

  // Fallback: click coordinates
  await page.mouse.click(fieldInfo.x, fieldInfo.y);
  await sleep(300);
  await page.keyboard.type(value, { delay: 5 });
  return true;
}

// Helper: fill typeahead (type text, wait, click first suggestion)
async function fillTypeahead(page, labelText, searchText) {
  const filled = await fillFieldByLabel(page, labelText, '');
  if (!filled) return false;

  // Type search text
  await page.keyboard.type(searchText, { delay: 40 });
  await sleep(3000); // Wait for typeahead dropdown

  // Click first suggestion
  const sugg = await page.evaluate(() => {
    for (const el of document.querySelectorAll('[role="option"], [role="listbox"] [role="option"]')) {
      const r = el.getBoundingClientRect();
      if (r.width > 50 && r.y > 0 && r.y < 768) {
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), text: el.textContent.trim().substring(0, 50) };
      }
    }
    return null;
  });

  if (sugg) {
    console.log(`    Selected: "${sugg.text}"`);
    await page.mouse.click(sugg.x, sugg.y);
    await sleep(1000);
    return true;
  }

  console.log(`    No typeahead suggestion found for "${searchText}"`);
  return false;
}

const EXPERIENCE = {
  title: 'Java Developer',
  company: 'FindiBANKIT',
  startMonth: 'August',
  startYear: '2024',
  description: `• Developed scalable REST APIs using Spring Boot handling 10,000+ daily financial transactions with 99.9% uptime
• Migrated 3 legacy Struts-based modules to Spring Boot microservices, reducing response latency by 25%
• Built insurance marketplace backend (FindiInsure) with multi-role JWT authentication and PostgreSQL
• Designed AEPS Agent Onboarding System with AES-256 encryption for biometric fintech workflows
• Implemented automated testing pipelines and CI/CD workflows using Docker and GitHub Actions
• Integrated third-party payment and KYC APIs, handling secure data exchange for financial compliance`
};

async function main() {
  console.log('=== LinkedIn Experience Updater ===\n');

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
    // Check if Experience section already exists
    // ============================================================
    const hasExperience = await page.evaluate(() => {
      for (const h2 of document.querySelectorAll('h2')) {
        if (h2.textContent.trim() === 'Experience') return true;
      }
      return false;
    });

    if (hasExperience) {
      console.log('[EXP] Experience section already exists. Looking for edit button...');
      // Scroll to Experience section
      await page.evaluate(() => {
        for (const h2 of document.querySelectorAll('h2')) {
          if (h2.textContent.trim() === 'Experience') {
            h2.scrollIntoView({ block: 'center' });
          }
        }
      });
      await sleep(2000);
      await snap(page, 'existing-experience');

      // Click edit/pencil on the experience entry
      const editExpBtn = await page.evaluate(() => {
        for (const h2 of document.querySelectorAll('h2')) {
          if (h2.textContent.trim() === 'Experience') {
            const section = h2.closest('section');
            if (!section) continue;
            // Find the first list item's edit button
            for (const btn of section.querySelectorAll('button')) {
              const label = btn.getAttribute('aria-label') || '';
              if (label.toLowerCase().includes('edit') && !label.toLowerCase().includes('reorder')) {
                const r = btn.getBoundingClientRect();
                if (r.width > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2, label };
              }
            }
          }
        }
        return null;
      });

      if (editExpBtn) {
        console.log('  Clicking edit: "' + editExpBtn.label + '"');
        await page.mouse.click(editExpBtn.x, editExpBtn.y);
        await sleep(rand(3000, 5000));
        await snap(page, 'edit-experience-form');
      }
    } else {
      console.log('[EXP] No Experience section. Adding via "Add section" > Core > "Add position"...');

      // Click "Add section" button
      const clicked = await clickByText(page, 'Add section', 'button', 300);
      if (!clicked) {
        console.log('  "Add section" not found!');
        await context.close(); return;
      }
      await sleep(rand(2000, 3000));
      await snap(page, 'add-section-modal');

      // Expand "Core" section
      const coreClicked = await clickByText(page, 'Core', '*', 50);
      if (coreClicked) {
        await sleep(rand(1500, 2500));
        await snap(page, 'core-expanded');
      }

      // Click "Add position"
      const posClicked = await clickByText(page, 'Add position', '*', 50);
      if (!posClicked) {
        console.log('  "Add position" not found!');
        await context.close(); return;
      }
      await sleep(rand(3000, 5000));
      await snap(page, 'add-position-form');
    }

    // ============================================================
    // Now we should have the Add/Edit Experience form open
    // Scan all visible form fields
    // ============================================================
    console.log('\n[FILL FORM]');

    // Scan the form
    const formFields = await page.evaluate(() => {
      const fields = [];
      document.querySelectorAll('label').forEach(label => {
        const r = label.getBoundingClientRect();
        if (r.width > 30 && r.y > 0 && r.y < 768) {
          fields.push({ text: label.textContent.trim(), y: Math.round(r.y), forId: label.getAttribute('for') });
        }
      });
      return fields;
    });

    console.log('  Form fields visible:');
    formFields.forEach(f => console.log(`    "${f.text}" y=${f.y} for="${f.forId}"`));

    await snap(page, 'form-fields');

    // Fill Title
    console.log('\n  Filling Title...');
    await fillFieldByLabel(page, 'Title', EXPERIENCE.title);
    await sleep(rand(500, 1000));

    // Fill Company (typeahead)
    console.log('\n  Filling Company...');
    await fillTypeahead(page, 'Company', EXPERIENCE.company);
    await sleep(rand(500, 1000));

    await snap(page, 'title-company-filled');

    // Scroll form down to find more fields
    await page.evaluate(() => {
      document.querySelectorAll('div').forEach(d => {
        const r = d.getBoundingClientRect();
        if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
          d.scrollTop += 300;
        }
      });
    });
    await sleep(1500);

    // Check for date fields
    const dateFields = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('select, input[type="month"]')).map(el => {
        const r = el.getBoundingClientRect();
        let label = '';
        if (el.id) {
          const lbl = document.querySelector(`label[for="${el.id}"]`);
          if (lbl) label = lbl.textContent.trim();
        }
        return { tag: el.tagName, id: el.id, label, y: Math.round(r.y), w: Math.round(r.width), options: el.tagName === 'SELECT' ? Array.from(el.options).map(o => o.text).slice(0,5) : [] };
      }).filter(f => f.w > 30 && f.y > 0 && f.y < 768);
    });

    console.log('\n  Date/select fields:');
    dateFields.forEach(f => console.log(`    <${f.tag}> label="${f.label}" id="${f.id}" opts=${JSON.stringify(f.options)}`));

    await snap(page, 'form-scrolled');

    // Look for Description field
    console.log('\n  Looking for Description field...');

    // Scroll more to find description
    await page.evaluate(() => {
      document.querySelectorAll('div').forEach(d => {
        const r = d.getBoundingClientRect();
        if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
          d.scrollTop += 400;
        }
      });
    });
    await sleep(1500);

    await snap(page, 'form-scrolled-more');

    // Find Description - it's likely a contenteditable div (TipTap)
    const descField = await page.evaluate(() => {
      // Search for "Description" label
      for (const label of document.querySelectorAll('label, span, div')) {
        const text = label.textContent.trim();
        if (text === 'Description' || text === 'Description*') {
          // Find nearby contenteditable or textarea
          let parent = label.parentElement;
          for (let i = 0; i < 6 && parent; i++) {
            const ce = parent.querySelector('[contenteditable="true"], [role="textbox"], textarea');
            if (ce) {
              const r = ce.getBoundingClientRect();
              return { x: r.x + 50, y: r.y + 15, w: r.width, h: r.height, tag: ce.tagName, ce: ce.contentEditable };
            }
            parent = parent.parentElement;
          }
        }
      }
      // Fallback: find any large contenteditable
      for (const ce of document.querySelectorAll('[contenteditable="true"]')) {
        const r = ce.getBoundingClientRect();
        if (r.width > 300 && r.height > 50 && r.y > 0) {
          return { x: r.x + 50, y: r.y + 15, w: r.width, h: r.height, tag: ce.tagName, ce: 'true' };
        }
      }
      return null;
    });

    if (descField) {
      console.log('  Found Description: ' + JSON.stringify(descField));
      await page.mouse.click(descField.x, descField.y);
      await sleep(300);
      await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
      await sleep(200);
      await page.keyboard.press('Delete');
      await sleep(200);
      await page.keyboard.type(EXPERIENCE.description, { delay: 2 });
      console.log('  >>> DESCRIPTION FILLED <<<');
      await snap(page, 'description-filled');
    } else {
      console.log('  Description field NOT found yet. Listing all visible elements...');
      const allVisible = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('label, h2, h3, span, [contenteditable]')).filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 30 && r.y > 0 && r.y < 768 && el.textContent.trim().length < 60;
        }).map(el => ({
          tag: el.tagName, text: el.textContent.trim(), y: Math.round(el.getBoundingClientRect().y),
          ce: el.contentEditable
        }));
      });
      allVisible.forEach(v => console.log(`    <${v.tag}> "${v.text}" y=${v.y} ce=${v.ce}`));
    }

    // ============================================================
    // SAVE
    // ============================================================
    console.log('\n[SAVE]');
    await sleep(rand(1500, 2500));

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
          if (r.width > 30 && r.y > 100) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    });

    if (savePos) {
      await snap(page, 'before-save');
      await page.mouse.click(savePos.x, savePos.y);
      console.log('  >>> SAVE CLICKED <<<');
      await sleep(rand(5000, 8000));
      await snap(page, 'after-save');

      // Check for errors
      const errors = await page.evaluate(() => {
        for (const el of document.querySelectorAll('span, div')) {
          if (el.textContent.includes('required') || el.textContent.includes('error')) {
            const r = el.getBoundingClientRect();
            if (r.width > 30 && r.y > 0) return el.textContent.trim().substring(0, 80);
          }
        }
        return null;
      });

      if (errors) {
        console.log('  ERROR: ' + errors);
      } else {
        console.log('  Save likely succeeded!');
      }
    }

    // ============================================================
    // VERIFY
    // ============================================================
    console.log('\n[VERIFY]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 8000));

    // Scroll to find Experience section
    await page.evaluate(() => window.scrollTo(0, 800));
    await sleep(2000);
    await snap(page, 'verify-experience');

    const expCheck = await page.evaluate(() => {
      for (const h2 of document.querySelectorAll('h2')) {
        if (h2.textContent.trim() === 'Experience') return true;
      }
      return false;
    });

    console.log('  Experience section: ' + (expCheck ? '✓ EXISTS' : '✗ MISSING'));

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
