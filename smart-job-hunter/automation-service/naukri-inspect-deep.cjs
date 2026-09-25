/**
 * Naukri Modal Deep Inspector
 * ===========================
 * Clicks each edit button, waits for lightbox.flipOpen, then captures inner DOM.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.resolve(__dirname, 'sessions', 'naukri-session');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots', 'naukri-inspect');
const RESULTS_DIR = path.resolve(__dirname, 'results');
[SCREENSHOTS_DIR, RESULTS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('\n═══ NAUKRI MODAL DEEP INSPECTOR ═══\n');

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false, slowMo: 30,
    viewport: { width: 1920, height: 1080 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });

  const page = context.pages()[0] || await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  const findings = {};

  try {
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);

    if (page.url().includes('/nlogin')) { console.log('NOT LOGGED IN'); await context.close(); return; }
    console.log('Profile loaded.\n');

    // ═══════════════════════════════════════════
    // 1. HEADLINE MODAL
    // ═══════════════════════════════════════════
    console.log('── HEADLINE MODAL ──');

    // Click edit icon for Resume headline
    await page.evaluate(() => {
      const widgets = document.querySelectorAll('.widgetHead');
      for (const w of widgets) {
        if (w.textContent?.includes('Resume headline')) {
          const edit = w.querySelector('.edit');
          if (edit) edit.click();
        }
      }
    });
    await sleep(2000);

    // Check for lightbox that flipped open
    const headlineModal = await page.evaluate(() => {
      // The headline edit drawer
      const drawer = document.querySelector('.resumeHeadlineEdit');
      if (!drawer) return { found: false };

      const isOpen = !drawer.classList.contains('flipClose');
      const classes = drawer.className;

      // Get all inner form elements
      const inputs = [];
      drawer.querySelectorAll('input, textarea').forEach(el => {
        inputs.push({
          tag: el.tagName, type: el.type, name: el.name, id: el.id,
          placeholder: el.placeholder,
          class: el.className,
          value: el.value?.substring(0, 200),
          maxLength: el.maxLength,
        });
      });

      const buttons = [];
      drawer.querySelectorAll('button, input[type="button"], input[type="submit"], .save, .btn').forEach(btn => {
        buttons.push({
          tag: btn.tagName, text: btn.textContent?.trim(), value: btn.value,
          class: btn.className, type: btn.type, disabled: btn.disabled,
        });
      });

      // Get full inner HTML
      const html = drawer.innerHTML;

      return { found: true, isOpen, classes, inputs, buttons, html: html.substring(0, 3000) };
    });

    findings.headline = headlineModal;
    console.log(`  Found: ${headlineModal.found}, Open: ${headlineModal.isOpen}`);
    console.log(`  Classes: ${headlineModal.classes}`);
    console.log(`  Inputs: ${headlineModal.inputs?.length}`);
    headlineModal.inputs?.forEach(i => console.log(`    [${i.tag}] name="${i.name}" id="${i.id}" type="${i.type}" placeholder="${i.placeholder}" class="${i.class}" maxLen=${i.maxLength} value="${i.value}"`));
    console.log(`  Buttons: ${headlineModal.buttons?.length}`);
    headlineModal.buttons?.forEach(b => console.log(`    [${b.tag}] text="${b.text}" value="${b.value}" class="${b.class}" type="${b.type}" disabled=${b.disabled}`));

    // Write full HTML to separate file for analysis
    if (headlineModal.html) {
      fs.writeFileSync(path.join(RESULTS_DIR, 'headline-modal-html.txt'), headlineModal.html);
      console.log('  HTML saved to headline-modal-html.txt');
    }

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'headline-open.png') });

    // Close
    await page.evaluate(() => {
      const cross = document.querySelector('.resumeHeadlineEdit .crossIcon, .resumeHeadlineEdit .cross, .resumeHeadlineEdit [class*="Cross"]');
      if (cross) cross.click();
    });
    await sleep(1500);

    // If cross didn't work, try Escape
    const stillOpen = await page.evaluate(() => {
      const d = document.querySelector('.resumeHeadlineEdit');
      return d && !d.classList.contains('flipClose');
    });
    if (stillOpen) {
      await page.keyboard.press('Escape');
      await sleep(1500);
    }

    // ═══════════════════════════════════════════
    // 2. KEY SKILLS MODAL
    // ═══════════════════════════════════════════
    console.log('\n── KEY SKILLS MODAL ──');

    await page.evaluate(() => {
      const el = document.querySelector('.keySkills');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await sleep(2000);

    await page.evaluate(() => {
      const widgets = document.querySelectorAll('.widgetHead');
      for (const w of widgets) {
        if (w.textContent?.includes('Key skill')) {
          const edit = w.querySelector('.edit');
          if (edit) edit.click();
        }
      }
    });
    await sleep(2000);

    const skillsModal = await page.evaluate(() => {
      const drawer = document.querySelector('.keySkillsEdit');
      if (!drawer) return { found: false };

      const isOpen = !drawer.classList.contains('flipClose');

      const inputs = [];
      drawer.querySelectorAll('input, textarea').forEach(el => {
        inputs.push({
          tag: el.tagName, type: el.type, name: el.name, id: el.id,
          placeholder: el.placeholder, class: el.className,
          value: el.value?.substring(0, 100),
        });
      });

      const buttons = [];
      drawer.querySelectorAll('button, input[type="button"], input[type="submit"], .btn').forEach(btn => {
        buttons.push({
          tag: btn.tagName, text: btn.textContent?.trim(), value: btn.value,
          class: btn.className, type: btn.type, disabled: btn.disabled,
        });
      });

      // Existing skill chips
      const chips = [];
      drawer.querySelectorAll('.chip, [class*="chip"], [class*="tag"], .keySkillTag').forEach(c => {
        chips.push({ text: c.textContent?.trim(), class: c.className });
      });

      // Suggestion container
      const suggestContainer = drawer.querySelector('[class*="suggest"], [class*="autoComplete"], .dropdownSuggestion, ul');

      const html = drawer.innerHTML;
      return { found: true, isOpen, inputs, buttons, chips: chips.slice(0, 10), suggestContainerClass: suggestContainer?.className, html: html.substring(0, 3000) };
    });

    findings.skills = skillsModal;
    console.log(`  Found: ${skillsModal.found}, Open: ${skillsModal.isOpen}`);
    console.log(`  Inputs: ${skillsModal.inputs?.length}`);
    skillsModal.inputs?.forEach(i => console.log(`    [${i.tag}] name="${i.name}" id="${i.id}" placeholder="${i.placeholder}" class="${i.class}"`));
    console.log(`  Buttons: ${skillsModal.buttons?.length}`);
    skillsModal.buttons?.forEach(b => console.log(`    [${b.tag}] text="${b.text}" class="${b.class}" disabled=${b.disabled}`));
    console.log(`  Chips: ${skillsModal.chips?.length}`);
    skillsModal.chips?.forEach(c => console.log(`    "${c.text}" class="${c.class}"`));
    console.log(`  Suggest container: ${skillsModal.suggestContainerClass}`);

    if (skillsModal.html) {
      fs.writeFileSync(path.join(RESULTS_DIR, 'skills-modal-html.txt'), skillsModal.html);
      console.log('  HTML saved to skills-modal-html.txt');
    }

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'skills-open.png') });

    // Close
    await page.evaluate(() => {
      const cross = document.querySelector('.keySkillsEdit .crossIcon, .keySkillsEdit [class*="Cross"], .keySkillsEdit .cross');
      if (cross) cross.click();
    });
    await sleep(1500);
    await page.keyboard.press('Escape');
    await sleep(1500);

    // ═══════════════════════════════════════════
    // 3. PROFILE SUMMARY (sidebar link)
    // ═══════════════════════════════════════════
    console.log('\n── PROFILE SUMMARY EDIT ──');

    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1000);

    // Check if "Profile summary" link exists in sidebar
    const summaryLinkClicked = await page.evaluate(() => {
      // Try sidebar Quick Links
      const links = document.querySelectorAll('a');
      for (const a of links) {
        if (a.textContent?.trim().toLowerCase().includes('profile summary')) {
          a.click();
          return { clicked: true, text: a.textContent?.trim(), href: a.href };
        }
      }
      // Try "Add" buttons
      for (const a of links) {
        if (a.textContent?.trim() === 'Add' && a.closest('.profileSummary, [class*="summary"]')) {
          a.click();
          return { clicked: true, text: 'Add (summary)', href: a.href };
        }
      }
      return { clicked: false };
    });

    console.log(`  Link clicked: ${summaryLinkClicked.clicked} (${summaryLinkClicked.text})`);

    if (summaryLinkClicked.clicked) {
      await sleep(2500);

      const summaryModal = await page.evaluate(() => {
        // Check for profileSummaryEdit drawer or profileEditDrawer
        const drawers = [
          document.querySelector('.profileSummaryEdit'),
          document.querySelector('.profileEditDrawer:not(.flipClose):not(.resumeHeadlineEdit):not(.keySkillsEdit)'),
        ].filter(Boolean);

        // Also check for any lightbox that opened
        const lightboxes = document.querySelectorAll('.lightbox');
        const openLightboxes = [];
        lightboxes.forEach(lb => {
          if (!lb.classList.contains('flipClose')) {
            const inputs = [];
            lb.querySelectorAll('input, textarea').forEach(el => {
              inputs.push({
                tag: el.tagName, type: el.type, name: el.name, id: el.id,
                placeholder: el.placeholder, class: el.className,
                value: el.value?.substring(0, 200),
              });
            });
            const buttons = [];
            lb.querySelectorAll('button, .btn').forEach(btn => {
              buttons.push({
                text: btn.textContent?.trim(), class: btn.className,
                type: btn.type, disabled: btn.disabled,
              });
            });
            openLightboxes.push({
              class: lb.className, inputs, buttons,
              html: lb.innerHTML?.substring(0, 2000),
            });
          }
        });

        // Check for any visible textarea on the page (inline edit)
        const visibleTextareas = [];
        document.querySelectorAll('textarea').forEach(ta => {
          if (ta.offsetParent !== null || ta.offsetHeight > 0) {
            visibleTextareas.push({
              name: ta.name, id: ta.id, class: ta.className,
              placeholder: ta.placeholder, value: ta.value?.substring(0, 200),
              rows: ta.rows,
            });
          }
        });

        return { drawers: drawers.length, openLightboxes, visibleTextareas };
      });

      findings.summary = summaryModal;
      console.log(`  Open lightboxes: ${summaryModal.openLightboxes.length}`);
      summaryModal.openLightboxes.forEach((lb, i) => {
        console.log(`  Lightbox ${i + 1}: class="${lb.class}"`);
        console.log(`    Inputs: ${lb.inputs.length}`);
        lb.inputs.forEach(inp => console.log(`      [${inp.tag}] name="${inp.name}" placeholder="${inp.placeholder}" class="${inp.class}" value="${inp.value}"`));
        console.log(`    Buttons: ${lb.buttons.length}`);
        lb.buttons.forEach(b => console.log(`      text="${b.text}" class="${b.class}" disabled=${b.disabled}`));
      });
      console.log(`  Visible textareas: ${summaryModal.visibleTextareas.length}`);
      summaryModal.visibleTextareas.forEach(t => console.log(`    name="${t.name}" id="${t.id}" class="${t.class}" placeholder="${t.placeholder}"`));

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'summary-open.png') });

      // Save HTML
      if (summaryModal.openLightboxes[0]?.html) {
        fs.writeFileSync(path.join(RESULTS_DIR, 'summary-modal-html.txt'), summaryModal.openLightboxes[0].html);
      }

      await page.keyboard.press('Escape');
      await sleep(1500);
    }

    // ═══════════════════════════════════════════
    // 4. PROFILE HEADER EDIT (name pencil)
    // ═══════════════════════════════════════════
    console.log('\n── PROFILE HEADER EDIT (pencil) ──');
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1500);

    await page.evaluate(() => {
      // The pencil icon near the name — it's an EM with class "icon edit"
      const pencil = document.querySelector('em.icon.edit, .icon.edit');
      if (pencil) pencil.click();
    });
    await sleep(2500);

    const headerModal = await page.evaluate(() => {
      const openLightboxes = [];
      document.querySelectorAll('.lightbox').forEach(lb => {
        if (lb.classList.contains('flipClose')) return;

        const inputs = [];
        lb.querySelectorAll('input, textarea, select').forEach(el => {
          // Find associated label
          let label = '';
          const formGroup = el.closest('.formRow, .form-group, .field, [class*="form"]');
          if (formGroup) {
            const labelEl = formGroup.querySelector('label, .label, .formLabel');
            label = labelEl?.textContent?.trim() || '';
          }

          inputs.push({
            tag: el.tagName, type: el.type || el.tagName.toLowerCase(),
            name: el.name, id: el.id,
            placeholder: el.placeholder, class: el.className,
            value: el.value?.substring(0, 150),
            label,
          });
        });

        const buttons = [];
        lb.querySelectorAll('button, .btn, input[type="submit"]').forEach(btn => {
          buttons.push({
            text: btn.textContent?.trim()?.substring(0, 30) || btn.value,
            class: btn.className, type: btn.type, disabled: btn.disabled,
          });
        });

        openLightboxes.push({
          class: lb.className, inputs, buttons,
          html: lb.innerHTML?.substring(0, 4000),
        });
      });

      return { openLightboxes };
    });

    findings.headerEdit = headerModal;
    console.log(`  Open lightboxes: ${headerModal.openLightboxes.length}`);
    headerModal.openLightboxes.forEach((lb, i) => {
      console.log(`\n  Lightbox ${i + 1}: class="${lb.class}"`);
      console.log(`    Inputs: ${lb.inputs.length}`);
      lb.inputs.forEach(inp => console.log(`      [${inp.tag}] label="${inp.label}" name="${inp.name}" id="${inp.id}" type="${inp.type}" placeholder="${inp.placeholder}" class="${inp.class}" value="${inp.value}"`));
      console.log(`    Buttons: ${lb.buttons.length}`);
      lb.buttons.forEach(b => console.log(`      text="${b.text}" class="${b.class}" disabled=${b.disabled}`));

      // Save HTML
      if (lb.html) {
        fs.writeFileSync(path.join(RESULTS_DIR, `header-modal-html-${i}.txt`), lb.html);
        console.log(`    HTML saved to header-modal-html-${i}.txt`);
      }
    });

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'header-edit-open.png') });
    await page.keyboard.press('Escape');
    await sleep(1500);

    // Save all findings
    fs.writeFileSync(path.join(RESULTS_DIR, 'naukri-modal-deep-findings.json'), JSON.stringify(findings, null, 2));
    console.log(`\n💾 All findings saved to results/naukri-modal-deep-findings.json`);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'deep-error.png') }).catch(() => {});
  } finally {
    await sleep(2000);
    await context.close();
  }
}

main().catch(console.error);
