/**
 * Naukri Project Adder v3 — proper custom dropdown handling
 * Issue: Naukri uses custom div-based dropdowns, not <select> elements.
 * Fix: Click the dropdown trigger → wait for options list → click the matching option.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const SESSION_DIR = path.resolve(__dirname, 'sessions', 'naukri-session');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots', 'naukri-projects-v3');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const delay = (min, max) => sleep(min + Math.random() * (max - min));

const PROJECTS = [
  {
    title: 'CAPS — Channel Administration & Payment System',
    client: 'BankIT',
    year: '2024', month: 'Oct',
    finished: false,
    description: 'Enterprise fintech admin portal managing multi-tier distribution network (Super Admin to Distributor to Agent) for AEPS, DMT, Micro ATM, bill payments, and IRCTC bookings. Migrated legacy Struts 2 to Spring Boot + Next.js. Built 200+ REST APIs with JWT RBAC, KYC management with AWS S3, trade balance and fund management, HubSpot CRM integration, RazorPay payment gateway. Tech: Java, Spring Boot, Next.js, MS SQL Server, AWS S3, JWT, HubSpot, RazorPay.',
  },
  {
    title: 'JobFlow AI — Career Intelligence Platform',
    client: 'Personal Project',
    year: '2025', month: 'Mar',
    finished: false,
    description: 'AI-powered career automation platform with Playwright browser orchestration, ATS scoring engine (150+ jobs analyzed), recruiter probability scoring, PostgreSQL persistence, Spring Boot API backend (51 endpoints), and Next.js analytics dashboard. Retry-safe workflows with full observability. Tech: Java, Spring Boot, PostgreSQL, Playwright, Next.js, TypeScript, Groq AI.',
  },
  {
    title: 'ConnectVerse — Real-Time Social Platform',
    client: 'Personal Project',
    year: '2024', month: 'Jul',
    finished: true,
    description: 'Full-stack social platform with WebRTC peer-to-peer video calling, GitHub OAuth integration, threaded discussions, community systems, and Dockerized deployment. Real-time communication architecture with persistent messaging. Tech: Next.js, Spring Boot, PostgreSQL, WebRTC, Docker, OAuth.',
  },
  {
    title: 'AEPS Agent Onboarding System',
    client: 'BankIT',
    year: '2024', month: 'Aug',
    finished: true,
    description: 'Fintech biometric onboarding pipeline with Aadhaar verification, AES-256 encryption for sensitive data, multi-channel KYC (Mobile + DS Agent), document storage on AWS S3, and agent activation workflows with audit trails. Tech: Java, Spring MVC, SQL Server, AJAX, AES-256 Encryption, REST APIs.',
  },
  {
    title: 'mSwasth — Multilingual Healthcare Portal',
    client: 'FindiBankit',
    year: '2024', month: 'May',
    finished: true,
    description: 'Healthcare marketplace with multilingual support, payment gateway integration, dynamic PDF generation with iTextPDF, lead funnel persistence, and security hardening. Managed 500+ healthcare provider records. Tech: Next.js, React, TypeScript, Tailwind CSS, REST APIs.',
  },
  {
    title: 'FindiInsure — Insurance Marketplace',
    client: 'FindiBankit',
    year: '2024', month: 'Jun',
    finished: true,
    description: 'Insurance comparison and purchase platform with OTP verification, checkout architecture, payment gateway workflows, responsive mobile-first UI, and secure transaction handling. Tech: Next.js, React, TypeScript, REST APIs.',
  },
];

// Helper: interact with Naukri custom dropdown (click trigger, wait, click option)
async function selectCustomDropdown(page, triggerId, optionText) {
  // Click the dropdown trigger element
  const clicked = await page.evaluate((id) => {
    // Naukri dropdowns: the visible element is a div with class like 'customSelect'
    // The trigger is often the element with the given id or its parent
    const el = document.getElementById(id);
    if (!el) return { found: false, id };
    // Click the element itself
    el.click();
    // Also try clicking the parent (some dropdowns wrap the clickable area)
    if (el.parentElement) el.parentElement.click();
    return { found: true, tag: el.tagName, class: el.className?.substring(0, 60) };
  }, triggerId);

  if (!clicked.found) {
    // Try Playwright click directly
    try {
      await page.click(`#${triggerId}`, { timeout: 3000 });
    } catch {
      return false;
    }
  }

  await sleep(800);

  // Now look for the dropdown list and click the matching option
  const selected = await page.evaluate((text) => {
    // Naukri dropdown options appear as <li> elements in a visible list
    const allLists = document.querySelectorAll('ul, ol, .dropdownList, [class*="dropdown"], [class*="optionList"]');
    for (const list of allLists) {
      // Only consider visible lists
      if (list.offsetParent === null && list.offsetHeight === 0) continue;
      const items = list.querySelectorAll('li');
      for (const li of items) {
        const t = li.textContent?.trim();
        if (t === text) {
          li.click();
          return { selected: true, text: t };
        }
      }
    }
    // Fallback: search ALL visible <li> on the page
    const allLi = document.querySelectorAll('li');
    for (const li of allLi) {
      if (li.offsetParent === null && li.offsetHeight === 0) continue;
      const t = li.textContent?.trim();
      if (t === text) {
        li.click();
        return { selected: true, text: t, fallback: true };
      }
    }
    return { selected: false, visibleLists: allLists.length };
  }, optionText);

  return selected.selected;
}

async function addOneProject(page, proj, index) {
  console.log(`\n── Project ${index + 1}/${PROJECTS.length}: ${proj.title} ──`);

  // Scroll to ensure all sections loaded
  const ph = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < ph; y += 400) {
    await page.evaluate(yy => window.scrollTo(0, yy), y);
    await sleep(150);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay(800, 1200);

  // Click "Add project" — try sidebar first, then in-section link
  await page.evaluate(() => {
    const links = document.querySelectorAll('a, span');
    for (const el of links) {
      const t = el.textContent?.trim();
      // sidebar: "Projects   Add" — the "Add" link
      if (t === 'Add' && el.closest('li')?.textContent?.includes('Project')) { el.click(); return; }
    }
    // Fallback: "Add project" text link in the section
    const sectionLinks = document.querySelectorAll('a, button, span');
    for (const el of sectionLinks) {
      if (el.textContent?.trim().toLowerCase() === 'add project') { el.click(); return; }
    }
  });

  await delay(2500, 3500);

  // Verify lightbox opened with project form
  const formOpen = await page.evaluate(() => {
    const lbs = document.querySelectorAll('.lightbox');
    for (const lb of lbs) {
      if (lb.classList.contains('flipClose')) continue;
      if (lb.querySelector('#projectTitle')) return true;
    }
    return false;
  });

  if (!formOpen) {
    console.log('  ❌ Project form did not open');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `p${index + 1}-no-form.png`) });
    return false;
  }

  // 1. Fill Project Title using Playwright's fill (more reliable)
  try {
    const titleSelector = '.lightbox:not(.flipClose) #projectTitle';
    await page.click(titleSelector, { timeout: 3000 });
    await page.fill(titleSelector, proj.title);
    console.log('  ✅ Title');
  } catch (e) {
    // Fallback to evaluate
    await page.evaluate((t) => {
      const lbs = document.querySelectorAll('.lightbox');
      for (const lb of lbs) {
        if (lb.classList.contains('flipClose')) continue;
        const inp = lb.querySelector('#projectTitle');
        if (inp) { inp.value = t; inp.dispatchEvent(new Event('input', { bubbles: true })); break; }
      }
    }, proj.title);
    console.log('  ✅ Title (fallback)');
  }
  await delay(300, 500);

  // 2. Select employment/education tag (custom dropdown)
  console.log('  Selecting employment tag...');
  const tagSelected = await selectCustomDropdown(page, 'eduExpIdFor', 'Java Developer at FindiBankit');
  if (!tagSelected) {
    // Try just clicking it and selecting the first non-placeholder option
    await page.evaluate(() => {
      const lbs = document.querySelectorAll('.lightbox');
      for (const lb of lbs) {
        if (lb.classList.contains('flipClose')) continue;
        const dd = lb.querySelector('#eduExpIdFor, [id*="eduExpId"]');
        if (dd) dd.click();
      }
    });
    await sleep(800);
    await page.evaluate(() => {
      const items = document.querySelectorAll('li');
      for (const li of items) {
        if (li.offsetParent === null) continue;
        const t = li.textContent?.trim();
        if (t && !t.includes('Select') && t.length > 3) {
          li.click();
          return;
        }
      }
    });
  }
  await delay(500, 800);
  console.log(`  ✅ Employment tag: ${tagSelected ? 'matched' : 'first-available'}`);

  // 3. Fill Client
  try {
    // Find the client input — it has placeholder "Enter client name"
    const clientFilled = await page.evaluate((client) => {
      const lbs = document.querySelectorAll('.lightbox');
      for (const lb of lbs) {
        if (lb.classList.contains('flipClose')) continue;
        const inputs = lb.querySelectorAll('input');
        for (const inp of inputs) {
          if (inp.placeholder?.toLowerCase().includes('client') ||
              inp.id?.toLowerCase().includes('client') ||
              inp.name?.toLowerCase().includes('client')) {
            inp.focus();
            inp.value = '';
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(inp, client);
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            inp.dispatchEvent(new Event('blur', { bubbles: true }));
            return true;
          }
        }
      }
      return false;
    }, proj.client);
    console.log(`  ✅ Client: ${clientFilled}`);
  } catch (e) {
    console.log(`  ⚠️ Client fill error: ${e.message}`);
  }
  await delay(300, 500);

  // 4. Set project status (Finished if applicable)
  if (proj.finished) {
    await page.evaluate(() => {
      const lbs = document.querySelectorAll('.lightbox');
      for (const lb of lbs) {
        if (lb.classList.contains('flipClose')) continue;
        const labels = lb.querySelectorAll('label');
        for (const label of labels) {
          if (label.textContent?.trim() === 'Finished') {
            label.click();
            // Also click the radio inside
            const radio = label.querySelector('input[type="radio"]') || label.previousElementSibling;
            if (radio) radio.click();
            return;
          }
        }
        // Try radio buttons directly
        const radios = lb.querySelectorAll('input[type="radio"]');
        for (const r of radios) {
          if (r.value === 'Finished' || r.nextSibling?.textContent?.includes('Finished')) {
            r.click();
            return;
          }
        }
      }
    });
    await delay(300, 500);
  }

  // 5. Select Year (custom dropdown — KEY FIX)
  console.log(`  Selecting year: ${proj.year}...`);

  // Click the year dropdown trigger
  await page.evaluate(() => {
    const lbs = document.querySelectorAll('.lightbox');
    for (const lb of lbs) {
      if (lb.classList.contains('flipClose')) continue;
      const yearEl = lb.querySelector('#projStartYearFor, [id*="StartYear"]');
      if (yearEl) {
        // Click the visible part of the dropdown
        yearEl.click();
        // Also try the parent div which is often the actual trigger
        const parent = yearEl.closest('.customSelect, .dropdownSelect, [class*="dropdown"], [class*="select"]');
        if (parent) parent.click();
      }
    }
  });
  await sleep(1200);

  // Capture dropdown state for debugging
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `p${index + 1}-year-dropdown.png`) });

  // Click the year option
  const yearClicked = await page.evaluate((year) => {
    // Look for visible option lists
    const allLi = document.querySelectorAll('li');
    for (const li of allLi) {
      // Check visibility
      const rect = li.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (li.textContent?.trim() === year) {
        li.click();
        return { clicked: true, text: li.textContent?.trim() };
      }
    }
    // Alternative: look in dropdowns
    const dds = document.querySelectorAll('.dropdownList, [class*="optionList"], [class*="dropdown-menu"]');
    for (const dd of dds) {
      if (dd.offsetHeight === 0) continue;
      const items = dd.querySelectorAll('li, div[role="option"]');
      for (const item of items) {
        if (item.textContent?.trim() === year) {
          item.click();
          return { clicked: true, text: item.textContent?.trim(), inDropdown: true };
        }
      }
    }
    return { clicked: false };
  }, proj.year);
  console.log(`  Year: ${JSON.stringify(yearClicked)}`);
  await delay(500, 800);

  // 6. Select Month (custom dropdown)
  console.log(`  Selecting month: ${proj.month}...`);
  await page.evaluate(() => {
    const lbs = document.querySelectorAll('.lightbox');
    for (const lb of lbs) {
      if (lb.classList.contains('flipClose')) continue;
      const monthEl = lb.querySelector('#projStartMonthFor, [id*="StartMonth"]');
      if (monthEl) {
        monthEl.click();
        const parent = monthEl.closest('.customSelect, .dropdownSelect, [class*="dropdown"], [class*="select"]');
        if (parent) parent.click();
      }
    }
  });
  await sleep(1200);

  const monthClicked = await page.evaluate((month) => {
    const allLi = document.querySelectorAll('li');
    for (const li of allLi) {
      const rect = li.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (li.textContent?.trim() === month) {
        li.click();
        return { clicked: true };
      }
    }
    return { clicked: false };
  }, proj.month);
  console.log(`  Month: ${JSON.stringify(monthClicked)}`);
  await delay(500, 800);

  // 7. Fill Description
  await page.evaluate((desc) => {
    const lbs = document.querySelectorAll('.lightbox');
    for (const lb of lbs) {
      if (lb.classList.contains('flipClose')) continue;
      const ta = lb.querySelector('#projectDetails, textarea');
      if (ta) {
        ta.focus();
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, desc);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  }, proj.description);
  console.log('  ✅ Description');
  await delay(300, 500);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `p${index + 1}-filled.png`) });

  // 8. Click Save
  await page.evaluate(() => {
    const lbs = document.querySelectorAll('.lightbox');
    for (const lb of lbs) {
      if (lb.classList.contains('flipClose')) continue;
      const btns = lb.querySelectorAll('button');
      for (const btn of btns) {
        if (btn.textContent?.trim() === 'Save') { btn.click(); return; }
      }
    }
  });
  await delay(3000, 5000);

  // Check if form closed (= success)
  const formClosed = await page.evaluate(() => {
    const lbs = document.querySelectorAll('.lightbox');
    for (const lb of lbs) {
      if (lb.classList.contains('flipClose')) continue;
      if (lb.querySelector('#projectTitle')) return false; // still open
    }
    return true;
  });

  if (formClosed) {
    console.log(`  ✅ Project SAVED SUCCESSFULLY`);
    return true;
  } else {
    console.log('  ⚠️ Form still open — checking errors...');
    const errors = await page.evaluate(() => {
      const lbs = document.querySelectorAll('.lightbox');
      for (const lb of lbs) {
        if (lb.classList.contains('flipClose')) continue;
        const errs = lb.querySelectorAll('.error, .errorMsg, [class*="error"]');
        return [...errs].map(e => e.textContent?.trim()).filter(t => t && t.length < 200);
      }
      return [];
    });
    console.log(`  Errors: ${errors.join(' | ')}`);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `p${index + 1}-errors.png`) });

    // Close the form
    await page.evaluate(() => {
      const lbs = document.querySelectorAll('.lightbox');
      for (const lb of lbs) {
        if (lb.classList.contains('flipClose')) continue;
        const btns = lb.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent?.trim() === 'Cancel') { btn.click(); return; }
        }
      }
    });
    await delay(1500, 2500);
    return false;
  }
}

async function main() {
  console.log('\n═══ NAUKRI PROJECT ADDER v3 ═══\n');

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false, slowMo: 40,
    viewport: { width: 1920, height: 1080 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });

  const page = context.pages()[0] || await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  try {
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(4000, 6000);

    if (page.url().includes('/nlogin')) {
      await page.fill('input[placeholder="Enter Email ID / Username"]', process.env.NAUKRI_EMAIL);
      await delay(500, 1000);
      await page.fill('input[placeholder="Enter Password"]', process.env.NAUKRI_PASSWORD);
      await delay(500, 1000);
      await page.click('button[type="submit"]');
      await delay(5000, 8000);
      await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(4000, 6000);
    }

    console.log('Profile loaded.');

    // First, let's inspect the dropdown structure on the first project form
    console.log('\n── DOM Inspection: understanding dropdown structure ──');

    // Open the project form
    await page.evaluate(() => {
      const links = document.querySelectorAll('a, span');
      for (const el of links) {
        if (el.textContent?.trim() === 'Add' && el.closest('li')?.textContent?.includes('Project')) { el.click(); return; }
      }
      const sectionLinks = document.querySelectorAll('a, button, span');
      for (const el of sectionLinks) {
        if (el.textContent?.trim().toLowerCase() === 'add project') { el.click(); return; }
      }
    });
    await delay(3000, 4000);

    // Inspect the year dropdown element
    const dropdownInspect = await page.evaluate(() => {
      const lbs = document.querySelectorAll('.lightbox');
      for (const lb of lbs) {
        if (lb.classList.contains('flipClose')) continue;

        const yearEl = lb.querySelector('#projStartYearFor');
        if (!yearEl) continue;

        // Get the dropdown's full structure
        const yearParent = yearEl.parentElement;
        const yearGrandparent = yearParent?.parentElement;

        return {
          yearId: yearEl.id,
          yearTag: yearEl.tagName,
          yearClass: yearEl.className?.substring(0, 100),
          yearType: yearEl.type,
          yearRole: yearEl.getAttribute('role'),
          yearParentTag: yearParent?.tagName,
          yearParentClass: yearParent?.className?.substring(0, 100),
          yearGPTag: yearGrandparent?.tagName,
          yearGPClass: yearGrandparent?.className?.substring(0, 100),
          // Check siblings and nearby elements
          yearHTML: yearParent?.innerHTML?.substring(0, 500),
          // Also check month
          monthId: lb.querySelector('#projStartMonthFor')?.id,
          monthTag: lb.querySelector('#projStartMonthFor')?.tagName,
          monthClass: lb.querySelector('#projStartMonthFor')?.className?.substring(0, 100),
          // Look for ALL select-like elements
          allSelects: [...lb.querySelectorAll('select')].map(s => ({ id: s.id, name: s.name })),
          allCustomSelects: [...lb.querySelectorAll('[class*="select" i], [class*="dropdown" i], [class*="droop" i]')].map(s => ({
            tag: s.tagName, id: s.id, class: s.className?.substring(0, 60),
          })),
        };
      }
      return null;
    });

    console.log('Year dropdown structure:');
    console.log(JSON.stringify(dropdownInspect, null, 2));

    // Try clicking the year dropdown and see what happens
    if (dropdownInspect) {
      // Click the year element
      await page.click(`#projStartYearFor`).catch(() => {});
      await sleep(1500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'year-after-click.png') });

      // Check what appeared
      const afterClick = await page.evaluate(() => {
        // Look for ANY newly visible dropdown/list
        const lists = document.querySelectorAll('ul, ol, [role="listbox"], [class*="dropdown"], [class*="optionList"]');
        const visible = [];
        lists.forEach(l => {
          const rect = l.getBoundingClientRect();
          if (rect.height > 0 && rect.width > 0) {
            const items = [...l.querySelectorAll('li, [role="option"]')].slice(0, 5);
            visible.push({
              tag: l.tagName, class: l.className?.substring(0, 60),
              items: items.map(i => i.textContent?.trim()),
              rect: { top: Math.round(rect.top), left: Math.round(rect.left), h: Math.round(rect.height) },
            });
          }
        });
        return visible;
      });

      console.log('\nVisible lists after clicking year:');
      console.log(JSON.stringify(afterClick, null, 2));

      // Close the form
      await page.evaluate(() => {
        const lbs = document.querySelectorAll('.lightbox');
        for (const lb of lbs) {
          if (lb.classList.contains('flipClose')) continue;
          const btns = lb.querySelectorAll('button');
          for (const btn of btns) {
            if (btn.textContent?.trim() === 'Cancel') { btn.click(); return; }
          }
        }
      });
      await delay(1500, 2500);
    }

    // Now add projects with the knowledge we have
    let added = 0;
    for (let i = 0; i < PROJECTS.length; i++) {
      // Refresh page before each project
      await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(3000, 5000);

      const success = await addOneProject(page, PROJECTS[i], i);
      if (success) added++;

      await delay(2000, 3000);
    }

    // Final verification
    console.log('\n── Final ──');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(4000, 6000);
    const ph2 = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < ph2; y += 400) {
      await page.evaluate(yy => window.scrollTo(0, yy), y);
      await sleep(200);
    }
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'final-profile.png') });

    console.log(`\n✅ Added ${added}/${PROJECTS.length} projects`);
    console.log('\n═══ DONE ═══\n');

  } catch (err) {
    console.error('\n❌ Fatal:', err.message);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error.png') }).catch(() => {});
  } finally {
    await sleep(3000);
    await context.close();
  }
}

main().catch(console.error);
