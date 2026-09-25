const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

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

async function main() {
  console.log('Starting LinkedIn Profile Updater...');

  const userDataDir = path.resolve(__dirname, 'sessions', 'li-session');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 40,
    viewport: { width: 1920, height: 1080 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });

  const page = context.pages()[0] || await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  try {
    console.log('Navigating to LinkedIn...');
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);

    let url = page.url();
    if (url.includes('/login') || url.includes('/authwall') || url.includes('/checkpoint')) {
      console.log('NOT LOGGED IN - Please log in manually in the browser...');
      console.log('Waiting up to 5 minutes...');
      const deadline = Date.now() + 300000;
      while (Date.now() < deadline) {
        await sleep(5000);
        url = page.url();
        if (url.includes('/feed') || url.includes('/in/') || url.includes('/mynetwork') || url.includes('/jobs')) {
          break;
        }
      }
      if (url.includes('/login') || url.includes('/authwall')) {
        console.log('Login timeout. Exiting.');
        await context.close();
        return;
      }
    }
    console.log('LOGGED IN! URL: ' + page.url());
    await sleep(2000);

    // Go to profile
    console.log('\n--- AUDITING PROFILE ---');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'profile-BEFORE.png') });
    console.log('Screenshot: profile-BEFORE.png');

    const profile = await page.evaluate(() => {
      const g = (s) => document.querySelector(s)?.textContent?.trim() || 'N/A';
      return { name: g('h1'), headline: g('.text-body-medium.break-words'), location: g('.text-body-small.inline.t-black--light.break-words') };
    });
    console.log('Name: ' + profile.name);
    console.log('Current Headline: ' + profile.headline);
    console.log('Location: ' + profile.location);

    // --- UPDATE HEADLINE ---
    console.log('\n--- UPDATING HEADLINE ---');
    // Find edit buttons
    const editBtns = await page.$$('button[aria-label*="edit" i], button:has(li-icon[type="edit-medium"])');
    console.log('Found ' + editBtns.length + ' edit buttons');

    for (const btn of editBtns) {
      const label = await btn.getAttribute('aria-label') || '';
      console.log('  Button: ' + label);
    }

    if (editBtns.length > 0) {
      // Click the first edit button (intro)
      await editBtns[0].scrollIntoViewIfNeeded();
      await sleep(500);
      await editBtns[0].click();
      console.log('Clicked edit intro button');
      await sleep(3000);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'edit-modal.png') });

      // Find headline input
      const inputs = await page.$$('input:visible, textarea:visible');
      console.log('Found ' + inputs.length + ' visible inputs in modal');
      for (let i = 0; i < inputs.length; i++) {
        const id = await inputs[i].getAttribute('id') || '';
        const label = await inputs[i].getAttribute('aria-label') || '';
        const val = await inputs[i].inputValue().catch(() => '');
        console.log('  [' + i + '] id="' + id + '" label="' + label + '" val="' + val.substring(0, 60) + '"');

        // Update headline field
        if (id.toLowerCase().includes('headline') || label.toLowerCase().includes('headline')) {
          await inputs[i].click({ clickCount: 3 });
          await sleep(200);
          await inputs[i].fill(HEADLINE);
          console.log('HEADLINE UPDATED!');
        }
      }

      // Click Save
      await sleep(1000);
      const saveBtns = await page.$$('button:visible');
      for (const btn of saveBtns) {
        const text = await btn.textContent() || '';
        if (text.trim().toLowerCase() === 'save') {
          await btn.click();
          console.log('Saved!');
          break;
        }
      }
      await sleep(3000);
    }

    // --- UPDATE ABOUT ---
    console.log('\n--- UPDATING ABOUT SECTION ---');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);

    // Scroll to About
    const aboutHeader = await page.$('#about');
    if (aboutHeader) {
      await aboutHeader.scrollIntoViewIfNeeded();
      await sleep(1000);

      const aboutSection = await page.$('section:has(#about)');
      if (aboutSection) {
        const aboutEdit = await aboutSection.$('button:has(li-icon[type="edit-medium"]), button[aria-label*="Edit" i]');
        if (aboutEdit) {
          await aboutEdit.click();
          console.log('Opened About editor');
          await sleep(3000);

          // Find textarea
          const tas = await page.$$('textarea:visible');
          console.log('Found ' + tas.length + ' textareas');
          if (tas.length > 0) {
            await tas[0].click();
            await page.keyboard.down('Control');
            await page.keyboard.press('a');
            await page.keyboard.up('Control');
            await sleep(200);
            await tas[0].fill(ABOUT);
            console.log('ABOUT SECTION UPDATED!');

            await sleep(1000);
            const saveBtns = await page.$$('button:visible');
            for (const btn of saveBtns) {
              const text = await btn.textContent() || '';
              if (text.trim().toLowerCase() === 'save') {
                await btn.click();
                console.log('About saved!');
                break;
              }
            }
            await sleep(3000);
          }
        } else {
          console.log('No edit button found for About section');
        }
      }
    } else {
      console.log('No About section found on profile');
    }

    // --- FINAL ---
    console.log('\n--- FINAL VERIFICATION ---');
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(4000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'profile-AFTER.png') });
    console.log('Screenshot: profile-AFTER.png');

    const updated = await page.evaluate(() => {
      const g = (s) => document.querySelector(s)?.textContent?.trim() || 'N/A';
      return { name: g('h1'), headline: g('.text-body-medium.break-words') };
    });
    console.log('Updated Name: ' + updated.name);
    console.log('Updated Headline: ' + updated.headline);

    console.log('\nDONE! Browser staying open for 60s for manual review...');
    await sleep(60000);
  } catch (err) {
    console.error('ERROR: ' + err.message);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error.png') }).catch(() => {});
  } finally {
    await context.close();
    console.log('Browser closed.');
  }
}

main();
