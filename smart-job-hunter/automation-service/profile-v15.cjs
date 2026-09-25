const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const HEADLINE = 'Backend Engineer | Java + Spring Boot | Building AI-Powered Career Automation Platform';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);
let snapN = 0;
async function snap(page, label) { snapN++; const f = `v15-${snapN}-${label}.png`; await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) }); console.log(`  [SNAP] ${f}`); }

async function main() {
  console.log('=== LinkedIn Profile v15 — Industry First, Then Headline ===\n');

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
    await page.mouse.click(866, 315);
    await sleep(rand(5000, 7000));
    await snap(page, 'modal-opened');

    // ============================================================
    // 2. INDUSTRY FIRST (fill required field before headline)
    //    Scroll modal all the way down to find Industry
    // ============================================================
    console.log('\n[INDUSTRY]');

    // Scroll modal to bottom to see all fields
    await page.evaluate(() => {
      document.querySelectorAll('div').forEach(d => {
        const r = d.getBoundingClientRect();
        if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
          d.scrollTop = 600; // scroll past headline to industry area
        }
      });
    });
    await sleep(2000);
    await snap(page, 'scrolled-to-industry');

    // Enumerate ALL visible form fields with their labels
    const allFields = await page.evaluate(() => {
      const fields = [];
      document.querySelectorAll('input, textarea, select').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width < 30 || r.y < 0 || r.y > 768) return;
        let label = '';
        if (el.id) {
          const lbl = document.querySelector(`label[for="${el.id}"]`);
          if (lbl) label = lbl.textContent.trim();
        }
        if (!label) {
          let p = el.parentElement;
          for (let i = 0; i < 6 && p && !label; i++) {
            const lbl = p.querySelector('label');
            if (lbl) label = lbl.textContent.trim();
            p = p.parentElement;
          }
        }
        fields.push({
          tag: el.tagName, id: el.id, label,
          type: el.type || '', value: (el.value || '').substring(0, 50),
          x: Math.round(r.x + r.width / 2),
          y: Math.round(r.y + r.height / 2),
        });
      });
      return fields;
    });

    console.log('  Visible fields:');
    allFields.forEach((f, i) => console.log(`    [${i}] <${f.tag}> label="${f.label}" id="${f.id}" val="${f.value}" at (${f.x},${f.y})`));

    // Find Industry input by label
    const industryField = allFields.find(f => f.label.toLowerCase().includes('industry'));

    if (industryField) {
      console.log('  Found Industry: id="' + industryField.id + '" val="' + industryField.value + '"');

      if (!industryField.value || industryField.value.trim() === '') {
        // Click the industry input
        const inp = await page.$(`[id="${industryField.id}"]`);
        if (inp) {
          await inp.scrollIntoViewIfNeeded();
          await sleep(500);
          await inp.click();
          await sleep(500);

          // Clear and type
          await inp.fill('');
          await sleep(200);
          await page.keyboard.type('Software Development', { delay: 40 });
          await sleep(3000); // Wait for typeahead dropdown
          await snap(page, 'industry-typeahead');

          // Find and click the first suggestion in the dropdown
          const suggestion = await page.evaluate(() => {
            // LinkedIn typeahead uses role="option" or listbox items
            const options = document.querySelectorAll('[role="option"], [role="listbox"] [role="option"], li[id*="option"]');
            for (const opt of options) {
              const r = opt.getBoundingClientRect();
              if (r.width > 50 && r.height > 10 && r.y > 0 && r.y < 768) {
                return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), text: opt.textContent.trim().substring(0, 50) };
              }
            }
            // Also try data-* list items
            const listItems = document.querySelectorAll('.basic-typeahead__selectable, [class*="typeahead"] li, [class*="suggestion"]');
            for (const li of listItems) {
              const r = li.getBoundingClientRect();
              if (r.width > 50 && r.y > 0) {
                return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), text: li.textContent.trim().substring(0, 50) };
              }
            }
            return null;
          });

          if (suggestion) {
            console.log('  Selecting suggestion: "' + suggestion.text + '"');
            await page.mouse.click(suggestion.x, suggestion.y);
            await sleep(1000);
            console.log('  >>> INDUSTRY SET <<<');
          } else {
            console.log('  No dropdown suggestion found. Trying keyboard selection...');
            // Tab or Enter might work
            await page.keyboard.press('ArrowDown');
            await sleep(500);
            await snap(page, 'industry-arrow-down');

            // Check for discard dialog before pressing Enter
            const hasDiscard = await page.evaluate(() => {
              for (const el of document.querySelectorAll('button')) {
                if (el.textContent.trim() === 'Discard') return true;
              }
              return false;
            });

            if (hasDiscard) {
              console.log('  WARNING: Discard dialog appeared! Clicking "No thanks"...');
              const noThanks = await page.evaluate(() => {
                for (const b of document.querySelectorAll('button')) {
                  if (b.textContent.trim() === 'No thanks') {
                    const r = b.getBoundingClientRect();
                    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
                  }
                }
                return null;
              });
              if (noThanks) {
                await page.mouse.click(noThanks.x, noThanks.y);
                await sleep(1000);
                console.log('  Dismissed discard dialog');
              }
            } else {
              await page.keyboard.press('Enter');
              await sleep(1000);
            }
          }
          await snap(page, 'industry-after');
        }
      } else {
        console.log('  Industry already has value: "' + industryField.value + '"');
      }
    } else {
      console.log('  Industry field not visible. Fields found:');
      allFields.forEach(f => console.log('    ' + f.label));
    }

    // ============================================================
    // 3. HEADLINE — scroll back up to fill it
    // ============================================================
    console.log('\n[HEADLINE]');

    // Check for Discard dialog first
    const discardCheck = await page.evaluate(() => {
      for (const b of document.querySelectorAll('button')) {
        if (b.textContent.trim() === 'No thanks') {
          const r = b.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return false;
    });
    if (discardCheck) {
      console.log('  Dismissing discard dialog...');
      await page.mouse.click(discardCheck.x, discardCheck.y);
      await sleep(1000);
    }

    // Check if modal is still open
    const modalStillOpen = await page.evaluate(() => {
      for (const l of document.querySelectorAll('label')) {
        if (l.textContent.includes('First name')) return true;
      }
      // Also check by "Edit intro" heading
      for (const h of document.querySelectorAll('h1, h2, h3')) {
        if (h.textContent.trim().includes('Edit intro')) return true;
      }
      return false;
    });

    if (!modalStillOpen) {
      console.log('  Modal closed. Reopening...');
      await page.mouse.click(866, 315);
      await sleep(rand(5000, 7000));
    }

    // Scroll modal to show Headline
    await page.evaluate(() => {
      document.querySelectorAll('div').forEach(d => {
        const r = d.getBoundingClientRect();
        if (r.height > 200 && r.height < 700 && d.scrollHeight > d.clientHeight + 50) {
          d.scrollTop = 350; // scroll to headline area
        }
      });
    });
    await sleep(2000);
    await snap(page, 'headline-area');

    // Find headline contenteditable
    const headlinePos = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.includes('Attended SRM') || node.textContent.includes('Backend Engineer')) {
          let el = node.parentElement;
          while (el) {
            if (el.contentEditable === 'true') {
              const r = el.getBoundingClientRect();
              return { x: r.x + 50, y: r.y + 10, w: r.width, h: r.height, text: el.textContent.substring(0, 50) };
            }
            el = el.parentElement;
          }
        }
      }
      return null;
    });

    if (headlinePos) {
      console.log('  Headline CE found: "' + headlinePos.text + '" at (' + Math.round(headlinePos.x) + ',' + Math.round(headlinePos.y) + ')');
      await page.mouse.click(headlinePos.x, headlinePos.y);
      await sleep(300);
      await page.mouse.click(headlinePos.x, headlinePos.y, { clickCount: 3 });
      await sleep(300);
      await page.keyboard.type(HEADLINE, { delay: 8 });
      await sleep(500);
      console.log('  >>> HEADLINE SET <<<');
      await snap(page, 'headline-filled');
    } else {
      console.log('  Headline CE not found!');
    }

    // ============================================================
    // 4. SAVE — scroll to Save and click
    // ============================================================
    console.log('\n[SAVE]');
    await sleep(rand(1000, 2000));

    // First check if Industry is now filled
    const industryCheck = await page.evaluate(() => {
      for (const label of document.querySelectorAll('label')) {
        if (label.textContent.trim().includes('Industry')) {
          const forId = label.getAttribute('for');
          if (forId) {
            const input = document.getElementById(forId);
            return input ? input.value : 'not found';
          }
        }
      }
      return 'label not found';
    });
    console.log('  Industry value: "' + industryCheck + '"');

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
          if (r.width > 30 && r.y > 100) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    });

    if (savePos) {
      await page.mouse.click(savePos.x, savePos.y);
      console.log('  >>> SAVE CLICKED <<<');
      await sleep(rand(3000, 5000));
      await snap(page, 'after-save-1');

      // Check for validation errors
      const errors = await page.evaluate(() => {
        const errs = [];
        for (const el of document.querySelectorAll('span, div, p')) {
          const text = el.textContent.trim();
          if (text.includes('required field') || text.includes('is required')) {
            errs.push(text.substring(0, 60));
          }
        }
        return errs;
      });

      if (errors.length > 0) {
        console.log('  Validation errors: ' + JSON.stringify(errors));

        // If Industry still required, try a different approach
        if (errors.some(e => e.includes('Industry'))) {
          console.log('  Industry still required. Trying to fill it...');

          // Scroll to Industry
          await page.evaluate(() => {
            for (const label of document.querySelectorAll('label')) {
              if (label.textContent.includes('Industry')) {
                label.scrollIntoView({ block: 'center' });
              }
            }
          });
          await sleep(1000);
          await snap(page, 'industry-error');

          // Find and fill the Industry input
          const indInput = await page.evaluate(() => {
            for (const label of document.querySelectorAll('label')) {
              if (label.textContent.trim().includes('Industry')) {
                // Search nearby for input
                let parent = label.parentElement;
                for (let i = 0; i < 5 && parent; i++) {
                  const input = parent.querySelector('input[type="text"], input:not([type])');
                  if (input) {
                    const r = input.getBoundingClientRect();
                    return { id: input.id, x: r.x + r.width / 2, y: r.y + r.height / 2 };
                  }
                  parent = parent.parentElement;
                }
              }
            }
            return null;
          });

          if (indInput) {
            await page.mouse.click(indInput.x, indInput.y);
            await sleep(500);
            await page.keyboard.type('Software Development', { delay: 40 });
            await sleep(3000);
            await snap(page, 'industry-retry-dropdown');

            // Try clicking first visible suggestion
            const sugg = await page.evaluate(() => {
              for (const el of document.querySelectorAll('[role="option"], [class*="typeahead"] li, [class*="suggestion"] li')) {
                const r = el.getBoundingClientRect();
                if (r.width > 50 && r.y > 0 && r.y < 768) {
                  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), text: el.textContent.trim().substring(0, 50) };
                }
              }
              return null;
            });

            if (sugg) {
              console.log('  Selecting: "' + sugg.text + '"');
              await page.mouse.click(sugg.x, sugg.y);
              await sleep(1000);
            }

            // Try Save again
            await sleep(1000);
            const save2 = await page.evaluate(() => {
              for (const b of document.querySelectorAll('button')) {
                if (b.textContent.trim() === 'Save') {
                  b.scrollIntoView();
                  const r = b.getBoundingClientRect();
                  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
                }
              }
              return null;
            });
            if (save2) {
              await page.mouse.click(save2.x, save2.y);
              console.log('  >>> SAVE ATTEMPT 2 <<<');
              await sleep(rand(5000, 8000));
            }
          }
        }
      } else {
        console.log('  No validation errors — save succeeded!');
      }
    }

    // ============================================================
    // 5. VERIFY
    // ============================================================
    console.log('\n[VERIFY]');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 8000));
    await snap(page, 'FINAL');

    // Read headline
    const headlineText = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      if (!h1) return 'N/A';
      const parent = h1.parentElement;
      const divs = parent ? parent.querySelectorAll('div') : [];
      for (const d of divs) {
        const t = d.textContent.trim();
        if (t && t !== h1.textContent.trim() && t.length > 5 && !t.includes('Contact') && !t.includes('connections')) {
          return t;
        }
      }
      return 'N/A';
    });

    console.log('\n  Headline: "' + headlineText.substring(0, 100) + '"');
    console.log('  Status:   ' + (headlineText.includes('Backend Engineer') ? '✓ UPDATED!' : '✗ NOT UPDATED'));

    await page.evaluate(() => window.scrollTo(0, 400));
    await sleep(1500);
    await snap(page, 'FINAL-about');

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
