/**
 * LinkedIn Profile Updater — Browser Automation Script
 *
 * Safely logs into LinkedIn, audits the profile, and updates sections.
 * Uses human-like delays and stealth measures.
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';

// --- Configuration ---
const LINKEDIN_EMAIL = process.env.NAUKRI_EMAIL || 'tomar.aryan16j@gmail.com';
const LINKEDIN_PASSWORD = process.env.LINKEDIN_PASSWORD || 'Luck@16072002';

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

// --- Utilities ---
function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function randomDelay(min: number, max: number): Promise<void> {
  return sleep(min + Math.random() * (max - min));
}

async function humanType(page: Page, selector: string, text: string): Promise<void> {
  const el = await page.$(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  await el.click();
  await sleep(300);
  // Clear existing text
  await el.evaluate((e: any) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
  for (const char of text) {
    await page.keyboard.type(char, { delay: 30 + Math.random() * 80 });
    if (Math.random() < 0.03) await sleep(200 + Math.random() * 400);
  }
}

async function takeScreenshot(page: Page, name: string): Promise<string> {
  const path = `./screenshots/profile-${name}-${Date.now()}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log(`📸 Screenshot: ${path}`);
  return path;
}

// --- Main Flow ---
async function main() {
  console.log('🚀 LinkedIn Profile Updater Starting...\n');

  // Launch visible browser
  const browser = await chromium.launch({
    headless: false,
    slowMo: 50,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--no-sandbox',
      '--window-size=1920,1080',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });

  const page = await context.newPage();

  // Stealth
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    (window as any).chrome = { runtime: {} };
  });

  try {
    // ===== STEP 1: LOGIN =====
    console.log('━━━ STEP 1: LOGIN ━━━');
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await randomDelay(2000, 4000);

    // Check if already logged in
    if (page.url().includes('/feed') || page.url().includes('/mynetwork')) {
      console.log('✅ Already logged in!');
    } else {
      console.log('Filling credentials...');

      // Dismiss cookie banner if present
      const cookieBtn = await page.$('button[action-type="ACCEPT"]');
      if (cookieBtn) { await cookieBtn.click(); await sleep(1000); }

      // Fill email
      const emailField = await page.$('#username, input[name="session_key"]');
      if (emailField) {
        await emailField.click();
        await sleep(300);
        await emailField.fill(LINKEDIN_EMAIL);
        console.log('  Email filled');
      }
      await randomDelay(500, 1000);

      // Fill password
      const passField = await page.$('#password, input[name="session_password"]');
      if (passField) {
        await passField.click();
        await sleep(300);
        await passField.fill(LINKEDIN_PASSWORD);
        console.log('  Password filled');
      }
      await randomDelay(800, 1500);

      // Click sign in
      const signInBtn = await page.$('button[type="submit"]');
      if (signInBtn) {
        await signInBtn.click();
        console.log('  Sign in clicked');
      }
      await randomDelay(5000, 8000);

      // Screenshot after login attempt
      await takeScreenshot(page, 'login-result');

      // Check for CAPTCHA — wait for manual resolution
      const captcha = await page.$('#captcha-internal, iframe[title*="challenge"], iframe[title*="Security"]');
      if (captcha) {
        console.log('⚠️  CAPTCHA detected. Please solve it manually in the browser...');
        console.log('   Waiting up to 120 seconds...');
        try {
          await page.waitForURL('**/feed/**', { timeout: 120000 });
        } catch {
          console.log('❌ CAPTCHA not resolved in time');
        }
      }

      // Check for 2FA
      const twoFA = await page.$('#input__phone_verification_pin, input[name="pin"]');
      if (twoFA) {
        console.log('⚠️  2FA required. Please enter OTP in the browser...');
        console.log('   Waiting up to 90 seconds...');
        try {
          await page.waitForURL('**/feed/**', { timeout: 90000 });
        } catch {
          console.log('❌ 2FA timeout');
        }
      }

      // Verify login
      const currentUrl = page.url();
      if (currentUrl.includes('/feed') || currentUrl.includes('/in/') || currentUrl.includes('/mynetwork')) {
        console.log('✅ Login successful!');
      } else {
        // Check for error message
        const errorMsg = await page.$('.form__label--error, #error-for-password, [class*="error"]');
        if (errorMsg) {
          const text = await errorMsg.textContent();
          console.log(`❌ Login error: ${text?.trim()}`);
        } else {
          console.log(`⚠️  Unclear login state. Current URL: ${currentUrl}`);
        }
        console.log('\n📌 If login failed, resolve it manually in the open browser.');
        console.log('   The browser will stay open. Once you are logged in, press Enter here to continue...');
        // Wait for user to press enter
        await new Promise<void>(resolve => {
          process.stdin.once('data', () => resolve());
        });
      }
    }

    await takeScreenshot(page, 'post-login');

    // ===== STEP 2: AUDIT CURRENT PROFILE =====
    console.log('\n━━━ STEP 2: AUDIT CURRENT PROFILE ━━━');

    // Navigate to own profile
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(3000, 5000);
    await takeScreenshot(page, 'profile-before');

    // Extract current profile data
    const profileData = await page.evaluate(() => {
      const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim() || 'NOT FOUND';

      return {
        name: getText('h1'),
        headline: getText('.text-body-medium.break-words'),
        location: getText('.text-body-small.inline.t-black--light.break-words'),
        about: getText('#about ~ div .inline-show-more-text, section:has(#about) .inline-show-more-text'),
        connections: getText('.t-bold:has(+ .t-black--light)'),
        currentUrl: window.location.href,
      };
    });

    console.log('\n📋 Current Profile Audit:');
    console.log(`   Name: ${profileData.name}`);
    console.log(`   Headline: ${profileData.headline}`);
    console.log(`   Location: ${profileData.location}`);
    console.log(`   Connections: ${profileData.connections}`);
    console.log(`   About: ${profileData.about.substring(0, 100)}...`);
    console.log(`   URL: ${profileData.currentUrl}`);

    // Audit weaknesses
    console.log('\n🔍 Profile Weaknesses:');
    if (profileData.headline.includes('Student') || profileData.headline.includes('Fresher') || profileData.headline.includes('Aspiring')) {
      console.log('   ⚠️  Headline signals "fresher" — needs upgrade');
    }
    if (profileData.headline.length < 40) {
      console.log('   ⚠️  Headline too short — missing keywords');
    }
    if (profileData.about === 'NOT FOUND' || profileData.about.length < 100) {
      console.log('   ⚠️  About section is missing or too short');
    }

    // ===== STEP 3: UPDATE HEADLINE =====
    console.log('\n━━━ STEP 3: UPDATE HEADLINE ━━━');

    // Click edit intro (pencil icon near the top of profile)
    const editIntroBtn = await page.$('button[aria-label="Edit intro"], button.pv-top-card-v2-ctas button[class*="edit"], [data-test-icon="edit-medium"]');
    if (!editIntroBtn) {
      // Try alternate: clicking the pencil icon
      const pencils = await page.$$('button:has(svg[data-test-icon="edit-medium"]), .profile-edit-btn, button[aria-label*="edit" i]');
      console.log(`   Found ${pencils.length} edit buttons`);

      // The first edit button on profile is usually the intro edit
      if (pencils.length > 0) {
        await pencils[0].click();
        console.log('   Clicked first edit button');
      } else {
        console.log('   ❌ No edit button found. Trying direct URL approach...');
        // Try navigating to edit page
        await page.goto('https://www.linkedin.com/in/me/edit/intro/', { waitUntil: 'domcontentloaded', timeout: 15000 });
      }
    } else {
      await editIntroBtn.click();
    }
    await randomDelay(2000, 4000);
    await takeScreenshot(page, 'edit-intro-modal');

    // Look for headline input field in the edit modal
    const headlineInput = await page.$('input[id*="headline"], input[name*="headline"], input[aria-label*="Headline" i]');
    if (headlineInput) {
      await headlineInput.click({ clickCount: 3 }); // select all
      await sleep(200);
      await headlineInput.fill(PROFILE_UPDATES.headline);
      console.log(`   ✅ Headline updated to: ${PROFILE_UPDATES.headline}`);
      await randomDelay(1000, 2000);

      // Save the intro changes
      const saveBtn = await page.$('button:has-text("Save"), button[aria-label="Save"]');
      if (saveBtn) {
        await saveBtn.click();
        console.log('   ✅ Intro saved');
        await randomDelay(2000, 4000);
      }
    } else {
      console.log('   ⚠️  Headline input not found in edit modal. Trying alternate selectors...');
      // Try looking in a modal/dialog
      const inputs = await page.$$('input:visible');
      for (const inp of inputs) {
        const label = await inp.getAttribute('aria-label') || '';
        const id = await inp.getAttribute('id') || '';
        console.log(`   Found input: id="${id}" label="${label}"`);
      }
    }

    // ===== STEP 4: UPDATE ABOUT SECTION =====
    console.log('\n━━━ STEP 4: UPDATE ABOUT SECTION ━━━');

    // Navigate back to profile if needed
    if (!page.url().includes('/in/')) {
      await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await randomDelay(2000, 4000);
    }

    // Scroll to About section
    await page.evaluate(() => {
      const aboutSection = document.querySelector('#about');
      if (aboutSection) aboutSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await randomDelay(1000, 2000);

    // Find and click the About section edit button
    const aboutEditBtn = await page.$('section:has(#about) button[aria-label*="Edit" i], #about ~ .pvs-header__edit-button, section:has(#about) button:has(svg[data-test-icon="edit-medium"])');
    if (aboutEditBtn) {
      await aboutEditBtn.click();
      console.log('   Clicked About edit button');
      await randomDelay(2000, 4000);

      // Find the textarea and update
      const aboutTextarea = await page.$('textarea[id*="about"], textarea[name*="summary"], textarea[aria-label*="About" i], .artdeco-text-input--textarea textarea, div[role="textbox"]');
      if (aboutTextarea) {
        // Clear and fill
        await aboutTextarea.click();
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await sleep(200);
        await aboutTextarea.fill(PROFILE_UPDATES.about);
        console.log('   ✅ About section updated');
        await randomDelay(1000, 2000);

        // Save
        const saveBtn = await page.$('button:has-text("Save"), button[aria-label="Save"]');
        if (saveBtn) {
          await saveBtn.click();
          console.log('   ✅ About section saved');
          await randomDelay(2000, 4000);
        }
      } else {
        console.log('   ⚠️  About textarea not found');
      }
    } else {
      console.log('   ⚠️  About edit button not found. You may need to add an About section manually first.');
    }

    // ===== STEP 5: FINAL SCREENSHOT =====
    console.log('\n━━━ STEP 5: FINAL VERIFICATION ━━━');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(3000, 5000);
    await takeScreenshot(page, 'profile-after');

    // Re-read profile to verify
    const updatedData = await page.evaluate(() => {
      const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim() || 'NOT FOUND';
      return {
        name: getText('h1'),
        headline: getText('.text-body-medium.break-words'),
        about: getText('#about ~ div .inline-show-more-text, section:has(#about) .inline-show-more-text'),
      };
    });

    console.log('\n📋 Updated Profile:');
    console.log(`   Name: ${updatedData.name}`);
    console.log(`   Headline: ${updatedData.headline}`);
    console.log(`   About: ${updatedData.about.substring(0, 100)}...`);

    console.log('\n✅ Profile update flow complete!');
    console.log('\n📌 The browser will stay open so you can:');
    console.log('   1. Verify the changes look correct');
    console.log('   2. Manually update Experience, Projects, Skills sections');
    console.log('   3. Reorder skills (pin Java, Spring Boot, React.js)');
    console.log('   4. Update Featured section with GitHub repos');
    console.log('\nPress Enter to close the browser...');
    await new Promise<void>(resolve => {
      process.stdin.once('data', () => resolve());
    });

  } catch (err: any) {
    console.error(`\n❌ Error: ${err.message}`);
    await takeScreenshot(page, 'error');
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

main().catch(console.error);
