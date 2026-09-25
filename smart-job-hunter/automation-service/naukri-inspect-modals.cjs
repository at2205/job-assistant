/**
 * Naukri Modal DOM Inspector
 * ==========================
 * Reverse-engineers Naukri's React edit modals to find stable selectors.
 * Opens each edit section, captures DOM structure, and reports findings.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.resolve(__dirname, 'sessions', 'naukri-session');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots', 'naukri-inspect');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const RESULTS_DIR = path.resolve(__dirname, 'results');
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const randomDelay = (min, max) => sleep(min + Math.random() * (max - min));

async function main() {
  console.log('\n═══ NAUKRI MODAL DOM INSPECTOR ═══\n');

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    slowMo: 30,
    viewport: { width: 1920, height: 1080 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });

  const page = context.pages()[0] || await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const findings = {};

  try {
    // Navigate to profile
    console.log('Navigating to profile...');
    await page.goto('https://www.naukri.com/mnjuser/profile', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await randomDelay(4000, 6000);

    // Check login
    const url = page.url();
    if (url.includes('/nlogin')) {
      console.log('NOT LOGGED IN. Use naukri-optimizer.cjs first to establish session.');
      await context.close();
      return;
    }
    console.log('Logged in. Profile loaded.\n');

    // ═══════════════════════════════════════════
    // INSPECT 1: Full page DOM structure
    // ═══════════════════════════════════════════
    console.log('── INSPECTING FULL PAGE STRUCTURE ──');
    const pageStructure = await page.evaluate(() => {
      // Find all edit icons/buttons
      const editElements = [];
      document.querySelectorAll('[class*="edit"], [class*="Edit"], button, a').forEach(el => {
        const text = el.textContent?.trim().substring(0, 50);
        const cls = el.className?.toString().substring(0, 80);
        const tag = el.tagName;
        const aria = el.getAttribute('aria-label');
        const id = el.id;
        const onclick = el.getAttribute('onclick');
        if (cls?.toLowerCase().includes('edit') || text?.toLowerCase().includes('edit') ||
            aria?.toLowerCase().includes('edit') || cls?.toLowerCase().includes('pencil')) {
          editElements.push({ tag, id, class: cls, text, ariaLabel: aria, onclick });
        }
      });

      // Find all section headers with edit functionality
      const sections = [];
      document.querySelectorAll('.widgetHead, [class*="sectionHead"], [class*="section-head"]').forEach(el => {
        const text = el.textContent?.trim().substring(0, 60);
        const cls = el.className?.toString();
        const editIcon = el.querySelector('[class*="edit"], [class*="Edit"], .icon');
        sections.push({
          text,
          class: cls,
          hasEditIcon: !!editIcon,
          editIconClass: editIcon?.className?.toString(),
          editIconTag: editIcon?.tagName,
        });
      });

      // Find Quick Links sidebar
      const quickLinks = [];
      document.querySelectorAll('.quickLinks a, .quick-links a, [class*="quickLink"] a').forEach(el => {
        quickLinks.push({
          text: el.textContent?.trim(),
          href: el.href,
          class: el.className?.toString(),
        });
      });

      return { editElements, sections, quickLinks };
    });

    findings.pageStructure = pageStructure;
    console.log(`  Edit elements found: ${pageStructure.editElements.length}`);
    console.log(`  Sections found: ${pageStructure.sections.length}`);
    pageStructure.editElements.forEach(e => {
      console.log(`    [${e.tag}] class="${e.class}" text="${e.text}" aria="${e.ariaLabel}"`);
    });

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'page-structure.png'), fullPage: false });

    // ═══════════════════════════════════════════
    // INSPECT 2: Resume Headline edit modal
    // ═══════════════════════════════════════════
    console.log('\n── INSPECTING RESUME HEADLINE EDIT ──');

    // Find headline section and its edit icon
    const headlineInfo = await page.evaluate(() => {
      // Look for the headline section
      const headlineSection = document.querySelector('[class*="resumeHeadline"], [class*="resume-headline"]');
      const headlineWidget = Array.from(document.querySelectorAll('.widgetHead')).find(
        el => el.textContent?.includes('Resume headline')
      );

      let editIcon = null;
      if (headlineWidget) {
        editIcon = headlineWidget.querySelector('[class*="edit"], .icon, span[class*="edit"]');
      }
      if (!editIcon && headlineSection) {
        editIcon = headlineSection.querySelector('[class*="edit"], .icon');
      }

      // Also check for pencil icon near "Resume headline" text
      const allPencils = document.querySelectorAll('[class*="edit"], [class*="pencil"]');
      const nearHeadline = [];
      allPencils.forEach(el => {
        const parent = el.closest('.widgetHead, [class*="section"], [class*="widget"]');
        if (parent?.textContent?.includes('headline')) {
          nearHeadline.push({
            tag: el.tagName,
            class: el.className?.toString(),
            parentClass: parent.className?.toString(),
            parentText: parent.textContent?.trim().substring(0, 60),
          });
        }
      });

      return {
        headlineSectionFound: !!headlineSection,
        headlineSectionClass: headlineSection?.className?.toString(),
        headlineWidgetFound: !!headlineWidget,
        headlineWidgetClass: headlineWidget?.className?.toString(),
        headlineWidgetHTML: headlineWidget?.innerHTML?.substring(0, 200),
        editIconFound: !!editIcon,
        editIconTag: editIcon?.tagName,
        editIconClass: editIcon?.className?.toString(),
        nearHeadline,
      };
    });

    findings.headline = headlineInfo;
    console.log(`  Section found: ${headlineInfo.headlineSectionFound}`);
    console.log(`  Widget found: ${headlineInfo.headlineWidgetFound}`);
    console.log(`  Widget class: ${headlineInfo.headlineWidgetClass}`);
    console.log(`  Widget HTML: ${headlineInfo.headlineWidgetHTML}`);
    console.log(`  Edit icon found: ${headlineInfo.editIconFound}`);
    console.log(`  Edit icon class: ${headlineInfo.editIconClass}`);
    console.log(`  Near-headline pencils: ${headlineInfo.nearHeadline.length}`);
    headlineInfo.nearHeadline.forEach(n => console.log(`    ${n.tag} class="${n.class}" parent="${n.parentClass}"`));

    // Click the edit icon for headline
    let headlineEditClicked = false;
    const headlineEditSelectors = [
      // Try specific patterns
      '.resumeHeadline .edit-pencil',
      '.resumeHeadline span[class*="edit"]',
      '.resumeHeadline .editWidget',
    ];

    // Use evaluate to find and click
    headlineEditClicked = await page.evaluate(() => {
      // Strategy: find "Resume headline" section header, then find edit icon within it or sibling
      const allWidgets = document.querySelectorAll('.widgetHead');
      for (const widget of allWidgets) {
        if (widget.textContent?.includes('Resume headline')) {
          const editBtn = widget.querySelector('span[class*="edit"], [class*="edit"], .icon');
          if (editBtn) {
            (editBtn).click();
            return true;
          }
        }
      }

      // Fallback: look for pencil icon after headline text
      const headlineSection = document.querySelector('[class*="resumeHeadline"]');
      if (headlineSection) {
        const edit = headlineSection.querySelector('[class*="edit"]');
        if (edit) {
          edit.click();
          return true;
        }
      }
      return false;
    });

    if (!headlineEditClicked) {
      // Try direct pencil icon near headline
      console.log('  Trying direct selector click...');
      for (const sel of headlineEditSelectors) {
        try {
          const el = await page.$(sel);
          if (el) {
            await el.click();
            headlineEditClicked = true;
            console.log(`  Clicked: ${sel}`);
            break;
          }
        } catch {}
      }
    }

    if (headlineEditClicked) {
      console.log('  ✅ Headline edit clicked');
      await randomDelay(2000, 3000);

      // Capture modal DOM
      const modalInfo = await page.evaluate(() => {
        // Check for modal/dialog/overlay
        const modals = document.querySelectorAll(
          '[class*="modal"], [class*="Modal"], [class*="dialog"], [class*="Dialog"], ' +
          '[class*="overlay"], [class*="Overlay"], [role="dialog"]'
        );

        const modalData = [];
        modals.forEach(m => {
          const visible = m.offsetParent !== null || window.getComputedStyle(m).display !== 'none';
          if (!visible) return;

          // Find inputs/textareas inside
          const inputs = [];
          m.querySelectorAll('input, textarea').forEach(inp => {
            inputs.push({
              tag: inp.tagName,
              type: inp.type || 'textarea',
              name: inp.name,
              id: inp.id,
              placeholder: inp.placeholder,
              class: inp.className?.toString().substring(0, 80),
              value: inp.value?.substring(0, 50),
              maxLength: inp.maxLength,
            });
          });

          // Find buttons inside
          const buttons = [];
          m.querySelectorAll('button, [class*="btn"], [class*="Btn"]').forEach(btn => {
            buttons.push({
              tag: btn.tagName,
              text: btn.textContent?.trim().substring(0, 30),
              class: btn.className?.toString().substring(0, 80),
              type: btn.type,
              disabled: btn.disabled,
            });
          });

          // Find contenteditable
          const editables = [];
          m.querySelectorAll('[contenteditable]').forEach(e => {
            editables.push({
              tag: e.tagName,
              class: e.className?.toString().substring(0, 80),
              contenteditable: e.contentEditable,
            });
          });

          modalData.push({
            class: m.className?.toString().substring(0, 120),
            role: m.getAttribute('role'),
            id: m.id,
            inputs,
            buttons,
            editables,
            innerHTML: m.innerHTML?.substring(0, 500),
          });
        });

        // Also check for inline edit (no modal, just input appears)
        const newInputs = document.querySelectorAll('input:focus, textarea:focus, [contenteditable="true"]');
        const focusedElements = [];
        newInputs.forEach(el => {
          focusedElements.push({
            tag: el.tagName,
            class: el.className?.toString(),
            id: el.id,
            type: el.type,
            name: el.name,
          });
        });

        return { modals: modalData, focusedElements };
      });

      findings.headlineModal = modalInfo;
      console.log(`  Modals found: ${modalInfo.modals.length}`);
      modalInfo.modals.forEach((m, i) => {
        console.log(`\n  Modal ${i + 1}: class="${m.class}"`);
        console.log(`    role="${m.role}" id="${m.id}"`);
        console.log(`    Inputs: ${m.inputs.length}`);
        m.inputs.forEach(inp => {
          console.log(`      [${inp.tag}] name="${inp.name}" id="${inp.id}" placeholder="${inp.placeholder}" class="${inp.class}"`);
        });
        console.log(`    Buttons: ${m.buttons.length}`);
        m.buttons.forEach(btn => {
          console.log(`      [${btn.tag}] text="${btn.text}" class="${btn.class}" type="${btn.type}" disabled=${btn.disabled}`);
        });
        console.log(`    Editables: ${m.editables.length}`);
        m.editables.forEach(e => {
          console.log(`      [${e.tag}] class="${e.class}"`);
        });
      });

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'headline-modal.png'), fullPage: false });

      // Close modal
      await page.keyboard.press('Escape');
      await randomDelay(1000, 2000);
    } else {
      console.log('  ❌ Could not click headline edit');
    }

    // ═══════════════════════════════════════════
    // INSPECT 3: Profile Summary edit
    // ═══════════════════════════════════════════
    console.log('\n── INSPECTING PROFILE SUMMARY EDIT ──');

    const summaryInfo = await page.evaluate(() => {
      // Look for summary/about section
      const widgets = document.querySelectorAll('.widgetHead');
      let summaryWidget = null;
      let summaryEditIcon = null;

      for (const w of widgets) {
        const text = w.textContent?.toLowerCase() || '';
        if (text.includes('summary') || text.includes('about')) {
          summaryWidget = w;
          summaryEditIcon = w.querySelector('[class*="edit"], .icon, span[class*="edit"]');
          break;
        }
      }

      // Also look for the section container
      const summarySection = document.querySelector('[class*="profileSummary"], [class*="profile-summary"], [class*="about"]');

      // Check Quick Links sidebar
      const quickLink = Array.from(document.querySelectorAll('a')).find(a =>
        a.textContent?.toLowerCase().includes('profile summary')
      );

      return {
        widgetFound: !!summaryWidget,
        widgetClass: summaryWidget?.className?.toString(),
        widgetText: summaryWidget?.textContent?.trim().substring(0, 60),
        widgetHTML: summaryWidget?.innerHTML?.substring(0, 300),
        editIconFound: !!summaryEditIcon,
        editIconTag: summaryEditIcon?.tagName,
        editIconClass: summaryEditIcon?.className?.toString(),
        sectionFound: !!summarySection,
        sectionClass: summarySection?.className?.toString(),
        quickLinkFound: !!quickLink,
        quickLinkHref: quickLink?.href,
        quickLinkText: quickLink?.textContent?.trim(),
      };
    });

    findings.summary = summaryInfo;
    console.log(`  Widget found: ${summaryInfo.widgetFound}`);
    console.log(`  Widget text: ${summaryInfo.widgetText}`);
    console.log(`  Widget HTML: ${summaryInfo.widgetHTML}`);
    console.log(`  Edit icon: ${summaryInfo.editIconFound} (${summaryInfo.editIconClass})`);
    console.log(`  Section: ${summaryInfo.sectionFound} (${summaryInfo.sectionClass})`);
    console.log(`  Quick Link: ${summaryInfo.quickLinkFound} (${summaryInfo.quickLinkHref})`);

    // Try clicking summary edit
    const summaryEditClicked = await page.evaluate(() => {
      const widgets = document.querySelectorAll('.widgetHead');
      for (const w of widgets) {
        if (w.textContent?.toLowerCase().includes('summary')) {
          const edit = w.querySelector('[class*="edit"], .icon, span');
          if (edit) { edit.click(); return true; }
        }
      }
      // Fallback: click "Profile summary" in sidebar
      const link = Array.from(document.querySelectorAll('a')).find(a =>
        a.textContent?.trim().toLowerCase() === 'profile summary'
      );
      if (link) { link.click(); return true; }
      return false;
    });

    if (summaryEditClicked) {
      console.log('  ✅ Summary edit clicked');
      await randomDelay(2000, 3000);

      const summaryModal = await page.evaluate(() => {
        const modals = document.querySelectorAll(
          '[class*="modal"], [class*="Modal"], [class*="dialog"], [role="dialog"], [class*="overlay"]:not([class*="hidden"])'
        );

        const result = [];
        modals.forEach(m => {
          const visible = m.offsetParent !== null || window.getComputedStyle(m).display !== 'none';
          if (!visible) return;

          const textareas = [];
          m.querySelectorAll('textarea').forEach(ta => {
            textareas.push({
              name: ta.name, id: ta.id,
              class: ta.className?.toString().substring(0, 80),
              placeholder: ta.placeholder,
              value: ta.value?.substring(0, 100),
              rows: ta.rows, maxLength: ta.maxLength,
            });
          });

          const buttons = [];
          m.querySelectorAll('button').forEach(btn => {
            const visible = btn.offsetParent !== null;
            if (!visible) return;
            buttons.push({
              text: btn.textContent?.trim().substring(0, 30),
              class: btn.className?.toString().substring(0, 80),
              type: btn.type, disabled: btn.disabled,
            });
          });

          result.push({
            class: m.className?.toString().substring(0, 120),
            textareas, buttons,
            innerHTML: m.innerHTML?.substring(0, 500),
          });
        });

        // Check for inline textarea that appeared
        const allTextareas = document.querySelectorAll('textarea');
        const newTAs = [];
        allTextareas.forEach(ta => {
          if (ta.offsetParent !== null) {
            newTAs.push({
              name: ta.name, id: ta.id,
              class: ta.className?.toString().substring(0, 80),
              placeholder: ta.placeholder,
              value: ta.value?.substring(0, 100),
            });
          }
        });

        return { modals: result, visibleTextareas: newTAs };
      });

      findings.summaryModal = summaryModal;
      console.log(`  Modals: ${summaryModal.modals.length}`);
      summaryModal.modals.forEach((m, i) => {
        console.log(`  Modal ${i + 1}: class="${m.class}"`);
        console.log(`    Textareas: ${m.textareas.length}`);
        m.textareas.forEach(t => console.log(`      name="${t.name}" id="${t.id}" class="${t.class}" placeholder="${t.placeholder}"`));
        console.log(`    Buttons: ${m.buttons.length}`);
        m.buttons.forEach(b => console.log(`      text="${b.text}" class="${b.class}" disabled=${b.disabled}`));
      });
      console.log(`  Visible textareas total: ${summaryModal.visibleTextareas.length}`);
      summaryModal.visibleTextareas.forEach(t => console.log(`    name="${t.name}" id="${t.id}" class="${t.class}"`));

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'summary-modal.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await randomDelay(1000, 2000);
    } else {
      console.log('  ❌ Could not click summary edit');
    }

    // ═══════════════════════════════════════════
    // INSPECT 4: Key Skills edit
    // ═══════════════════════════════════════════
    console.log('\n── INSPECTING KEY SKILLS EDIT ──');

    // Scroll to skills section
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.widgetHead')).find(
        w => w.textContent?.toLowerCase().includes('key skill')
      );
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await randomDelay(1500, 2500);

    const skillsEditClicked = await page.evaluate(() => {
      const widgets = document.querySelectorAll('.widgetHead');
      for (const w of widgets) {
        if (w.textContent?.toLowerCase().includes('key skill')) {
          const edit = w.querySelector('[class*="edit"], .icon, span[class*="edit"]');
          if (edit) { edit.click(); return true; }
        }
      }
      return false;
    });

    if (skillsEditClicked) {
      console.log('  ✅ Skills edit clicked');
      await randomDelay(2000, 3000);

      const skillsModal = await page.evaluate(() => {
        const modals = [];
        document.querySelectorAll('[class*="modal"], [class*="Modal"], [class*="dialog"], [role="dialog"]').forEach(m => {
          const visible = m.offsetParent !== null || window.getComputedStyle(m).display !== 'none';
          if (!visible) return;

          const inputs = [];
          m.querySelectorAll('input, textarea').forEach(inp => {
            inputs.push({
              tag: inp.tagName, type: inp.type, name: inp.name, id: inp.id,
              placeholder: inp.placeholder,
              class: inp.className?.toString().substring(0, 80),
              autocomplete: inp.autocomplete,
            });
          });

          const buttons = [];
          m.querySelectorAll('button').forEach(btn => {
            if (btn.offsetParent === null) return;
            buttons.push({
              text: btn.textContent?.trim().substring(0, 30),
              class: btn.className?.toString().substring(0, 80),
              type: btn.type, disabled: btn.disabled,
            });
          });

          // Find existing skill chips/tags
          const chips = [];
          m.querySelectorAll('[class*="chip"], [class*="tag"], [class*="Chip"], [class*="Tag"]').forEach(c => {
            chips.push({
              text: c.textContent?.trim().substring(0, 30),
              class: c.className?.toString().substring(0, 60),
            });
          });

          // Find suggestion dropdown
          const suggestions = [];
          m.querySelectorAll('[class*="suggest"], [class*="Suggest"], [class*="dropdown"] li, [class*="autoComplete"]').forEach(s => {
            suggestions.push({
              text: s.textContent?.trim().substring(0, 30),
              class: s.className?.toString().substring(0, 60),
            });
          });

          modals.push({
            class: m.className?.toString().substring(0, 120),
            inputs, buttons, chips, suggestions,
            innerHTML: m.innerHTML?.substring(0, 800),
          });
        });

        return modals;
      });

      findings.skillsModal = skillsModal;
      console.log(`  Modals: ${skillsModal.length}`);
      skillsModal.forEach((m, i) => {
        console.log(`  Modal ${i + 1}: class="${m.class}"`);
        console.log(`    Inputs: ${m.inputs.length}`);
        m.inputs.forEach(inp => console.log(`      [${inp.tag}] name="${inp.name}" placeholder="${inp.placeholder}" class="${inp.class}"`));
        console.log(`    Buttons: ${m.buttons.length}`);
        m.buttons.forEach(b => console.log(`      text="${b.text}" class="${b.class}" disabled=${b.disabled}`));
        console.log(`    Chips: ${m.chips.length}`);
        m.chips.slice(0, 5).forEach(c => console.log(`      "${c.text}" class="${c.class}"`));
        console.log(`    Suggestions: ${m.suggestions.length}`);
      });

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'skills-modal.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await randomDelay(1000, 2000);
    } else {
      console.log('  ❌ Could not click skills edit');
    }

    // ═══════════════════════════════════════════
    // INSPECT 5: Profile name/title edit (pencil icon)
    // ═══════════════════════════════════════════
    console.log('\n── INSPECTING PROFILE NAME/TITLE EDIT ──');
    await page.evaluate(() => window.scrollTo(0, 0));
    await randomDelay(1000, 2000);

    const nameEditInfo = await page.evaluate(() => {
      // The pencil icon next to the name
      const nameEl = document.querySelector('[class*="name"], .nI-profile-name');
      const pencilNearName = nameEl?.parentElement?.querySelector('[class*="edit"], .icon, span[class*="edit"]');

      // The main profile header area
      const headerArea = document.querySelector('[class*="profileHeader"], [class*="profile-header"], .nI-profile-header');

      // All clickable elements in the header
      const headerClicks = [];
      const header = document.querySelector('[class*="profileHeader"], .nI-profile-header') ||
                     document.querySelector('.profileHead');
      if (header) {
        header.querySelectorAll('[class*="edit"], button, .icon, span[class*="edit"], a').forEach(el => {
          headerClicks.push({
            tag: el.tagName,
            class: el.className?.toString().substring(0, 80),
            text: el.textContent?.trim().substring(0, 30),
            ariaLabel: el.getAttribute('aria-label'),
          });
        });
      }

      return {
        nameElFound: !!nameEl,
        nameElClass: nameEl?.className?.toString(),
        pencilFound: !!pencilNearName,
        pencilClass: pencilNearName?.className?.toString(),
        headerFound: !!headerArea,
        headerClass: headerArea?.className?.toString(),
        headerClicks,
      };
    });

    findings.nameEdit = nameEditInfo;
    console.log(`  Name element: ${nameEditInfo.nameElFound} (${nameEditInfo.nameElClass})`);
    console.log(`  Pencil icon: ${nameEditInfo.pencilFound} (${nameEditInfo.pencilClass})`);
    console.log(`  Header clicks: ${nameEditInfo.headerClicks.length}`);
    nameEditInfo.headerClicks.forEach(c =>
      console.log(`    [${c.tag}] class="${c.class}" text="${c.text}" aria="${c.ariaLabel}"`)
    );

    // Try clicking the pencil icon next to name
    const nameEditClicked = await page.evaluate(() => {
      // Find pencil/edit icon near the name
      const allEdits = document.querySelectorAll('[class*="edit"]');
      for (const e of allEdits) {
        const parent = e.closest('[class*="profileHead"], [class*="basicInfo"]');
        if (parent) {
          e.click();
          return { clicked: true, class: e.className?.toString() };
        }
      }
      // Fallback: look for the edit icon that's the first one on the page (usually profile edit)
      const firstEdit = document.querySelector('.widgetHead .edit, .editWidget');
      if (firstEdit) {
        firstEdit.click();
        return { clicked: true, class: firstEdit.className?.toString() };
      }
      return { clicked: false };
    });

    if (nameEditClicked?.clicked) {
      console.log(`  ✅ Profile edit clicked: ${nameEditClicked.class}`);
      await randomDelay(2000, 3000);

      // Inspect what opened
      const profileEditModal = await page.evaluate(() => {
        const modals = [];
        document.querySelectorAll('[class*="modal"], [class*="Modal"], [class*="dialog"], [role="dialog"], [class*="overlay"]').forEach(m => {
          const visible = m.offsetParent !== null ||
            window.getComputedStyle(m).display !== 'none' ||
            window.getComputedStyle(m).visibility !== 'hidden';
          if (!visible) return;

          const allInputs = [];
          m.querySelectorAll('input, textarea, select').forEach(el => {
            allInputs.push({
              tag: el.tagName, type: el.type, name: el.name, id: el.id,
              placeholder: el.placeholder,
              class: el.className?.toString().substring(0, 80),
              value: el.value?.substring(0, 100),
              label: el.closest('label')?.textContent?.trim().substring(0, 50) ||
                     el.closest('.formRow')?.querySelector('label')?.textContent?.trim().substring(0, 50),
            });
          });

          const allButtons = [];
          m.querySelectorAll('button').forEach(btn => {
            if (btn.offsetParent === null) return;
            allButtons.push({
              text: btn.textContent?.trim().substring(0, 40),
              class: btn.className?.toString().substring(0, 80),
              type: btn.type, disabled: btn.disabled,
            });
          });

          modals.push({
            tag: m.tagName,
            class: m.className?.toString().substring(0, 150),
            role: m.getAttribute('role'),
            inputs: allInputs,
            buttons: allButtons,
            innerHTML: m.innerHTML?.substring(0, 1000),
          });
        });

        return modals;
      });

      findings.profileEditModal = profileEditModal;
      console.log(`  Modals: ${profileEditModal.length}`);
      profileEditModal.forEach((m, i) => {
        console.log(`\n  Modal ${i + 1}: class="${m.class}"`);
        console.log(`    Inputs: ${m.inputs.length}`);
        m.inputs.forEach(inp => {
          console.log(`      [${inp.tag}] label="${inp.label}" name="${inp.name}" id="${inp.id}" placeholder="${inp.placeholder}" class="${inp.class}" value="${inp.value}"`);
        });
        console.log(`    Buttons: ${m.buttons.length}`);
        m.buttons.forEach(b => console.log(`      text="${b.text}" class="${b.class}" disabled=${b.disabled}`));
      });

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'profile-edit-modal.png'), fullPage: false });

      // Scroll down inside modal to see all fields
      const modalEl = await page.$('[class*="modal"], [class*="Modal"], [role="dialog"]');
      if (modalEl) {
        await page.evaluate(el => el.scrollTop = 300, modalEl);
        await randomDelay(1000, 1500);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'profile-edit-modal-scrolled.png'), fullPage: false });

        await page.evaluate(el => el.scrollTop = 600, modalEl);
        await randomDelay(1000, 1500);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'profile-edit-modal-scrolled2.png'), fullPage: false });
      }

      await page.keyboard.press('Escape');
      await randomDelay(1000, 2000);
    }

    // ═══════════════════════════════════════════
    // INSPECT 6: Entire DOM class inventory
    // ═══════════════════════════════════════════
    console.log('\n── FULL CLASS INVENTORY ──');
    const classInventory = await page.evaluate(() => {
      const classes = new Map();
      document.querySelectorAll('*').forEach(el => {
        const cls = el.className?.toString();
        if (cls && typeof cls === 'string') {
          cls.split(/\s+/).forEach(c => {
            if (c.length > 2 && (c.includes('edit') || c.includes('Edit') || c.includes('save') ||
                c.includes('Save') || c.includes('modal') || c.includes('Modal') ||
                c.includes('widget') || c.includes('Widget') || c.includes('profile') ||
                c.includes('Profile') || c.includes('skill') || c.includes('Skill') ||
                c.includes('headline') || c.includes('Headline') || c.includes('summary') ||
                c.includes('Summary'))) {
              classes.set(c, (classes.get(c) || 0) + 1);
            }
          });
        }
      });
      return Object.fromEntries([...classes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50));
    });

    findings.classInventory = classInventory;
    console.log('  Top CSS classes (edit/save/modal/profile/skill/headline/summary):');
    Object.entries(classInventory).forEach(([cls, count]) => {
      console.log(`    .${cls} — ${count} elements`);
    });

    // Save findings
    const outputPath = path.join(RESULTS_DIR, 'naukri-modal-findings.json');
    fs.writeFileSync(outputPath, JSON.stringify(findings, null, 2));
    console.log(`\n💾 Findings saved: ${outputPath}`);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    try { await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error.png'), fullPage: false }); } catch {}
  } finally {
    console.log('  Closing browser...');
    await sleep(3000);
    await context.close();
  }
}

main().catch(console.error);
