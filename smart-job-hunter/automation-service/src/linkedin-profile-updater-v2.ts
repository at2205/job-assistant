/**
 * LinkedIn Profile Updater v2 — Uses persistent session
 * Connects to an already-logged-in browser session.
 */

import { chromium, Page } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const PROFILE_UPDATES = {
  headline: `Backend Engineer | Java + Spring Boot | Building AI-Powered Career Automation Platform`,

  about: `I build backend systems and full-stack products — then wire AI into them to make them smarter.

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

Open to backend, full-stack, or product engineering roles where I can build things that matter.`,
};

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function randomDelay(min: number, max: number): Promise<void> {
  return sleep(min + Math.random() * (max - min));
}

async function screenshot(page: Page, name: string): Promise<void> {
  const p = path.join(SCREENSHOTS_DIR, `profile-${name}-${Date.now()}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`📸 ${name}: ${p}`);
}

async function main() {
  console.log('🚀 LinkedIn Profile Updater v2 — Persistent Session\n');

  // Use persistent context so we get cookies/login from previous sessions
  const userDataDir = path.resolve(process.cwd(), 'sessions', 'linkedin-profile-session');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 40,
    viewport: { width: 1920, height: 1080 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--no-sandbox',
    ],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });

  const page = context.pages()[0] || await context.newPage();

  // Stealth
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    (window as any).chrome = { runtime: {} };
  });

  try {
    // ===== CHECK LOGIN STATE =====
    console.log('━━━ Checking login... ━━━');
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(3000, 5000);

    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/authwall')) {
      console.log('⏳ Not logged in. Please log in manually in the browser window...');
      console.log('   Waiting up to 5 MINUTES for you to log in (security codes, captchas, etc.)...');

      // Poll for successful login every 5 seconds for 5 minutes
      let loggedIn = false;
      const deadline = Date.now() + 300000; // 5 minutes
      while (Date.now() < deadline && !loggedIn) {
        await sleep(5000);
        const url = page.url();
        if (url.includes('/feed') || url.includes('/in/') || url.includes('/mynetwork') || url.includes('/jobs') || url.includes('/messaging')) {
          loggedIn = true;
        }
      }

      if (loggedIn) {
        console.log('✅ Login detected!');
      } else {
        console.log('❌ Login timeout after 5 minutes. Exiting.');
        await context.close();
        return;
      }
    } else {
      console.log('✅ Already logged in!');
    }

    await randomDelay(2000, 3000);

    // ===== AUDIT PROFILE =====
    console.log('\n━━━ STEP 1: AUDIT CURRENT PROFILE ━━━');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(3000, 5000);
    await screenshot(page, 'BEFORE');

    // Extract current profile
    const profileData = await page.evaluate(() => {
      const getText = (sel: string) => {
        const el = document.querySelector(sel);
        return el?.textContent?.trim() || 'NOT FOUND';
      };
      return {
        name: getText('h1'),
        headline: getText('.text-body-medium.break-words'),
        location: getText('.text-body-small.inline.t-black--light.break-words'),
        profileUrl: window.location.href,
      };
    });

    console.log('\n📋 Current Profile:');
    console.log(`   Name:     ${profileData.name}`);
    console.log(`   Headline: ${profileData.headline}`);
    console.log(`   Location: ${profileData.location}`);
    console.log(`   URL:      ${profileData.profileUrl}`);

    // ===== UPDATE HEADLINE =====
    console.log('\n━━━ STEP 2: UPDATE HEADLINE ━━━');

    // Find all edit/pencil buttons
    const editButtons = await page.$$('button:has(li-icon[type="edit-medium"]), button:has(svg[data-test-icon="edit-medium"]), button[aria-label*="edit" i]:not([aria-label*="photo" i]):not([aria-label*="background" i])');
    console.log(`   Found ${editButtons.length} edit buttons on profile`);

    let introModalOpened = false;

    // The first pencil icon on profile page is typically the "Edit intro" button
    for (const btn of editButtons) {
      const label = await btn.getAttribute('aria-label') || '';
      console.log(`   Edit button: "${label}"`);
      if (label.toLowerCase().includes('intro') || label.toLowerCase().includes('profile') || label === '') {
        await btn.scrollIntoViewIfNeeded();
        await randomDelay(500, 1000);
        await btn.click();
        introModalOpened = true;
        console.log('   Clicked intro edit button');
        break;
      }
    }

    if (!introModalOpened && editButtons.length > 0) {
      // Fallback: click the first edit button
      await editButtons[0].scrollIntoViewIfNeeded();
      await randomDelay(500, 1000);
      await editButtons[0].click();
      introModalOpened = true;
      console.log('   Clicked first edit button (fallback)');
    }

    await randomDelay(2000, 4000);
    await screenshot(page, 'edit-modal');

    if (introModalOpened) {
      // Look for headline input — LinkedIn uses various selectors
      const headlineSelectors = [
        'input[id*="headline"]',
        'input[name*="headline"]',
        'input[aria-label*="Headline" i]',
        '#single-line-text-form-component-profileEditFormElement-HEADLINE',
        'input[id*="HEADLINE"]',
      ];

      let headlineUpdated = false;
      for (const sel of headlineSelectors) {
        const input = await page.$(sel);
        if (input) {
          await input.click({ clickCount: 3 });
          await sleep(200);
          await input.fill('');
          await sleep(200);
          await input.fill(PROFILE_UPDATES.headline);
          console.log(`   ✅ Headline set: ${PROFILE_UPDATES.headline}`);
          headlineUpdated = true;
          break;
        }
      }

      if (!headlineUpdated) {
        // Debug: list all visible inputs in the modal
        const allInputs = await page.$$('.artdeco-modal input:visible, [role="dialog"] input:visible, form input:visible');
        console.log(`   Found ${allInputs.length} inputs in modal:`);
        for (let i = 0; i < Math.min(allInputs.length, 10); i++) {
          const id = await allInputs[i].getAttribute('id') || '';
          const name = await allInputs[i].getAttribute('name') || '';
          const label = await allInputs[i].getAttribute('aria-label') || '';
          const val = await allInputs[i].inputValue().catch(() => '');
          console.log(`     [${i}] id="${id}" name="${name}" label="${label}" value="${val.substring(0, 50)}"`);
        }
      }

      await randomDelay(1000, 2000);

      // Save button
      const saveButtons = await page.$$('button:has-text("Save"), button[aria-label*="Save" i]');
      for (const btn of saveButtons) {
        if (await btn.isVisible()) {
          await btn.click();
          console.log('   ✅ Saved intro changes');
          break;
        }
      }
      await randomDelay(3000, 5000);
    }

    // ===== UPDATE ABOUT SECTION =====
    console.log('\n━━━ STEP 3: UPDATE ABOUT SECTION ━━━');

    // Reload profile
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(3000, 5000);

    // Scroll to About section
    const aboutExists = await page.$('#about');
    if (aboutExists) {
      await aboutExists.scrollIntoView();
      await randomDelay(1000, 2000);

      // Find edit button for About section
      const aboutSection = await page.$('section:has(#about)');
      if (aboutSection) {
        const aboutEditBtn = await aboutSection.$('button:has(li-icon[type="edit-medium"]), button:has(svg[data-test-icon="edit-medium"]), button[aria-label*="Edit" i]');
        if (aboutEditBtn) {
          await aboutEditBtn.click();
          console.log('   Opened About editor');
          await randomDelay(2000, 4000);

          // Find textarea
          const textareaSelectors = [
            'textarea[id*="summary"]',
            'textarea[name*="summary"]',
            'textarea[aria-label*="About" i]',
            'textarea[id*="about"]',
            '.artdeco-modal textarea',
            '[role="dialog"] textarea',
            'textarea',
          ];

          let aboutUpdated = false;
          for (const sel of textareaSelectors) {
            const ta = await page.$(sel);
            if (ta && await ta.isVisible()) {
              await ta.click();
              await page.keyboard.down('Control');
              await page.keyboard.press('a');
              await page.keyboard.up('Control');
              await sleep(300);
              await ta.fill(PROFILE_UPDATES.about);
              console.log('   ✅ About section text filled');
              aboutUpdated = true;
              break;
            }
          }

          if (!aboutUpdated) {
            // Try contenteditable divs
            const editables = await page.$$('[contenteditable="true"]:visible, div[role="textbox"]:visible');
            if (editables.length > 0) {
              await editables[0].click();
              await page.keyboard.down('Control');
              await page.keyboard.press('a');
              await page.keyboard.up('Control');
              await sleep(200);
              await page.keyboard.press('Delete');
              await sleep(200);
              await editables[0].fill(PROFILE_UPDATES.about);
              console.log('   ✅ About section filled (contenteditable)');
              aboutUpdated = true;
            }
          }

          await randomDelay(1000, 2000);

          // Save
          const saveButtons = await page.$$('button:has-text("Save"), button[aria-label*="Save" i]');
          for (const btn of saveButtons) {
            if (await btn.isVisible()) {
              await btn.click();
              console.log('   ✅ About section saved');
              break;
            }
          }
          await randomDelay(3000, 5000);
        } else {
          console.log('   ⚠️  No edit button found for About section');
        }
      }
    } else {
      console.log('   ⚠️  No About section found — you may need to add one manually first');
      console.log('   → Go to profile > "Add profile section" > "About"');
    }

    // ===== FINAL VERIFICATION =====
    console.log('\n━━━ FINAL VERIFICATION ━━━');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(3000, 5000);
    await screenshot(page, 'AFTER');

    const updatedProfile = await page.evaluate(() => {
      const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim() || 'NOT FOUND';
      return {
        name: getText('h1'),
        headline: getText('.text-body-medium.break-words'),
      };
    });

    console.log('\n📋 Updated Profile:');
    console.log(`   Name:     ${updatedProfile.name}`);
    console.log(`   Headline: ${updatedProfile.headline}`);

    if (updatedProfile.headline.includes('Backend Engineer')) {
      console.log('\n✅ HEADLINE UPDATE CONFIRMED!');
    } else {
      console.log('\n⚠️  Headline may not have updated. Please verify in the browser.');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  PROFILE UPDATE COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📌 MANUAL TASKS REMAINING:');
    console.log('   1. Update Experience section descriptions');
    console.log('   2. Add/update Projects with new descriptions');
    console.log('   3. Reorder Skills (pin Java, Spring Boot, React.js)');
    console.log('   4. Add Featured section items (GitHub repos)');
    console.log('   5. Update profile banner');
    console.log('\n   Browser stays open for 60 seconds for manual review...');

    await sleep(60000);

  } catch (err: any) {
    console.error(`\n❌ Error: ${err.message}`);
    await screenshot(page, 'error');
  } finally {
    await context.close();
    console.log('\nBrowser closed.');
  }
}

main().catch(console.error);
