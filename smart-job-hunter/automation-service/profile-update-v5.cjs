const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const EMAIL = 'tomar.aryan16j@gmail.com';
const PASSWORD = 'Luck@16072002';

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
async function snap(page, label) {
  snapN++;
  const f = `v5-${snapN}-${label}.png`;
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f) });
  console.log(`  [SNAP] ${f}`);
}

async function main() {
  console.log('=== LinkedIn Profile Updater v5 ===');
  console.log('=== Native Playwright Click Edition ===\n');

  const userDataDir = path.resolve(__dirname, 'sessions', 'li-persistent');
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 30,
    viewport: { width: 1366, height: 768 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars', '--no-sandbox'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });

  const page = context.pages()[0] || await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
  });

  try {
    // ===== LOGIN =====
    console.log('[LOGIN] Checking...');
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(rand(3000, 5000));
    let url = page.url();

    if (url.includes('/login') || url.includes('/authwall') || url.includes('/checkpoint')) {
      console.log('[LOGIN] Logging in...');
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000);
      try { const cb = await page.$('button[action-type="ACCEPT"]'); if (cb) await cb.click(); } catch(e) {}
      await sleep(500);

      const emailEl = await page.$('#username');
      if (emailEl) { await emailEl.click(); await sleep(300); for (const ch of EMAIL) { await page.keyboard.type(ch, { delay: rand(40, 100) }); } }
      await sleep(rand(500, 800));
      const passEl = await page.$('#password');
      if (passEl) { await passEl.click(); await sleep(300); for (const ch of PASSWORD) { await page.keyboard.type(ch, { delay: rand(40, 100) }); } }
      await sleep(rand(600, 1200));
      const sub = await page.$('button[type="submit"]'); if (sub) await sub.click();
      await sleep(rand(6000, 10000));

      url = page.url();
      if (!url.includes('/feed') && !url.includes('/in/') && !url.includes('/mynetwork')) {
        console.log('[LOGIN] Security checkpoint. Waiting 5 min...');
        const dl = Date.now() + 300000;
        while (Date.now() < dl) { await sleep(3000); url = page.url(); if (url.includes('/feed') || url.includes('/in/')) break; }
      }
      url = page.url();
      if (url.includes('/feed') || url.includes('/in/') || url.includes('/mynetwork')) { console.log('[LOGIN] OK!'); }
      else { console.log('[LOGIN] FAILED: ' + url); await context.close(); return; }
    } else {
      console.log('[LOGIN] Session active!');
    }

    // ===== GO TO PROFILE =====
    console.log('\n[PROFILE] Loading profile page...');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 7000));  // extra wait for LinkedIn's lazy rendering
    await snap(page, 'profile-loaded');

    // ===== DEEP DOM AUDIT =====
    console.log('\n[AUDIT] Deep DOM scan...');
    const audit = await page.evaluate(() => {
      // Get profile URL from address bar
      const profileUrl = window.location.href;

      // Scan ALL buttons on page
      const allBtns = Array.from(document.querySelectorAll('button'));
      const btnMap = allBtns.map((b, i) => {
        const r = b.getBoundingClientRect();
        return {
          idx: i,
          label: b.getAttribute('aria-label') || '',
          text: b.textContent.trim().substring(0, 40),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          visible: r.width > 0 && r.height > 0,
        };
      }).filter(b => b.visible && b.y < 600 && b.y > 200); // Focus on intro area

      return { profileUrl, buttonsInIntroArea: btnMap };
    });

    console.log('  Profile URL: ' + audit.profileUrl);
    console.log('  Buttons in intro area (y 200-600):');
    audit.buttonsInIntroArea.forEach(b => {
      console.log(`    [${b.idx}] "${b.label || b.text}" at (${b.x},${b.y}) ${b.w}x${b.h}`);
    });

    // ===== CLICK THE INTRO EDIT PENCIL =====
    // From audit: button labeled "Edit" at y~544, the one below the banner
    // We need to use PLAYWRIGHT NATIVE click on this exact button

    console.log('\n[HEADLINE] Clicking intro edit button with Playwright native click...');

    // Strategy: get ALL buttons, find the one labeled "Edit" (not "Edit background image")
    const editBtns = await page.$$('button');
    let introEditBtn = null;

    for (const btn of editBtns) {
      const label = await btn.getAttribute('aria-label');
      if (label === 'Edit') {
        // Verify it's in the intro area (not other sections)
        const box = await btn.boundingBox();
        if (box && box.y > 200 && box.y < 600) {
          introEditBtn = btn;
          console.log(`  Found "Edit" button at y=${Math.round(box.y)}`);
          break;
        }
      }
    }

    if (!introEditBtn) {
      // Fallback: look for any pencil icon button below banner and above content
      const pencilBtns = await page.$$('button[aria-label*="edit" i], button[aria-label="Edit"]');
      for (const btn of pencilBtns) {
        const label = await btn.getAttribute('aria-label');
        if (label && label.toLowerCase().includes('background')) continue;
        if (label && label.toLowerCase().includes('photo')) continue;
        const box = await btn.boundingBox();
        if (box && box.y > 200) {
          introEditBtn = btn;
          console.log(`  Fallback: found edit button "${label}" at y=${Math.round(box.y)}`);
          break;
        }
      }
    }

    if (introEditBtn) {
      // Use native Playwright click (triggers React events properly)
      await introEditBtn.scrollIntoViewIfNeeded();
      await sleep(rand(500, 1000));
      await introEditBtn.click({ force: true });
      console.log('  >>> NATIVE CLICK on intro edit button <<<');
      await sleep(rand(4000, 6000));  // LinkedIn modals take time
      await snap(page, 'after-intro-click');

      // Now check what opened
      const modalCheck = await page.evaluate(() => {
        // Check for any dialog/modal
        const dialogs = document.querySelectorAll('[role="dialog"]');
        const modals = document.querySelectorAll('.artdeco-modal');
        const overlays = document.querySelectorAll('.artdeco-modal-overlay');

        // Visible modal content
        let modalText = '';
        let inputCount = 0;
        let textareaCount = 0;
        const inputDetails = [];

        const modalEl = dialogs[0] || modals[0];
        if (modalEl) {
          modalText = modalEl.querySelector('h2')?.textContent?.trim() || '';

          // Count ALL form elements
          modalEl.querySelectorAll('input, textarea, select').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width > 0) {
              const tag = el.tagName.toLowerCase();
              if (tag === 'input') inputCount++;
              if (tag === 'textarea') textareaCount++;

              // Get closest label
              const id = el.id;
              let labelText = '';
              if (id) {
                const lbl = document.querySelector(`label[for="${id}"]`);
                if (lbl) labelText = lbl.textContent.trim();
              }
              if (!labelText) {
                // Walk up to find label
                let parent = el.parentElement;
                for (let i = 0; i < 5 && parent; i++) {
                  const lbl = parent.querySelector('label');
                  if (lbl) { labelText = lbl.textContent.trim(); break; }
                  parent = parent.parentElement;
                }
              }

              inputDetails.push({
                tag,
                id: el.id,
                type: el.type || '',
                label: labelText,
                ariaLabel: el.getAttribute('aria-label') || '',
                value: (el.value || '').substring(0, 60),
                placeholder: el.placeholder || '',
              });
            }
          });
        }

        return {
          dialogCount: dialogs.length,
          modalCount: modals.length,
          overlayCount: overlays.length,
          heading: modalText,
          inputCount,
          textareaCount,
          fields: inputDetails,
        };
      });

      console.log('\n  Modal state after click:');
      console.log('    Dialogs: ' + modalCheck.dialogCount);
      console.log('    Modals: ' + modalCheck.modalCount);
      console.log('    Heading: "' + modalCheck.heading + '"');
      console.log('    Inputs: ' + modalCheck.inputCount + ', Textareas: ' + modalCheck.textareaCount);
      modalCheck.fields.forEach((f, i) => {
        console.log(`    Field[${i}] <${f.tag}> id="${f.id}" type="${f.type}" label="${f.label}" ariaLabel="${f.ariaLabel}" placeholder="${f.placeholder}" val="${f.value}"`);
      });

      // Find and fill the headline field
      let headlineUpdated = false;
      for (const field of modalCheck.fields) {
        const isHeadline = field.label.toLowerCase().includes('headline') ||
                           field.ariaLabel.toLowerCase().includes('headline') ||
                           field.id.toLowerCase().includes('headline') ||
                           field.placeholder.toLowerCase().includes('headline');
        if (isHeadline) {
          // Build selector
          let selector = null;
          if (field.id) {
            // Escape the id for CSS selector (LinkedIn uses colons like :r2:)
            selector = `[id="${field.id}"]`;
          } else if (field.ariaLabel) {
            selector = `[aria-label="${field.ariaLabel}"]`;
          }

          if (selector) {
            const inp = await page.$(selector);
            if (inp) {
              await inp.click({ clickCount: 3 });
              await sleep(200);
              await inp.fill('');
              await sleep(100);
              await inp.fill(HEADLINE);
              headlineUpdated = true;
              console.log('\n  >>> HEADLINE UPDATED! <<<');
              console.log('  New headline: ' + HEADLINE);
            }
          }
          break;
        }
      }

      if (!headlineUpdated && modalCheck.fields.length > 0) {
        // Try filling by label matching through Playwright's text selector
        console.log('  Trying Playwright label selector...');
        try {
          const headlineInput = await page.$('input:near(:text("Headline")):visible');
          if (headlineInput) {
            await headlineInput.click({ clickCount: 3 });
            await sleep(200);
            await headlineInput.fill(HEADLINE);
            headlineUpdated = true;
            console.log('  >>> HEADLINE UPDATED via :near selector! <<<');
          }
        } catch(e) {
          console.log('  :near selector failed: ' + e.message);
        }
      }

      if (!headlineUpdated && modalCheck.fields.length > 0) {
        // Last resort: try the getByLabel approach
        console.log('  Trying getByLabel...');
        try {
          await page.getByLabel(/headline/i).fill(HEADLINE);
          headlineUpdated = true;
          console.log('  >>> HEADLINE UPDATED via getByLabel! <<<');
        } catch(e) {
          console.log('  getByLabel failed: ' + e.message);
        }
      }

      // Click Save
      if (headlineUpdated) {
        await sleep(rand(1000, 2000));
        try {
          await page.getByRole('button', { name: /save/i }).click();
          console.log('  >>> SAVED! <<<');
        } catch(e) {
          // Fallback save
          const saveBtns = await page.$$('button');
          for (const btn of saveBtns) {
            const text = (await btn.textContent() || '').trim();
            if (text.toLowerCase() === 'save') {
              await btn.click();
              console.log('  >>> SAVED (fallback)! <<<');
              break;
            }
          }
        }
        await sleep(rand(3000, 5000));
        await snap(page, 'headline-saved');
      } else {
        console.log('  WARNING: Could not find headline field');
        // Close modal if open
        try {
          const dismissBtn = await page.$('button[aria-label="Dismiss"]');
          if (dismissBtn) await dismissBtn.click();
        } catch(e) {}
      }
    } else {
      console.log('  ERROR: Could not find intro edit button');
    }

    // ========================================
    // ABOUT SECTION
    // ========================================
    console.log('\n[ABOUT] Handling About section...');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(4000, 6000));

    const hasAbout = await page.$('#about');

    if (!hasAbout) {
      console.log('  No About section. Using "Add section" button...');

      // Click "Add section" - use getByRole for reliability
      try {
        await page.getByRole('button', { name: /add section/i }).click();
        console.log('  Clicked "Add section"');
        await sleep(rand(2000, 3000));
        await snap(page, 'add-section-dropdown');

        // Look for Core or About in the dropdown
        // LinkedIn shows a dropdown categorized as Core, Recommended, Additional
        const dropdownInfo = await page.evaluate(() => {
          const items = document.querySelectorAll('[role="menuitem"], [role="option"], li button, .artdeco-dropdown__item');
          return Array.from(items).map(i => ({
            text: i.textContent.trim().substring(0, 60),
            tag: i.tagName,
          }));
        });
        console.log('  Dropdown items:');
        dropdownInfo.forEach(i => console.log(`    "${i.text}"`));

        // Click "About" if visible
        let foundAbout = false;
        try {
          const aboutItem = await page.getByText('About', { exact: true });
          if (aboutItem) {
            await aboutItem.click();
            foundAbout = true;
            console.log('  Clicked "About" option');
          }
        } catch(e) {}

        if (!foundAbout) {
          // Try clicking "Core" first to expand, then "About"
          try {
            const coreItem = await page.getByText('Core');
            if (coreItem) {
              await coreItem.click();
              await sleep(1000);
              const aboutItem = await page.getByText('About', { exact: true });
              if (aboutItem) { await aboutItem.click(); foundAbout = true; }
            }
          } catch(e) {}
        }

        if (!foundAbout) {
          // Try "Summary" as alternative
          try {
            await page.getByText('Summary').click();
            foundAbout = true;
          } catch(e) {}
        }

        await sleep(rand(3000, 5000));
        await snap(page, 'about-form-opened');
      } catch(e) {
        console.log('  "Add section" click failed: ' + e.message);
      }
    } else {
      console.log('  About section exists, opening editor...');
      // Click the edit button within About section
      const aboutSection = await page.$('#about');
      if (aboutSection) {
        await aboutSection.scrollIntoViewIfNeeded();
        await sleep(1000);

        // Find the edit button in the About section's parent
        const aboutParent = await page.evaluateHandle(() => {
          return document.querySelector('#about')?.closest('section');
        });
        if (aboutParent) {
          const editBtn = await aboutParent.$('button[aria-label*="Edit" i]');
          if (editBtn) {
            await editBtn.click();
            console.log('  Clicked About edit button');
            await sleep(rand(3000, 5000));
          }
        }
      }
    }

    // Now fill the About textarea (whether adding new or editing existing)
    let aboutFilled = false;

    // Method 1: Playwright native textarea
    const ta = await page.$('textarea:visible');
    if (ta) {
      await ta.click();
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await sleep(200);
      await ta.fill(ABOUT);
      aboutFilled = true;
      console.log('  >>> ABOUT FILLED via textarea! <<<');
    }

    // Method 2: getByRole textbox
    if (!aboutFilled) {
      try {
        const textbox = await page.getByRole('textbox');
        if (textbox) {
          await textbox.click();
          await page.keyboard.down('Control');
          await page.keyboard.press('a');
          await page.keyboard.up('Control');
          await sleep(200);
          await textbox.fill(ABOUT);
          aboutFilled = true;
          console.log('  >>> ABOUT FILLED via getByRole textbox! <<<');
        }
      } catch(e) {}
    }

    // Method 3: contenteditable
    if (!aboutFilled) {
      const editable = await page.$('[contenteditable="true"]:visible');
      if (editable) {
        await editable.click();
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await sleep(200);
        await page.keyboard.press('Delete');
        await page.keyboard.type(ABOUT, { delay: 2 });
        aboutFilled = true;
        console.log('  >>> ABOUT FILLED via contenteditable! <<<');
      }
    }

    if (aboutFilled) {
      await sleep(rand(1000, 2000));
      try {
        await page.getByRole('button', { name: /save/i }).click();
        console.log('  >>> ABOUT SAVED! <<<');
      } catch(e) {
        const btns = await page.$$('button');
        for (const btn of btns) {
          const text = (await btn.textContent() || '').trim();
          if (text.toLowerCase() === 'save') { await btn.click(); console.log('  >>> ABOUT SAVED (fallback)! <<<'); break; }
        }
      }
      await sleep(rand(3000, 5000));
    } else {
      console.log('  WARNING: Could not find About text field');
    }

    await snap(page, 'after-about');

    // ========================================
    // FINAL VERIFICATION
    // ========================================
    console.log('\n[VERIFY] Final check...');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 8000));
    await snap(page, 'FINAL-top');

    await page.evaluate(() => window.scrollTo(0, 400));
    await sleep(1500);
    await snap(page, 'FINAL-mid');

    console.log('\n  ╔═══════════════════════════════════════════╗');
    console.log('  ║          AUTOMATION COMPLETE                ║');
    console.log('  ╠═══════════════════════════════════════════╣');
    console.log('  ║  Screenshots: ' + SCREENSHOTS_DIR.substring(0, 30).padEnd(30) + '║');
    console.log('  ╚═══════════════════════════════════════════╝');

    console.log('\n  Browser open for 90s — verify profile now...');
    await sleep(90000);

  } catch (err) {
    console.error('\n[FATAL] ' + err.message);
    console.error(err.stack?.split('\n').slice(0, 3).join('\n'));
    await snap(page, 'FATAL-ERROR');
  } finally {
    await context.close();
    console.log('[DONE] Browser closed.');
  }
}

main();
