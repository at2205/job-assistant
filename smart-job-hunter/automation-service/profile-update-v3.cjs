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

async function main() {
  console.log('=== LinkedIn Profile Updater v3 ===\n');

  const userDataDir = path.resolve(__dirname, 'sessions', 'li-persistent');
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  console.log('[1/7] Launching browser...');
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

  // Stealth
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    window.chrome = { runtime: {} };
  });

  try {
    // ===== LOGIN =====
    console.log('[2/7] Navigating to LinkedIn...');
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(rand(2000, 4000));

    let url = page.url();

    // Check if already logged in (redirected to feed)
    if (url.includes('/feed') || url.includes('/mynetwork') || url.includes('/in/')) {
      console.log('[2/7] Already logged in! Skipping login.');
    } else {
      console.log('[2/7] Filling credentials...');

      // Cookie consent
      try {
        const cookieBtn = await page.$('button[action-type="ACCEPT"]');
        if (cookieBtn) { await cookieBtn.click(); await sleep(1000); }
      } catch(e) {}

      // Email
      const emailEl = await page.$('#username');
      if (emailEl) {
        await emailEl.click();
        await sleep(rand(300, 600));
        // Type character by character for human-like behavior
        for (const ch of EMAIL) {
          await page.keyboard.type(ch, { delay: rand(40, 120) });
        }
        console.log('  -> Email typed');
      } else {
        console.log('  ERROR: Email field not found!');
      }

      await sleep(rand(500, 1000));

      // Password
      const passEl = await page.$('#password');
      if (passEl) {
        await passEl.click();
        await sleep(rand(300, 600));
        for (const ch of PASSWORD) {
          await page.keyboard.type(ch, { delay: rand(40, 120) });
        }
        console.log('  -> Password typed');
      } else {
        console.log('  ERROR: Password field not found!');
      }

      await sleep(rand(800, 1500));

      // Submit
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        console.log('  -> Sign In clicked');
      }

      // Wait for result
      console.log('[2/7] Waiting for login result...');
      await sleep(rand(6000, 10000));
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'login-attempt.png') });

      url = page.url();
      console.log('  -> Current URL: ' + url);

      // Handle security checkpoint / CAPTCHA / 2FA
      if (url.includes('/checkpoint') || url.includes('/challenge')) {
        console.log('\n  *** SECURITY CHECKPOINT DETECTED ***');
        console.log('  Please solve it manually in the browser window.');
        console.log('  Waiting up to 5 minutes...\n');

        const deadline = Date.now() + 300000;
        while (Date.now() < deadline) {
          await sleep(3000);
          url = page.url();
          if (url.includes('/feed') || url.includes('/in/') || url.includes('/mynetwork') || url.includes('/jobs') || url.includes('/messaging')) {
            break;
          }
        }
      }

      // Check for error
      const errorEl = await page.$('.form__label--error, #error-for-password, [id*="error"]');
      if (errorEl) {
        const errText = await errorEl.textContent();
        console.log('  LOGIN ERROR: ' + (errText || '').trim());
        console.log('\n  Please log in manually. Waiting 5 minutes...');
        const deadline = Date.now() + 300000;
        while (Date.now() < deadline) {
          await sleep(3000);
          url = page.url();
          if (url.includes('/feed') || url.includes('/in/') || url.includes('/mynetwork')) break;
        }
      }

      // Final check
      url = page.url();
      if (url.includes('/feed') || url.includes('/in/') || url.includes('/mynetwork') || url.includes('/jobs') || url.includes('/messaging')) {
        console.log('[2/7] LOGIN SUCCESSFUL!');
      } else {
        console.log('[2/7] WARNING: Login may have failed. URL: ' + url);
        console.log('  Continuing anyway to check...');
      }
    }

    await sleep(2000);

    // ===== AUDIT PROFILE =====
    console.log('\n[3/7] Auditing current profile...');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(3000, 5000));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'profile-BEFORE.png'), fullPage: false });
    console.log('  -> Screenshot: profile-BEFORE.png');

    // Scroll full page for complete audit
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'profile-BEFORE-mid.png') });
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1000);

    const profile = await page.evaluate(() => {
      const g = (s) => {
        const el = document.querySelector(s);
        return el ? el.textContent.trim() : 'NOT_FOUND';
      };
      const aboutEl = document.querySelector('#about');
      let aboutText = 'NOT_FOUND';
      if (aboutEl) {
        const section = aboutEl.closest('section');
        if (section) {
          const textEl = section.querySelector('.inline-show-more-text, .pv-shared-text-with-see-more span[aria-hidden="true"], div.display-flex span[aria-hidden="true"]');
          if (textEl) aboutText = textEl.textContent.trim();
        }
      }
      return {
        name: g('h1'),
        headline: g('.text-body-medium.break-words'),
        location: g('.text-body-small.inline.t-black--light.break-words'),
        about: aboutText,
        url: window.location.href,
      };
    });

    console.log('\n  CURRENT PROFILE AUDIT:');
    console.log('  ─────────────────────');
    console.log('  Name:     ' + profile.name);
    console.log('  Headline: ' + profile.headline);
    console.log('  Location: ' + profile.location);
    console.log('  About:    ' + (profile.about === 'NOT_FOUND' ? 'MISSING' : profile.about.substring(0, 80) + '...'));
    console.log('  URL:      ' + profile.url);

    console.log('\n  WEAKNESSES:');
    if (profile.headline.includes('Student') || profile.headline.includes('Fresher') || profile.headline.includes('Aspiring') || profile.headline.length < 40) {
      console.log('  [!] Headline needs upgrade — too generic/short');
    }
    if (profile.about === 'NOT_FOUND' || profile.about.length < 100) {
      console.log('  [!] About section missing or too short');
    }

    // ===== UPDATE HEADLINE =====
    console.log('\n[4/7] Updating headline...');

    // Find edit buttons with multiple selector strategies
    let editBtns = await page.$$('button[aria-label*="edit" i]');
    if (editBtns.length === 0) {
      editBtns = await page.$$('button:has(li-icon[type="edit-medium"])');
    }
    if (editBtns.length === 0) {
      editBtns = await page.$$('button:has(svg[data-test-icon="edit-medium"])');
    }
    if (editBtns.length === 0) {
      // Broad fallback: any button near the intro card
      editBtns = await page.$$('.pv-top-card button, .artdeco-card button');
    }

    console.log('  Found ' + editBtns.length + ' edit buttons');

    // Log all edit buttons to find the right one
    let introBtn = null;
    for (const btn of editBtns) {
      const label = await btn.getAttribute('aria-label') || '';
      const text = (await btn.textContent() || '').trim().substring(0, 40);
      const isVisible = await btn.isVisible().catch(() => false);
      if (isVisible) {
        console.log('  -> "' + label + '" text="' + text + '"');
        if (!introBtn && (label.toLowerCase().includes('intro') || label === '' || label.toLowerCase().includes('profile'))) {
          introBtn = btn;
        }
      }
    }

    if (!introBtn && editBtns.length > 0) {
      introBtn = editBtns[0]; // fallback to first
    }

    if (introBtn) {
      await introBtn.scrollIntoViewIfNeeded();
      await sleep(rand(500, 1000));
      await introBtn.click();
      console.log('  Clicked edit intro button');
      await sleep(rand(2500, 4000));
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'edit-intro-modal.png') });
      console.log('  -> Screenshot: edit-intro-modal.png');

      // Enumerate ALL visible fields in modal
      const allInputs = await page.$$('input:visible');
      const allTextareas = await page.$$('textarea:visible');
      console.log('  Modal has ' + allInputs.length + ' inputs, ' + allTextareas.length + ' textareas');

      let headlineFound = false;
      for (let i = 0; i < allInputs.length; i++) {
        const id = (await allInputs[i].getAttribute('id') || '').toLowerCase();
        const name = (await allInputs[i].getAttribute('name') || '').toLowerCase();
        const label = (await allInputs[i].getAttribute('aria-label') || '').toLowerCase();
        const placeholder = (await allInputs[i].getAttribute('placeholder') || '').toLowerCase();
        const val = await allInputs[i].inputValue().catch(() => '');
        console.log('  Input[' + i + '] id="' + id + '" name="' + name + '" label="' + label + '" placeholder="' + placeholder + '" val="' + val.substring(0, 50) + '"');

        if (id.includes('headline') || name.includes('headline') || label.includes('headline') || placeholder.includes('headline')) {
          await allInputs[i].click({ clickCount: 3 });
          await sleep(200);
          await allInputs[i].fill('');
          await sleep(100);
          await allInputs[i].fill(HEADLINE);
          console.log('  >>> HEADLINE UPDATED! <<<');
          headlineFound = true;
        }
      }

      if (!headlineFound) {
        // Try matching by current value (headline field likely contains current headline text)
        for (let i = 0; i < allInputs.length; i++) {
          const val = await allInputs[i].inputValue().catch(() => '');
          if (val && profile.headline !== 'NOT_FOUND' && (val.includes(profile.headline.substring(0, 20)) || profile.headline.includes(val.substring(0, 20)))) {
            await allInputs[i].click({ clickCount: 3 });
            await sleep(200);
            await allInputs[i].fill(HEADLINE);
            console.log('  >>> HEADLINE UPDATED (matched by value)! <<<');
            headlineFound = true;
            break;
          }
        }
      }

      // Save
      await sleep(rand(1000, 2000));
      const buttons = await page.$$('button:visible');
      let saved = false;
      for (const btn of buttons) {
        const text = (await btn.textContent() || '').trim().toLowerCase();
        if (text === 'save') {
          await btn.click();
          saved = true;
          console.log('  Intro changes SAVED');
          break;
        }
      }
      if (!saved) {
        // Try aria-label
        for (const btn of buttons) {
          const label = (await btn.getAttribute('aria-label') || '').toLowerCase();
          if (label.includes('save')) {
            await btn.click();
            console.log('  Intro changes SAVED (aria-label)');
            break;
          }
        }
      }
      await sleep(rand(3000, 5000));
    } else {
      console.log('  ERROR: No edit button found for intro section');
    }

    // ===== UPDATE ABOUT =====
    console.log('\n[5/7] Updating About section...');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(3000, 5000));

    // Scroll to About
    const aboutEl = await page.$('#about');
    if (aboutEl) {
      await aboutEl.scrollIntoViewIfNeeded();
      await sleep(rand(1000, 2000));

      // Find edit button within About section
      const aboutSection = await page.$('#about');
      // Go up to parent section
      const sectionEditBtn = await page.evaluate(() => {
        const about = document.querySelector('#about');
        if (!about) return null;
        const section = about.closest('section');
        if (!section) return null;
        const btn = section.querySelector('button[aria-label*="Edit" i], button:has(li-icon[type="edit-medium"]), button:has(svg[data-test-icon="edit-medium"])');
        if (btn) {
          btn.setAttribute('data-auto-about-edit', 'true');
          return true;
        }
        return null;
      });

      if (sectionEditBtn) {
        const aboutEditBtn = await page.$('[data-auto-about-edit="true"]');
        if (aboutEditBtn) {
          await aboutEditBtn.click();
          console.log('  Opened About editor');
          await sleep(rand(2500, 4000));
          await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'about-editor.png') });

          // Find the textarea or contenteditable
          let aboutUpdated = false;
          const textareas = await page.$$('textarea:visible');
          if (textareas.length > 0) {
            await textareas[0].click();
            await page.keyboard.down('Control');
            await page.keyboard.press('a');
            await page.keyboard.up('Control');
            await sleep(300);
            await textareas[0].fill(ABOUT);
            aboutUpdated = true;
            console.log('  >>> ABOUT SECTION UPDATED! <<<');
          }

          if (!aboutUpdated) {
            // Try contenteditable divs
            const editables = await page.$$('div[contenteditable="true"]:visible, div[role="textbox"]:visible');
            if (editables.length > 0) {
              await editables[0].click();
              await page.keyboard.down('Control');
              await page.keyboard.press('a');
              await page.keyboard.up('Control');
              await sleep(200);
              await page.keyboard.press('Delete');
              await sleep(200);
              // Type the about text
              await page.keyboard.type(ABOUT, { delay: 5 });
              aboutUpdated = true;
              console.log('  >>> ABOUT SECTION UPDATED (contenteditable)! <<<');
            }
          }

          if (aboutUpdated) {
            await sleep(rand(1000, 2000));
            const buttons = await page.$$('button:visible');
            for (const btn of buttons) {
              const text = (await btn.textContent() || '').trim().toLowerCase();
              if (text === 'save') {
                await btn.click();
                console.log('  About section SAVED');
                break;
              }
            }
          } else {
            console.log('  WARNING: Could not find About text field');
            // Log what we see
            const allEls = await page.$$('input:visible, textarea:visible, [contenteditable]:visible');
            console.log('  Found ' + allEls.length + ' editable elements');
          }
          await sleep(rand(3000, 5000));
        }
      } else {
        console.log('  No edit button found in About section');
        console.log('  -> You may need to add About section first: Profile > Add section > About');
      }
    } else {
      console.log('  No About section found on profile');
    }

    // ===== SKILLS CHECK =====
    console.log('\n[6/7] Checking Skills section...');
    await page.evaluate(() => {
      const skills = document.querySelector('#skills');
      if (skills) skills.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await sleep(2000);

    const skillsExist = await page.$('#skills');
    if (skillsExist) {
      const skillsList = await page.evaluate(() => {
        const section = document.querySelector('#skills')?.closest('section');
        if (!section) return [];
        const items = section.querySelectorAll('span.hoverable-link-text, a[data-field="skill_page_skill_topic"] span');
        return Array.from(items).map(el => el.textContent?.trim()).filter(Boolean).slice(0, 15);
      });
      console.log('  Current top skills: ' + (skillsList.length ? skillsList.join(', ') : 'None visible'));
      console.log('  -> Skills reordering requires manual action in LinkedIn');
      console.log('     Pin: Java, Spring Boot, React.js as top 3');
    }

    // ===== FINAL VERIFICATION =====
    console.log('\n[7/7] Final verification...');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(rand(4000, 6000));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'profile-AFTER.png'), fullPage: false });
    console.log('  -> Screenshot: profile-AFTER.png');

    // Scroll and capture mid-page
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'profile-AFTER-mid.png') });

    const updated = await page.evaluate(() => {
      const g = (s) => {
        const el = document.querySelector(s);
        return el ? el.textContent.trim() : 'NOT_FOUND';
      };
      return {
        name: g('h1'),
        headline: g('.text-body-medium.break-words'),
      };
    });

    console.log('\n  ╔══════════════════════════════════════╗');
    console.log('  ║     FINAL PROFILE STATUS              ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log('  ║  Name:     ' + updated.name.padEnd(27) + '║');
    console.log('  ║  Headline: ' + updated.headline.substring(0, 27).padEnd(27) + '║');
    console.log('  ╚══════════════════════════════════════╝');

    if (updated.headline.includes('Backend Engineer')) {
      console.log('\n  HEADLINE UPDATE: CONFIRMED');
    } else {
      console.log('\n  HEADLINE UPDATE: NEEDS VERIFICATION');
    }

    console.log('\n  Screenshots saved in: ' + SCREENSHOTS_DIR);
    console.log('  Browser staying open 90s for manual verification...\n');
    await sleep(90000);

  } catch (err) {
    console.error('\n  AUTOMATION ERROR: ' + err.message);
    console.error('  Stack: ' + err.stack?.split('\n').slice(0, 3).join('\n'));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error-' + Date.now() + '.png') }).catch(() => {});
  } finally {
    await context.close();
    console.log('Browser closed. Automation complete.');
  }
}

main();
