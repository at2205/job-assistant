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

let screenshotCount = 0;
async function snap(page, label) {
  screenshotCount++;
  const fname = `${screenshotCount}-${label}.png`;
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, fname), fullPage: false });
  console.log(`  [SNAP] ${fname}`);
  return fname;
}

async function main() {
  console.log('=== LinkedIn Profile Updater v4 ===');
  console.log('=== Selector-Fixed Edition ===\n');

  // Reuse persistent session from v3 (already logged in)
  const userDataDir = path.resolve(__dirname, 'sessions', 'li-persistent');
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  console.log('[LAUNCH] Opening browser...');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 30,
    viewport: { width: 1366, height: 768 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
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
    // ===== LOGIN CHECK =====
    console.log('[LOGIN] Checking session...');
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(rand(3000, 5000));

    let url = page.url();
    if (url.includes('/login') || url.includes('/authwall') || url.includes('/checkpoint')) {
      console.log('[LOGIN] Not logged in — filling credentials...');

      // Go to login page
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(rand(2000, 3000));

      // Cookie consent
      try { const cb = await page.$('button[action-type="ACCEPT"]'); if (cb) await cb.click(); } catch(e) {}
      await sleep(500);

      // Email
      const emailEl = await page.$('#username');
      if (emailEl) {
        await emailEl.click();
        await sleep(300);
        for (const ch of EMAIL) { await page.keyboard.type(ch, { delay: rand(40, 100) }); }
        console.log('  -> Email typed');
      }
      await sleep(rand(500, 800));

      // Password
      const passEl = await page.$('#password');
      if (passEl) {
        await passEl.click();
        await sleep(300);
        for (const ch of PASSWORD) { await page.keyboard.type(ch, { delay: rand(40, 100) }); }
        console.log('  -> Password typed');
      }
      await sleep(rand(600, 1200));

      // Submit
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) { await submitBtn.click(); console.log('  -> Sign In clicked'); }
      await sleep(rand(6000, 10000));

      url = page.url();

      // Security checkpoint?
      if (!url.includes('/feed') && !url.includes('/in/') && !url.includes('/mynetwork')) {
        console.log('[LOGIN] Security checkpoint detected. Waiting 5 min for manual resolution...');
        const deadline = Date.now() + 300000;
        while (Date.now() < deadline) {
          await sleep(3000);
          url = page.url();
          if (url.includes('/feed') || url.includes('/in/') || url.includes('/mynetwork') || url.includes('/jobs')) break;
        }
      }

      url = page.url();
      if (url.includes('/feed') || url.includes('/in/') || url.includes('/mynetwork') || url.includes('/jobs')) {
        console.log('[LOGIN] SUCCESS!');
      } else {
        console.log('[LOGIN] FAILED. URL: ' + url);
        await snap(page, 'login-failed');
        await context.close();
        return;
      }
    } else {
      console.log('[LOGIN] Already logged in!');
    }

    await sleep(2000);

    // ===== GO TO PROFILE =====
    console.log('\n[PROFILE] Navigating to profile...');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(4000, 6000));
    await snap(page, 'profile-BEFORE');

    // ===== AUDIT with DOM inspection =====
    console.log('[AUDIT] Inspecting DOM structure...');
    const auditData = await page.evaluate(() => {
      // Find name - usually the first h1 on profile page
      const h1 = document.querySelector('h1');
      const name = h1 ? h1.textContent.trim() : 'NOT_FOUND';

      // Headline is typically right below the name
      // Look for text elements after h1 in the intro card
      const introCard = h1 ? h1.closest('div') : null;
      let headline = 'NONE';
      if (introCard) {
        const parent = introCard.parentElement;
        if (parent) {
          const children = parent.querySelectorAll('div');
          for (const child of children) {
            const text = child.textContent.trim();
            // Headline won't be the name, location, or connections count
            if (text && text !== name && !text.includes('connections') && !text.includes('Contact info') &&
                !text.includes('Open to') && !text.includes('Add section') && text.length > 5 && text.length < 200) {
              headline = text;
              break;
            }
          }
        }
      }

      // Location
      const locEl = document.querySelector('[class*="text-body-small"][class*="break-words"]');
      const location = locEl ? locEl.textContent.trim() : 'NOT_FOUND';

      // Get all buttons for debugging
      const allBtns = Array.from(document.querySelectorAll('button'));
      const editBtns = allBtns.filter(b => {
        const label = b.getAttribute('aria-label') || '';
        const hasEditIcon = b.querySelector('li-icon[type="edit-medium"], svg[data-test-icon="edit-medium"]');
        return label.toLowerCase().includes('edit') || hasEditIcon;
      }).map(b => ({
        label: b.getAttribute('aria-label') || '',
        text: b.textContent.trim().substring(0, 30),
        classes: b.className.substring(0, 80),
        rect: b.getBoundingClientRect(),
      }));

      // Check if About section exists
      const aboutSection = document.querySelector('#about');

      return { name, headline, location, editBtns, hasAbout: !!aboutSection };
    });

    console.log('\n  PROFILE AUDIT RESULTS:');
    console.log('  ─────────────────────');
    console.log('  Name:      ' + auditData.name);
    console.log('  Headline:  ' + auditData.headline);
    console.log('  Location:  ' + auditData.location);
    console.log('  Has About: ' + auditData.hasAbout);
    console.log('  Edit buttons found: ' + auditData.editBtns.length);
    auditData.editBtns.forEach((b, i) => {
      console.log(`    [${i}] label="${b.label}" text="${b.text}" y=${Math.round(b.rect.y)}`);
    });

    // ========================================
    // STEP 1: UPDATE HEADLINE via intro edit
    // ========================================
    console.log('\n[HEADLINE] Opening intro editor...');

    // From the screenshot, we know:
    // - Button[0] "Edit background image" is at the top of the banner (y ~110)
    // - Button[1] "Edit" (no specific label) is the pencil icon below the banner (y ~315)
    // We need button[1] — the intro edit pencil
    // Strategy: click the edit button that is NOT the background image one

    let clickedIntro = false;

    // Method 1: Click the pencil icon near the name area (below banner)
    // Use page.evaluate to find and click the right button
    clickedIntro = await page.evaluate(() => {
      const allBtns = Array.from(document.querySelectorAll('button'));
      const editBtns = allBtns.filter(b => {
        const label = (b.getAttribute('aria-label') || '').toLowerCase();
        const hasEditIcon = b.querySelector('li-icon[type="edit-medium"], svg');
        return (label.includes('edit') || hasEditIcon) && !label.includes('background') && !label.includes('cover') && !label.includes('photo');
      });

      // Sort by Y position — the intro edit is below the banner but above the rest
      editBtns.sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y);

      // The first non-background edit button should be the intro edit
      if (editBtns.length > 0) {
        editBtns[0].click();
        return true;
      }
      return false;
    });

    if (!clickedIntro) {
      // Method 2: Direct click on known pencil icon position
      // From screenshot, the intro edit pencil is around x=866, y=315
      console.log('  Trying coordinate-based click...');
      await page.mouse.click(866, 315);
      clickedIntro = true;
    }

    await sleep(rand(3000, 5000));
    await snap(page, 'intro-modal-opened');

    // Check what modal opened
    const modalInfo = await page.evaluate(() => {
      // Look for any visible modal/dialog
      const modal = document.querySelector('[role="dialog"], .artdeco-modal, .artdeco-modal__content');
      if (!modal) return { found: false, text: '' };

      const heading = modal.querySelector('h2, h1, [class*="header"]');
      const headingText = heading ? heading.textContent.trim() : '';

      // Count form fields
      const inputs = modal.querySelectorAll('input:not([type="hidden"])');
      const textareas = modal.querySelectorAll('textarea');
      const selects = modal.querySelectorAll('select');

      // Get all input details
      const fields = [];
      inputs.forEach((inp, i) => {
        const rect = inp.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          fields.push({
            type: 'input',
            id: inp.id,
            name: inp.name,
            label: inp.getAttribute('aria-label') || '',
            placeholder: inp.placeholder || '',
            value: inp.value.substring(0, 80),
          });
        }
      });
      textareas.forEach((ta, i) => {
        fields.push({
          type: 'textarea',
          id: ta.id,
          name: ta.name,
          label: ta.getAttribute('aria-label') || '',
          value: ta.value.substring(0, 80),
        });
      });

      return { found: true, heading: headingText, fieldCount: fields.length, fields };
    });

    console.log('  Modal found: ' + modalInfo.found);
    if (modalInfo.found) {
      console.log('  Modal heading: "' + modalInfo.heading + '"');
      console.log('  Fields: ' + modalInfo.fieldCount);
      modalInfo.fields.forEach((f, i) => {
        console.log(`    [${i}] ${f.type} id="${f.id}" label="${f.label}" placeholder="${f.placeholder}" val="${f.value}"`);
      });
    }

    // If we got the cover image modal instead, close it and try again
    if (modalInfo.found && modalInfo.heading.toLowerCase().includes('cover')) {
      console.log('  Wrong modal (cover image). Closing...');
      const dismissBtn = await page.$('button[aria-label="Dismiss"], button[aria-label="Close"]');
      if (dismissBtn) await dismissBtn.click();
      await sleep(1000);

      // Try clicking the name area to access intro edit
      console.log('  Trying to click directly on the name...');
      const nameEl = await page.$('h1');
      if (nameEl) {
        const box = await nameEl.boundingBox();
        if (box) {
          // Click the pencil icon that should be near the intro section
          // It's typically to the right side of the intro card
          await page.mouse.click(box.x + box.width + 50, box.y);
          await sleep(2000);
        }
      }
    }

    // If no modal, try the "Add section" approach or direct navigation
    if (!modalInfo.found || modalInfo.heading.toLowerCase().includes('cover')) {
      console.log('  Trying via direct URL navigation...');
      // LinkedIn has a direct edit intro URL
      await page.goto('https://www.linkedin.com/in/aryan-tomar-02727128b/overlay/edit/intro/', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(rand(3000, 5000));
      await snap(page, 'intro-direct-url');

      // Re-check modal
      const directModal = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"], .artdeco-modal');
        if (!modal) return null;

        const inputs = Array.from(modal.querySelectorAll('input:not([type="hidden"])')).filter(i => {
          const r = i.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });

        return {
          found: true,
          heading: (modal.querySelector('h2, h1') || {}).textContent?.trim() || '',
          inputs: inputs.map(i => ({
            id: i.id,
            label: i.getAttribute('aria-label') || '',
            placeholder: i.placeholder || '',
            value: i.value.substring(0, 80),
          })),
        };
      });

      if (directModal && directModal.found) {
        console.log('  Direct URL modal heading: "' + directModal.heading + '"');
        directModal.inputs.forEach((f, i) => {
          console.log(`    [${i}] id="${f.id}" label="${f.label}" placeholder="${f.placeholder}" val="${f.value}"`);
        });

        // Find and update headline field
        let headlineUpdated = false;
        for (const field of directModal.inputs) {
          if (field.id.toLowerCase().includes('headline') || field.label.toLowerCase().includes('headline') || field.placeholder.toLowerCase().includes('headline')) {
            const selector = field.id ? `#${CSS.escape(field.id)}` : `input[aria-label="${field.label}"]`;
            const inp = await page.$(selector);
            if (inp) {
              await inp.click({ clickCount: 3 });
              await sleep(200);
              await inp.fill('');
              await sleep(100);
              await inp.fill(HEADLINE);
              headlineUpdated = true;
              console.log('  >>> HEADLINE FIELD UPDATED! <<<');
            }
            break;
          }
        }

        if (!headlineUpdated) {
          // Try all inputs - look for the one that might be headline by position or emptiness
          console.log('  Headline field not identified by label. Trying all inputs...');
          for (const field of directModal.inputs) {
            if (field.placeholder.toLowerCase() === 'search') continue; // skip search
            if (!field.value && field.placeholder === '') {
              // Empty unlabeled field could be headline
              const selector = field.id ? '#' + field.id.replace(/:/g, '\\:') : null;
              if (selector) {
                const inp = await page.$(selector);
                if (inp) {
                  await inp.fill(HEADLINE);
                  console.log('  >>> Filled empty field with headline <<<');
                  headlineUpdated = true;
                  break;
                }
              }
            }
          }
        }

        if (!headlineUpdated) {
          // Ultimate fallback: use page.evaluate to find and fill
          headlineUpdated = await page.evaluate((headline) => {
            const modal = document.querySelector('[role="dialog"], .artdeco-modal');
            if (!modal) return false;

            // Find all visible inputs
            const inputs = Array.from(modal.querySelectorAll('input')).filter(i => {
              const r = i.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && i.type !== 'hidden' && i.placeholder !== 'search';
            });

            // Try to identify headline field by associated label text
            for (const inp of inputs) {
              // Check for label
              const id = inp.id;
              if (id) {
                const label = document.querySelector(`label[for="${id}"]`);
                if (label && label.textContent.trim().toLowerCase().includes('headline')) {
                  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                  nativeInputValueSetter.call(inp, headline);
                  inp.dispatchEvent(new Event('input', { bubbles: true }));
                  inp.dispatchEvent(new Event('change', { bubbles: true }));
                  return true;
                }
              }

              // Check parent/sibling labels
              const parent = inp.closest('.artdeco-text-input--container, .form__input--floating, [class*="form-component"]');
              if (parent) {
                const lbl = parent.querySelector('label');
                if (lbl && lbl.textContent.trim().toLowerCase().includes('headline')) {
                  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                  nativeInputValueSetter.call(inp, headline);
                  inp.dispatchEvent(new Event('input', { bubbles: true }));
                  inp.dispatchEvent(new Event('change', { bubbles: true }));
                  return true;
                }
              }
            }

            return false;
          }, HEADLINE);

          if (headlineUpdated) {
            console.log('  >>> HEADLINE UPDATED via DOM (evaluate)! <<<');
          }
        }

        // Click Save
        if (headlineUpdated) {
          await sleep(rand(1000, 2000));
          const saved = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            for (const btn of btns) {
              const text = btn.textContent.trim().toLowerCase();
              const label = (btn.getAttribute('aria-label') || '').toLowerCase();
              if (text === 'save' || label.includes('save')) {
                const r = btn.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                  btn.click();
                  return true;
                }
              }
            }
            return false;
          });
          console.log('  Save clicked: ' + saved);
          await sleep(rand(3000, 5000));
        }
      }
    }

    await snap(page, 'after-headline-update');

    // ========================================
    // STEP 2: ADD/UPDATE ABOUT SECTION
    // ========================================
    console.log('\n[ABOUT] Handling About section...');

    // Navigate back to profile
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(3000, 5000));

    // Check if About section exists now
    const hasAbout = await page.$('#about');

    if (!hasAbout) {
      console.log('  No About section — need to add one.');
      console.log('  Looking for "Add section" button...');

      // Click "Add section" button
      const addSectionBtn = await page.$('button:has-text("Add section"), button:text("Add section")');
      if (addSectionBtn) {
        await addSectionBtn.click();
        console.log('  Clicked "Add section"');
        await sleep(rand(2000, 3000));
        await snap(page, 'add-section-menu');

        // Look for "About" in the dropdown/modal
        // LinkedIn shows a categorized list
        const aboutOption = await page.$('button:has-text("About"), a:has-text("About"), li:has-text("About"), [class*="menu"] button:has-text("About")');
        if (aboutOption) {
          await aboutOption.click();
          console.log('  Clicked "About" option');
          await sleep(rand(2000, 4000));
        } else {
          // Try finding it in dropdowns - "Core" section might be expanded
          console.log('  Looking for About in menu...');
          const menuItems = await page.$$('[role="menuitem"], [role="option"], button.profile-edit-section-item, li button');
          for (const item of menuItems) {
            const text = (await item.textContent() || '').trim();
            if (text.toLowerCase().includes('about') || text.toLowerCase() === 'summary') {
              await item.click();
              console.log('  Found and clicked About menu item: "' + text + '"');
              break;
            }
          }
          await sleep(rand(2000, 4000));
        }
      } else {
        console.log('  "Add section" button not found');

        // Try direct URL for adding About
        console.log('  Trying direct URL for About...');
        await page.goto('https://www.linkedin.com/in/aryan-tomar-02727128b/overlay/edit/about/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(rand(3000, 5000));
      }
    } else {
      console.log('  About section exists — opening editor...');
      // Try direct URL
      await page.goto('https://www.linkedin.com/in/aryan-tomar-02727128b/overlay/edit/about/', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(rand(3000, 5000));
    }

    await snap(page, 'about-editor');

    // Fill the About text
    const aboutFilled = await page.evaluate((aboutText) => {
      // Find textarea in any modal
      const textareas = Array.from(document.querySelectorAll('textarea')).filter(t => {
        const r = t.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });

      if (textareas.length > 0) {
        const ta = textareas[0];
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeSetter.call(ta, aboutText);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, method: 'textarea-native' };
      }

      // Try contenteditable
      const editables = Array.from(document.querySelectorAll('[contenteditable="true"]')).filter(e => {
        const r = e.getBoundingClientRect();
        return r.width > 50 && r.height > 20;
      });

      if (editables.length > 0) {
        editables[0].textContent = aboutText;
        editables[0].dispatchEvent(new Event('input', { bubbles: true }));
        return { success: true, method: 'contenteditable' };
      }

      return { success: false, method: 'none' };
    }, ABOUT);

    console.log('  About fill result: ' + JSON.stringify(aboutFilled));

    if (!aboutFilled.success) {
      // Playwright-level fallback
      const ta = await page.$('textarea:visible');
      if (ta) {
        await ta.click();
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await sleep(200);
        await ta.fill(ABOUT);
        console.log('  >>> ABOUT FILLED via Playwright! <<<');
        aboutFilled.success = true;
      } else {
        console.log('  WARNING: No textarea found for About section');
      }
    }

    if (aboutFilled.success) {
      console.log('  >>> ABOUT SECTION UPDATED! <<<');
      await sleep(rand(1000, 2000));

      // Save
      const saved = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        for (const btn of btns) {
          const text = btn.textContent.trim().toLowerCase();
          if (text === 'save') {
            const r = btn.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) { btn.click(); return true; }
          }
        }
        return false;
      });
      console.log('  Save clicked: ' + saved);
      await sleep(rand(3000, 5000));
    }

    // ========================================
    // FINAL VERIFICATION
    // ========================================
    console.log('\n[VERIFY] Final profile check...');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(5000, 7000));
    await snap(page, 'profile-AFTER');

    // Scroll down for full profile
    await page.evaluate(() => window.scrollTo(0, 400));
    await sleep(1000);
    await snap(page, 'profile-AFTER-scrolled');

    // Read updated profile
    const finalProfile = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const name = h1 ? h1.textContent.trim() : 'NOT_FOUND';

      // Try to get headline text
      let headline = 'NOT_FOUND';
      if (h1) {
        let sibling = h1.parentElement?.nextElementSibling;
        while (sibling) {
          const text = sibling.textContent.trim();
          if (text && text !== name && text.length > 5 && text.length < 200 && !text.includes('connections') && !text.includes('Contact info')) {
            headline = text;
            break;
          }
          sibling = sibling.nextElementSibling;
        }
      }

      // Check about
      const aboutEl = document.querySelector('#about');
      let aboutText = 'NOT_FOUND';
      if (aboutEl) {
        const section = aboutEl.closest('section');
        if (section) {
          const spans = section.querySelectorAll('span[aria-hidden="true"]');
          for (const s of spans) {
            if (s.textContent.trim().length > 50) {
              aboutText = s.textContent.trim().substring(0, 100) + '...';
              break;
            }
          }
        }
      }

      return { name, headline, aboutText };
    });

    console.log('\n  ╔════════════════════════════════════════════════════╗');
    console.log('  ║            FINAL PROFILE STATUS                     ║');
    console.log('  ╠════════════════════════════════════════════════════╣');
    console.log('  ║  Name:     ' + finalProfile.name.padEnd(42) + '║');
    console.log('  ║  Headline: ' + finalProfile.headline.substring(0, 42).padEnd(42) + '║');
    console.log('  ║  About:    ' + finalProfile.aboutText.substring(0, 42).padEnd(42) + '║');
    console.log('  ╚════════════════════════════════════════════════════╝');

    const headlineOk = finalProfile.headline.includes('Backend Engineer');
    const aboutOk = finalProfile.aboutText !== 'NOT_FOUND' && finalProfile.aboutText.length > 50;

    console.log('\n  Headline update: ' + (headlineOk ? 'CONFIRMED ✓' : 'NEEDS MANUAL CHECK'));
    console.log('  About update:   ' + (aboutOk ? 'CONFIRMED ✓' : 'NEEDS MANUAL CHECK'));

    console.log('\n  All screenshots saved to: ' + SCREENSHOTS_DIR);
    console.log('\n  Browser will stay open for 90s. Review the profile now...');
    await sleep(90000);

  } catch (err) {
    console.error('\n[ERROR] ' + err.message);
    console.error(err.stack ? err.stack.split('\n').slice(0, 4).join('\n') : '');
    await snap(page, 'ERROR');
  } finally {
    await context.close();
    console.log('\n[DONE] Browser closed.');
  }
}

main();
