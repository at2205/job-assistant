/**
 * Naukri Summary Updater — Scroll + Click approach
 * Uses aggressive scrolling to find .profileSummary section, then clicks its edit icon.
 * The earlier DOM inspector confirmed the edit icon opens a lightbox with a textarea.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.resolve(__dirname, 'sessions', 'naukri-session');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots', 'naukri-summary-v2');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const delay = (min, max) => sleep(min + Math.random() * (max - min));

const SUMMARY = `Backend-focused software engineer with hands-on experience building scalable systems, REST APIs, and automation workflows using Java, Spring Boot, PostgreSQL, and microservices architecture.

Currently building JobFlow AI — an AI-powered career automation platform featuring Playwright browser automation, Groq LLM integration, ATS scoring engine, PostgreSQL/Supabase backend, and a Next.js analytics dashboard.

Key projects: ConnectVerse (real-time social platform with WebRTC), AEPS Agent Onboarding (fintech biometric with AES-256), mSwasth (healthcare portal, 500+ records), FindiInsure (insurance marketplace).

Core stack: Java, Spring Boot, REST APIs, PostgreSQL, SQL, Microservices, React.js, Next.js, TypeScript, Docker, Playwright, Supabase, AI/LLM integration.

Open to Backend Engineer, Full Stack Engineer, and SDE roles.`;

async function main() {
  console.log('\n═══ NAUKRI SUMMARY UPDATER v2 ═══\n');

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false, slowMo: 30,
    viewport: { width: 1920, height: 1080 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });

  const page = context.pages()[0] || await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  try {
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(4000, 6000);
    if (page.url().includes('/nlogin')) { console.log('NOT LOGGED IN'); await context.close(); return; }
    console.log('Profile loaded.\n');

    // Step 1: Scroll the ENTIRE page to force lazy-load all sections
    console.log('Step 1: Scrolling full page to force lazy-load...');
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    console.log(`  Page height: ${pageHeight}px`);

    for (let y = 0; y < pageHeight; y += 400) {
      await page.evaluate(yy => window.scrollTo(0, yy), y);
      await sleep(300);
    }
    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await delay(1000, 2000);

    // Step 2: Check if profileSummary section exists now
    console.log('\nStep 2: Looking for .profileSummary section...');

    const sectionCheck = await page.evaluate(() => {
      const section = document.querySelector('.profileSummary');
      if (!section) {
        // Search by text content
        const allSections = document.querySelectorAll('[class*="widget"], [class*="section"], [class*="Widget"]');
        const found = [];
        allSections.forEach(s => {
          const text = s.textContent?.substring(0, 60);
          if (text?.toLowerCase().includes('profile summary') || text?.toLowerCase().includes('about me')) {
            found.push({ class: s.className?.toString().substring(0, 80), text });
          }
        });
        return { sectionFound: false, alternatives: found };
      }

      section.scrollIntoView({ behavior: 'smooth', block: 'center' });

      return {
        sectionFound: true,
        class: section.className,
        innerHTML: section.innerHTML.substring(0, 1000),
        hasEdit: !!section.querySelector('.edit, [class*="edit"]'),
        editClass: section.querySelector('.edit, [class*="edit"]')?.className,
        editTag: section.querySelector('.edit, [class*="edit"]')?.tagName,
        hasWidgetHead: !!section.querySelector('.widgetHead'),
        widgetHeadText: section.querySelector('.widgetHead')?.textContent?.trim(),
        hasContent: !!section.querySelector('.content, p, .txt'),
        contentText: section.querySelector('.content, p, .txt')?.textContent?.trim().substring(0, 100),
      };
    });

    console.log('  Result:', JSON.stringify(sectionCheck, null, 2));
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'after-scroll-check.png') });

    if (sectionCheck.sectionFound && sectionCheck.hasEdit) {
      // Great — click the edit icon
      console.log('\nStep 3: Clicking edit icon...');
      await page.evaluate(() => {
        const section = document.querySelector('.profileSummary');
        const edit = section.querySelector('.edit, [class*="edit"]');
        if (edit) edit.click();
      });

      await delay(2500, 4000);

      // Check for open drawer with textarea
      const drawerCheck = await page.evaluate(() => {
        // Check profileSummaryEdit drawer
        const drawer = document.querySelector('.profileSummaryEdit');
        if (drawer && !drawer.classList.contains('flipClose')) {
          const ta = drawer.querySelector('textarea');
          return { drawerOpen: true, hasTextarea: !!ta, taId: ta?.id, taName: ta?.name, taClass: ta?.className, value: ta?.value?.substring(0, 80) };
        }

        // Check any open lightbox with textarea
        const lightboxes = document.querySelectorAll('.lightbox');
        for (const lb of lightboxes) {
          if (lb.classList.contains('flipClose')) continue;
          const ta = lb.querySelector('textarea');
          if (ta) return { drawerOpen: true, lightboxClass: lb.className, hasTextarea: true, taId: ta.id, taName: ta.name, value: ta.value?.substring(0, 80) };
        }

        return { drawerOpen: false };
      });

      console.log('  Drawer:', JSON.stringify(drawerCheck));
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'drawer-state.png') });

      if (drawerCheck.drawerOpen && drawerCheck.hasTextarea) {
        console.log('\nStep 4: Filling summary textarea...');

        // Use React-compatible value setter
        await page.evaluate((text) => {
          const lightboxes = document.querySelectorAll('.lightbox');
          for (const lb of lightboxes) {
            if (lb.classList.contains('flipClose')) continue;
            const ta = lb.querySelector('textarea');
            if (ta) {
              const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
              setter.call(ta, text);
              ta.dispatchEvent(new Event('input', { bubbles: true }));
              ta.dispatchEvent(new Event('change', { bubbles: true }));
              // Also try React synthetic event
              const reactEvent = new Event('input', { bubbles: true });
              Object.defineProperty(reactEvent, 'target', { value: ta });
              ta.dispatchEvent(reactEvent);
              break;
            }
          }
        }, SUMMARY);

        console.log('  ✅ Text filled');
        await delay(500, 1000);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'summary-filled.png') });

        // Click Save
        console.log('\nStep 5: Saving...');
        const saved = await page.evaluate(() => {
          const lightboxes = document.querySelectorAll('.lightbox');
          for (const lb of lightboxes) {
            if (lb.classList.contains('flipClose')) continue;
            const btn = lb.querySelector('button.btn-dark-ot');
            if (btn && !btn.disabled) { btn.click(); return { clicked: true, text: btn.textContent?.trim() }; }
          }
          return { clicked: false };
        });

        console.log('  Save:', JSON.stringify(saved));
        await delay(2500, 4000);

        // Handle confirmation dialog
        const confirmed = await page.evaluate(() => {
          // Check for the confirmation box
          const boxes = document.querySelectorAll('.res360editconfirmationBox, .profileSummaryConfirmation, [class*="confirmation"]');
          for (const box of boxes) {
            if (box.offsetParent !== null || box.offsetHeight > 0 ||
                (!box.classList.contains('flipClose') && !box.style.display?.includes('none'))) {
              const btns = box.querySelectorAll('button');
              for (const b of btns) {
                const t = b.textContent?.trim().toLowerCase();
                if (t && !t.includes('cancel') && !t.includes('no') && !t.includes('close')) {
                  b.click();
                  return { confirmed: true, buttonText: b.textContent?.trim() };
                }
              }
            }
          }
          return { confirmed: false };
        });

        console.log('  Confirmation:', JSON.stringify(confirmed));
        await delay(2000, 3000);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'after-save.png') });

        // Verify
        await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(4000, 6000);

        // Scroll to summary section
        const verifyResult = await page.evaluate(() => {
          const section = document.querySelector('.profileSummary');
          if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const content = section.querySelector('.content, p, .txt, .summaryContent');
            return { found: true, content: content?.textContent?.trim().substring(0, 200) || '(empty)' };
          }
          return { found: false };
        });

        await delay(1000, 2000);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'verify-summary.png') });
        console.log(`\n  ✅ Summary verification: ${verifyResult.content}`);
      } else {
        console.log('  ❌ Drawer did not open or no textarea found');

        // Check the profileSummaryEdit drawer's full state
        const debugDrawer = await page.evaluate(() => {
          const d = document.querySelector('.profileSummaryEdit');
          return d ? { class: d.className, html: d.innerHTML.substring(0, 500), childCount: d.children.length } : null;
        });
        console.log('  profileSummaryEdit debug:', JSON.stringify(debugDrawer));
      }
    } else if (!sectionCheck.sectionFound) {
      console.log('\n  .profileSummary NOT FOUND. Trying sidebar approach...');

      // Click "Profile summary" text in sidebar
      await page.evaluate(() => window.scrollTo(0, 0));
      await delay(500, 1000);

      const sidebarClicked = await page.evaluate(() => {
        const items = document.querySelectorAll('li, a, span');
        for (const el of items) {
          if (el.textContent?.trim() === 'Profile summary') {
            el.click();
            return true;
          }
        }
        return false;
      });

      console.log(`  Sidebar click: ${sidebarClicked}`);
      await delay(2000, 3000);

      // After clicking sidebar, the page should scroll to the section
      // Now try to find the edit icon
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'after-sidebar.png') });

      // Check current scroll position and nearby elements
      const nearbyElements = await page.evaluate(() => {
        const viewportMid = window.scrollY + window.innerHeight / 2;
        const nearby = [];
        document.querySelectorAll('[class*="summary"], [class*="Summary"], .profileSummary, .widgetHead').forEach(el => {
          const rect = el.getBoundingClientRect();
          nearby.push({
            tag: el.tagName, class: el.className?.toString().substring(0, 80),
            text: el.textContent?.trim().substring(0, 60),
            top: Math.round(rect.top), visible: rect.top >= 0 && rect.top < window.innerHeight,
          });
        });
        return nearby;
      });

      console.log('  Nearby elements:');
      nearbyElements.forEach(e => console.log(`    [${e.tag}] .${e.class} top=${e.top} vis=${e.visible} "${e.text}"`));
    }

    console.log('\n═══ DONE ═══');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error.png') }).catch(() => {});
  } finally {
    await sleep(3000);
    await context.close();
  }
}

main().catch(console.error);
