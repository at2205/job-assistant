/**
 * Naukri Summary + Projects Updater
 * ==================================
 * Targeted script to update just the Profile Summary section.
 * The "Profile summary" sidebar link scrolls to the section but doesn't open an edit modal.
 * Instead, the section has its own widgetHead with an edit icon, OR it's an "Add" action.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.resolve(__dirname, 'sessions', 'naukri-session');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots', 'naukri-summary');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const delay = (min, max) => sleep(min + Math.random() * (max - min));

const SUMMARY = `Backend-focused software engineer with hands-on experience building scalable systems, REST APIs, and automation workflows using Java, Spring Boot, PostgreSQL, and microservices architecture.

Currently building JobFlow AI — an AI-powered career automation platform featuring Playwright browser automation, Groq LLM integration, ATS scoring engine, PostgreSQL/Supabase backend, and a Next.js analytics dashboard.

Key projects: ConnectVerse (real-time social platform with WebRTC), AEPS Agent Onboarding (fintech biometric with AES-256), mSwasth (healthcare portal, 500+ records), FindiInsure (insurance marketplace).

Core strengths: Java, Spring Boot, REST APIs, PostgreSQL, SQL, Microservices, React.js, Next.js, TypeScript, Docker, Playwright, Supabase, AI/LLM integration, system design, automation engineering.

Open to Backend Engineer, Full Stack Engineer, and SDE roles.`;

async function main() {
  console.log('\n═══ NAUKRI SUMMARY UPDATER ═══\n');

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

    // Step 1: Inspect the Profile summary section structure
    console.log('── Step 1: Inspecting summary section ──');

    // First scroll down to find the profileSummary section
    const summaryInfo = await page.evaluate(() => {
      // Check if profileSummary section exists
      const section = document.querySelector('.profileSummary');
      if (!section) return { found: false, sectionExists: false };

      section.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Get structure
      const widgetHead = section.querySelector('.widgetHead');
      const editIcon = section.querySelector('[class*="edit"], .edit, .icon');
      const content = section.querySelector('.content, p, .txt, .summaryContent');
      const addLink = section.querySelector('a[class*="add"], button[class*="add"]');

      // Check all children
      const children = [];
      section.querySelectorAll('*').forEach(el => {
        if (el.className && typeof el.className === 'string' && el.className.trim()) {
          children.push({
            tag: el.tagName,
            class: el.className.substring(0, 80),
            text: el.textContent?.trim().substring(0, 50),
          });
        }
      });

      return {
        found: true,
        sectionExists: true,
        sectionClass: section.className,
        sectionHTML: section.innerHTML.substring(0, 2000),
        widgetHeadFound: !!widgetHead,
        widgetHeadText: widgetHead?.textContent?.trim(),
        editIconFound: !!editIcon,
        editIconClass: editIcon?.className?.toString(),
        editIconTag: editIcon?.tagName,
        contentFound: !!content,
        contentText: content?.textContent?.trim().substring(0, 100),
        addLinkFound: !!addLink,
        children: children.slice(0, 20),
      };
    });

    console.log(`  Section found: ${summaryInfo.sectionExists}`);

    if (!summaryInfo.sectionExists) {
      // Profile summary might not be visible — check sidebar "Profile summary" link
      console.log('  Checking sidebar...');
      const sidebarResult = await page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        const matches = [];
        for (const el of allElements) {
          const text = el.textContent?.trim();
          if (text === 'Profile summary' || text === 'Profile Summary') {
            matches.push({
              tag: el.tagName,
              class: el.className?.toString().substring(0, 80),
              href: el.href,
              parentTag: el.parentElement?.tagName,
              parentClass: el.parentElement?.className?.toString().substring(0, 80),
              isClickable: el.tagName === 'A' || el.tagName === 'BUTTON' || el.style?.cursor === 'pointer',
            });
          }
        }
        return matches;
      });

      console.log(`  "Profile summary" elements found: ${sidebarResult.length}`);
      sidebarResult.forEach(m => {
        console.log(`    [${m.tag}] class="${m.class}" href="${m.href}" parent=[${m.parentTag}] ${m.parentClass}`);
      });

      // Click the sidebar link
      if (sidebarResult.length > 0) {
        await page.evaluate(() => {
          const allElements = document.querySelectorAll('*');
          for (const el of allElements) {
            if (el.textContent?.trim() === 'Profile summary' && (el.tagName === 'A' || el.tagName === 'SPAN' || el.tagName === 'DIV' || el.tagName === 'LI')) {
              el.click();
              return;
            }
          }
        });
        console.log('  Clicked sidebar "Profile summary"');
        await delay(2000, 3000);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'after-sidebar-click.png') });

        // Check what happened
        const afterClick = await page.evaluate(() => {
          // Check for any open lightbox/drawer
          const openLightboxes = [];
          document.querySelectorAll('.lightbox').forEach(lb => {
            if (!lb.classList.contains('flipClose')) {
              const classes = lb.className;
              const textarea = lb.querySelector('textarea');
              const inputs = lb.querySelectorAll('input, textarea');
              openLightboxes.push({
                class: classes,
                hasTextarea: !!textarea,
                inputCount: inputs.length,
                html: lb.innerHTML?.substring(0, 500),
              });
            }
          });

          // Check for profileSummary section appearing
          const section = document.querySelector('.profileSummary');
          const editDrawer = document.querySelector('.profileSummaryEdit');

          return {
            openLightboxes,
            sectionNowVisible: section && section.offsetParent !== null,
            editDrawerExists: !!editDrawer,
            editDrawerOpen: editDrawer ? !editDrawer.classList.contains('flipClose') : false,
            editDrawerClass: editDrawer?.className,
          };
        });

        console.log(`  Open lightboxes: ${afterClick.openLightboxes.length}`);
        afterClick.openLightboxes.forEach(lb => {
          console.log(`    class="${lb.class}" textarea=${lb.hasTextarea} inputs=${lb.inputCount}`);
        });
        console.log(`  Summary section visible: ${afterClick.sectionNowVisible}`);
        console.log(`  Edit drawer exists: ${afterClick.editDrawerExists}`);
        console.log(`  Edit drawer open: ${afterClick.editDrawerOpen}`);
        console.log(`  Edit drawer class: ${afterClick.editDrawerClass}`);
      }
    } else {
      console.log(`  Section class: ${summaryInfo.sectionClass}`);
      console.log(`  Widget head: ${summaryInfo.widgetHeadFound} — "${summaryInfo.widgetHeadText}"`);
      console.log(`  Edit icon: ${summaryInfo.editIconFound} (${summaryInfo.editIconTag} class="${summaryInfo.editIconClass}")`);
      console.log(`  Content: ${summaryInfo.contentFound} — "${summaryInfo.contentText}"`);
      console.log(`  Children (${summaryInfo.children.length}):`);
      summaryInfo.children.forEach(c => console.log(`    [${c.tag}] .${c.class} "${c.text}"`));

      // Write full HTML for analysis
      fs.writeFileSync(path.join(SCREENSHOTS_DIR, 'summary-section-html.txt'), summaryInfo.sectionHTML || 'empty');
    }

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'summary-section.png') });

    // Step 2: Try to open summary edit
    console.log('\n── Step 2: Opening summary edit ──');

    // Strategy A: Click the edit icon on the profileSummary section
    let opened = await page.evaluate(() => {
      const section = document.querySelector('.profileSummary');
      if (section) {
        const edit = section.querySelector('.edit, [class*="edit"]');
        if (edit) { edit.click(); return 'section-edit'; }
      }
      return null;
    });

    if (!opened) {
      // Strategy B: Check if there's a profileSummaryEdit drawer we can trigger
      opened = await page.evaluate(() => {
        // Look for hidden drawer
        const drawer = document.querySelector('.profileSummaryEdit');
        if (drawer) {
          // Try to trigger it by removing flipClose and adding flipOpen
          drawer.classList.remove('flipClose');
          drawer.classList.add('flipOpen', 'model_open');
          return 'drawer-force';
        }
        return null;
      });
    }

    if (!opened) {
      // Strategy C: Look for "Add" text near profile summary in sidebar and click
      opened = await page.evaluate(() => {
        const links = document.querySelectorAll('a, span, div');
        for (const el of links) {
          const text = el.textContent?.trim().toLowerCase();
          // "Profile summary" text itself may be clickable
          if (text === 'profile summary') {
            el.click();
            return 'text-click';
          }
        }
        return null;
      });
    }

    console.log(`  Open strategy: ${opened || 'none worked'}`);
    await delay(2000, 3000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'after-open-attempt.png') });

    // Step 3: Check if drawer opened and fill textarea
    console.log('\n── Step 3: Checking for open drawer ──');

    const drawerState = await page.evaluate(() => {
      // Check ALL lightboxes for one that's open and has a textarea
      const lightboxes = document.querySelectorAll('.lightbox');
      for (const lb of lightboxes) {
        if (lb.classList.contains('flipClose')) continue;
        const ta = lb.querySelector('textarea');
        if (ta) {
          return {
            found: true,
            drawerClass: lb.className,
            textareaName: ta.name,
            textareaId: ta.id,
            textareaClass: ta.className,
            textareaValue: ta.value?.substring(0, 100),
          };
        }
      }

      // Also check the profileSummaryEdit specifically
      const summaryDrawer = document.querySelector('.profileSummaryEdit');
      if (summaryDrawer) {
        return {
          found: false,
          drawerExists: true,
          drawerClass: summaryDrawer.className,
          isFlipClose: summaryDrawer.classList.contains('flipClose'),
          innerHTML: summaryDrawer.innerHTML?.substring(0, 500),
        };
      }

      return { found: false, drawerExists: false };
    });

    console.log('  Drawer state:', JSON.stringify(drawerState, null, 2));

    if (drawerState.found) {
      console.log('\n── Step 4: Filling summary ──');

      // Fill the textarea
      await page.evaluate((text) => {
        const lightboxes = document.querySelectorAll('.lightbox');
        for (const lb of lightboxes) {
          if (lb.classList.contains('flipClose')) continue;
          const ta = lb.querySelector('textarea');
          if (ta) {
            // Use React-compatible value setting
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            nativeInputValueSetter.call(ta, text);
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.dispatchEvent(new Event('change', { bubbles: true }));
            return;
          }
        }
      }, SUMMARY);

      console.log('  Summary text filled');
      await delay(500, 1000);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'summary-filled.png') });

      // Click Save
      const saved = await page.evaluate(() => {
        const lightboxes = document.querySelectorAll('.lightbox');
        for (const lb of lightboxes) {
          if (lb.classList.contains('flipClose')) continue;
          const btn = lb.querySelector('button.btn-dark-ot, button[type="submit"]');
          if (btn && !btn.disabled) {
            btn.click();
            return true;
          }
        }
        return false;
      });

      console.log(`  Save clicked: ${saved}`);
      await delay(2000, 3000);

      // Handle confirmation dialog
      const confirmed = await page.evaluate(() => {
        const box = document.querySelector('.profileSummaryConfirmation, .res360editconfirmationBox');
        if (box && box.offsetParent !== null) {
          // Find "Yes" or "Save" button
          const btns = box.querySelectorAll('button');
          for (const btn of btns) {
            const text = btn.textContent?.trim().toLowerCase();
            if (text.includes('save') || text.includes('yes') || text.includes('ok')) {
              btn.click();
              return text;
            }
          }
          // Click the first non-cancel button
          for (const btn of btns) {
            if (!btn.textContent?.toLowerCase().includes('cancel')) {
              btn.click();
              return btn.textContent?.trim();
            }
          }
        }
        return null;
      });

      if (confirmed) {
        console.log(`  Confirmation clicked: "${confirmed}"`);
        await delay(2000, 3000);
      }

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'summary-after-save.png') });
    } else if (drawerState.drawerExists && drawerState.isFlipClose) {
      console.log('\n── Step 4: Force-opening summary drawer ──');

      // The drawer exists but is closed. Let's try clicking it open via JS
      // or find the trigger mechanism
      const forceResult = await page.evaluate(() => {
        const drawer = document.querySelector('.profileSummaryEdit');
        if (!drawer) return { success: false, reason: 'drawer not found' };

        // Check if there's a React click handler we can trigger
        // by finding the edit link in the section
        const summarySection = document.querySelector('.profileSummary');
        if (summarySection) {
          // Try all clickable elements in the section
          const clickables = summarySection.querySelectorAll('a, button, span, [class*="edit"], [onclick]');
          for (const c of clickables) {
            const text = c.textContent?.trim().toLowerCase();
            if (text.includes('add') || text.includes('edit') || c.className?.includes('edit')) {
              c.click();
              return { success: true, clicked: c.textContent?.trim(), class: c.className };
            }
          }
        }

        return { success: false, reason: 'no clickable found' };
      });

      console.log('  Force result:', JSON.stringify(forceResult));
      await delay(2000, 3000);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'after-force-open.png') });
    }

    // Step 5: Verify final state
    console.log('\n── Step 5: Final verification ──');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000, 5000);

    const finalState = await page.evaluate(() => {
      const section = document.querySelector('.profileSummary');
      const content = section?.querySelector('.content, p, .txt, .summaryContent, .profileSummaryContent');
      return {
        sectionExists: !!section,
        contentText: content?.textContent?.trim().substring(0, 200) || '(empty)',
        headline: document.querySelector('.resumeHeadline .content, .resumeHeadline p, .resumeHeadline .txt')?.textContent?.trim().substring(0, 200),
        skillCount: document.querySelectorAll('.keySkills .chip, .keyskillList span, .keyskillList a').length,
      };
    });

    console.log(`\n  Summary content: ${finalState.contentText}`);
    console.log(`  Headline: ${finalState.headline}`);
    console.log(`  Skill count: ${finalState.skillCount}`);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'final-state.png') });

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error.png') }).catch(() => {});
  } finally {
    await sleep(3000);
    await context.close();
  }
}

main().catch(console.error);
