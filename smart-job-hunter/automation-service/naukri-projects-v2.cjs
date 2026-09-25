/**
 * Naukri Project Adder v2 — fills ALL required fields
 * Required fields: Project title*, Client*, Worked from* (year+month), Details*, Status
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const SESSION_DIR = path.resolve(__dirname, 'sessions', 'naukri-session');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots', 'naukri-projects-v2');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const delay = (min, max) => sleep(min + Math.random() * (max - min));

const PROJECTS = [
  {
    title: 'CAPS — Channel Administration & Payment System',
    client: 'BankIT (FindiBankit)',
    status: 'In progress',
    year: '2024', month: 'Oct',
    description: 'Enterprise fintech admin portal managing multi-tier distribution network (Super Admin → Distributor → Agent) for AEPS, DMT, Micro ATM, bill payments, and IRCTC bookings. Migrated legacy Struts 2 to Spring Boot + Next.js. Built 200+ REST APIs with JWT RBAC, KYC management with AWS S3, trade balance & fund management, HubSpot CRM integration, RazorPay payment gateway, and Apache POI reporting. Tech: Java, Spring Boot, Next.js, MS SQL Server, AWS S3, JWT, HubSpot, RazorPay.',
  },
  {
    title: 'JobFlow AI — Career Intelligence Platform',
    client: 'Personal Project',
    status: 'In progress',
    year: '2025', month: 'Mar',
    description: 'AI-powered career automation platform with Playwright browser orchestration, ATS scoring engine (150+ jobs analyzed), recruiter probability scoring, PostgreSQL persistence layer, Spring Boot API backend (51 endpoints), and Next.js analytics dashboard. Deterministic retry-safe workflows with full observability. Tech: Java, Spring Boot, PostgreSQL, Playwright, Next.js, TypeScript, Groq AI.',
  },
  {
    title: 'ConnectVerse — Real-Time Social Platform',
    client: 'Personal Project',
    status: 'Finished',
    year: '2024', month: 'Jul',
    description: 'Full-stack social platform with WebRTC peer-to-peer video calling, GitHub OAuth integration, threaded discussions, community systems, and Dockerized deployment. Real-time communication architecture with persistent messaging and notification system. Tech: Next.js, Spring Boot, PostgreSQL, WebRTC, Docker, OAuth.',
  },
  {
    title: 'AEPS Agent Onboarding System',
    client: 'BankIT (FindiBankit)',
    status: 'Finished',
    year: '2024', month: 'Aug',
    description: 'Fintech biometric onboarding pipeline with Aadhaar verification, AES-256 encryption for sensitive data, multi-channel KYC (Mobile + DS Agent), document storage on AWS S3, and agent activation workflows with audit trails. Processes 1000+ agent registrations with secure encrypted data handling. Tech: Java, Spring MVC, SQL Server, AJAX, AES-256 Encryption, REST APIs.',
  },
  {
    title: 'mSwasth — Multilingual Healthcare Portal',
    client: 'FindiBankit',
    status: 'Finished',
    year: '2024', month: 'May',
    description: 'Healthcare marketplace with multilingual support (Hindi/English), payment gateway integration, dynamic PDF generation (iTextPDF), lead funnel persistence, and security hardening. Managed 500+ healthcare provider records with responsive mobile-first design. Tech: Next.js, React, TypeScript, Tailwind CSS, REST APIs.',
  },
  {
    title: 'FindiInsure — Insurance Marketplace',
    client: 'FindiBankit',
    status: 'Finished',
    year: '2024', month: 'Jun',
    description: 'Insurance comparison and purchase platform with OTP verification, checkout architecture, payment gateway workflows, responsive UI with mobile-first design, and secure transaction handling. Multi-insurer product comparison with real-time quoting. Tech: Next.js, React, TypeScript, REST APIs.',
  },
];

async function main() {
  console.log('\n═══ NAUKRI PROJECT ADDER v2 ═══\n');

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
      console.log('Logging in...');
      await page.fill('input[placeholder="Enter Email ID / Username"]', process.env.NAUKRI_EMAIL);
      await delay(500, 1000);
      await page.fill('input[placeholder="Enter Password"]', process.env.NAUKRI_PASSWORD);
      await delay(500, 1000);
      await page.click('button[type="submit"]');
      await delay(5000, 8000);
      await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await delay(4000, 6000);
    }

    console.log('Profile loaded.\n');
    let addedCount = 0;

    for (let i = 0; i < PROJECTS.length; i++) {
      const proj = PROJECTS[i];
      console.log(`\n── Project ${i + 1}/${PROJECTS.length}: ${proj.title} ──`);

      // Scroll full page to ensure all sections are loaded
      const ph = await page.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y < ph; y += 400) {
        await page.evaluate(yy => window.scrollTo(0, yy), y);
        await sleep(200);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await delay(1000, 1500);

      // Click "Add project" in sidebar or projects section
      const clickResult = await page.evaluate(() => {
        // Look for sidebar "Projects" with "Add" link
        const links = document.querySelectorAll('a, span, li');
        for (const el of links) {
          const text = el.textContent?.trim();
          if (text === 'Add' || text === 'Add project') {
            const parent = el.closest('li, div');
            if (parent?.textContent?.includes('Project')) {
              el.click();
              return 'sidebar-add';
            }
          }
        }
        // Look for "Add project" button in the Projects section
        const sections = document.querySelectorAll('.widgetHead, [class*="sectionHead"], [class*="project"]');
        for (const s of sections) {
          if (s.textContent?.includes('Project')) {
            const addBtn = s.querySelector('a, button, .addMore');
            if (addBtn) { addBtn.click(); return 'section-add'; }
          }
        }
        return null;
      });

      if (!clickResult) {
        console.log('  ⚠️ Could not find Add Project button — trying direct link');
        // Look for the "Add project" link with specific class
        const directClick = await page.evaluate(() => {
          const els = document.querySelectorAll('.addMore, [class*="addMore"], a[href*="project"]');
          for (const el of els) {
            if (el.textContent?.includes('Add') || el.closest('[class*="project"]')) {
              el.click();
              return true;
            }
          }
          return false;
        });
        if (!directClick) {
          console.log('  ❌ Cannot find Add Project — skipping');
          continue;
        }
      }

      await delay(2500, 4000);

      // Wait for the project lightbox to open
      const formCheck = await page.evaluate(() => {
        const lightboxes = document.querySelectorAll('.lightbox');
        for (const lb of lightboxes) {
          if (lb.classList.contains('flipClose')) continue;
          const titleInput = lb.querySelector('#projectTitle, input[name="projectTitle"]');
          if (titleInput) return { open: true, lbClass: lb.className?.substring(0, 80) };
        }
        return { open: false };
      });

      if (!formCheck.open) {
        console.log('  ❌ Project form did not open');
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `project-${i + 1}-no-form.png`) });
        continue;
      }

      console.log('  ✅ Project form opened');

      // Fill Project Title
      await page.evaluate((title) => {
        const lightboxes = document.querySelectorAll('.lightbox');
        for (const lb of lightboxes) {
          if (lb.classList.contains('flipClose')) continue;
          const input = lb.querySelector('#projectTitle, input[name="projectTitle"]');
          if (input) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, title);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            break;
          }
        }
      }, proj.title);
      await delay(300, 600);
      console.log('  ✅ Title filled');

      // Tag with employment/education (select dropdown)
      await page.evaluate(() => {
        const lightboxes = document.querySelectorAll('.lightbox');
        for (const lb of lightboxes) {
          if (lb.classList.contains('flipClose')) continue;
          // Click the "Select employment/education" dropdown
          const dropdown = lb.querySelector('#eduExpIdFor, [id*="eduExpId"], .customSelect, select[name*="eduExp"]');
          if (dropdown) {
            dropdown.click();
            // Try selecting the first option that mentions FindiBankit or employment
            setTimeout(() => {
              const options = lb.querySelectorAll('li, option, [class*="option"]');
              for (const opt of options) {
                const t = opt.textContent?.trim();
                if (t && !t.includes('Select') && t.length > 0) {
                  opt.click();
                  break;
                }
              }
            }, 500);
          }
        }
      });
      await delay(1000, 1500);

      // Fill Client name
      const clientInput = await page.$('.lightbox:not(.flipClose) input[placeholder*="client" i], .lightbox:not(.flipClose) input[name*="client" i]');
      if (clientInput) {
        await clientInput.click();
        await clientInput.fill(proj.client);
        await delay(300, 600);
        console.log('  ✅ Client filled');
      } else {
        // Try alternative selector
        await page.evaluate((client) => {
          const lightboxes = document.querySelectorAll('.lightbox');
          for (const lb of lightboxes) {
            if (lb.classList.contains('flipClose')) continue;
            const inputs = lb.querySelectorAll('input');
            for (const inp of inputs) {
              if (inp.placeholder?.toLowerCase().includes('client') || inp.name?.toLowerCase().includes('client')) {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(inp, client);
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                break;
              }
            }
          }
        }, proj.client);
        await delay(300, 600);
        console.log('  ✅ Client filled (alt)');
      }

      // Set project status (In progress / Finished)
      if (proj.status === 'Finished') {
        await page.evaluate(() => {
          const lightboxes = document.querySelectorAll('.lightbox');
          for (const lb of lightboxes) {
            if (lb.classList.contains('flipClose')) continue;
            const radios = lb.querySelectorAll('input[type="radio"], label');
            for (const r of radios) {
              if (r.textContent?.includes('Finished') || r.value === 'Finished' || r.textContent?.includes('finished')) {
                r.click();
                break;
              }
            }
          }
        });
        await delay(300, 500);
      }

      // Select Worked From year
      await page.evaluate((year) => {
        const lightboxes = document.querySelectorAll('.lightbox');
        for (const lb of lightboxes) {
          if (lb.classList.contains('flipClose')) continue;
          const yearDrop = lb.querySelector('#projStartYearFor, select[name*="StartYear"], [id*="StartYear"]');
          if (yearDrop) {
            yearDrop.click();
            setTimeout(() => {
              const options = document.querySelectorAll('li, option');
              for (const opt of options) {
                if (opt.textContent?.trim() === year) { opt.click(); break; }
              }
            }, 500);
          }
        }
      }, proj.year);
      await delay(1000, 1500);

      // Select Worked From month
      await page.evaluate((month) => {
        const lightboxes = document.querySelectorAll('.lightbox');
        for (const lb of lightboxes) {
          if (lb.classList.contains('flipClose')) continue;
          const monthDrop = lb.querySelector('#projStartMonthFor, select[name*="StartMonth"], [id*="StartMonth"]');
          if (monthDrop) {
            monthDrop.click();
            setTimeout(() => {
              const options = document.querySelectorAll('li, option');
              for (const opt of options) {
                if (opt.textContent?.trim() === month) { opt.click(); break; }
              }
            }, 500);
          }
        }
      }, proj.month);
      await delay(1000, 1500);
      console.log(`  ✅ Date set: ${proj.month} ${proj.year}`);

      // Fill Project Details (description textarea)
      await page.evaluate((desc) => {
        const lightboxes = document.querySelectorAll('.lightbox');
        for (const lb of lightboxes) {
          if (lb.classList.contains('flipClose')) continue;
          const ta = lb.querySelector('#projectDetails, textarea[name*="projectDetails"], textarea');
          if (ta) {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
            setter.call(ta, desc);
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.dispatchEvent(new Event('change', { bubbles: true }));
            break;
          }
        }
      }, proj.description);
      await delay(300, 600);
      console.log('  ✅ Description filled');

      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `project-${i + 1}-filled.png`) });

      // Click Save
      const saveResult = await page.evaluate(() => {
        const lightboxes = document.querySelectorAll('.lightbox');
        for (const lb of lightboxes) {
          if (lb.classList.contains('flipClose')) continue;
          const btns = lb.querySelectorAll('button');
          for (const btn of btns) {
            const t = btn.textContent?.trim().toLowerCase();
            if (t === 'save' && !btn.disabled) {
              btn.click();
              return { clicked: true };
            }
          }
        }
        return { clicked: false };
      });

      console.log(`  Save clicked: ${saveResult.clicked}`);
      await delay(3000, 5000);

      // Check for validation errors
      const validationErrors = await page.evaluate(() => {
        const lightboxes = document.querySelectorAll('.lightbox');
        for (const lb of lightboxes) {
          if (lb.classList.contains('flipClose')) continue;
          const errors = lb.querySelectorAll('.error, .errorMsg, [class*="error"], [class*="Error"], .validationError');
          const msgs = [];
          errors.forEach(e => {
            const t = e.textContent?.trim();
            if (t && t.length > 0 && t.length < 200) msgs.push(t);
          });
          if (msgs.length > 0) return msgs;
          // If lightbox is still open, it means save failed
          if (lb.querySelector('#projectTitle')) return ['form_still_open'];
        }
        return [];
      });

      if (validationErrors.length > 0 && validationErrors[0] !== 'form_still_open') {
        console.log(`  ⚠️ Validation errors: ${validationErrors.join(', ')}`);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `project-${i + 1}-errors.png`) });
      } else if (validationErrors[0] === 'form_still_open') {
        console.log('  ⚠️ Form still open — save may not have completed. Checking required fields...');
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `project-${i + 1}-still-open.png`) });

        // Close the form and try again if needed
        await page.evaluate(() => {
          const lightboxes = document.querySelectorAll('.lightbox');
          for (const lb of lightboxes) {
            if (lb.classList.contains('flipClose')) continue;
            const cancel = lb.querySelector('button');
            for (const btn of lb.querySelectorAll('button')) {
              if (btn.textContent?.trim().toLowerCase() === 'cancel') { btn.click(); break; }
            }
          }
        });
        await delay(1500, 2500);
      } else {
        addedCount++;
        console.log(`  ✅ Project ${i + 1} SAVED SUCCESSFULLY`);
      }

      // Handle any confirmation/success dialogs
      await page.evaluate(() => {
        const btns = document.querySelectorAll('button');
        for (const b of btns) {
          const t = b.textContent?.trim().toLowerCase();
          if ((t === 'ok' || t === 'done' || t === 'got it') && b.offsetParent !== null) { b.click(); break; }
        }
      });
      await delay(1500, 2500);

      // Refresh profile for next project
      if (i < PROJECTS.length - 1) {
        await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(4000, 6000);
      }
    }

    // Final verification
    console.log('\n── Final Verification ──');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(4000, 6000);

    // Scroll to projects section
    const ph2 = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < ph2; y += 400) {
      await page.evaluate(yy => window.scrollTo(0, yy), y);
      await sleep(200);
    }

    await page.evaluate(() => {
      const els = document.querySelectorAll('.widgetHead, [class*="sectionHead"]');
      for (const el of els) {
        if (el.textContent?.includes('Project')) { el.scrollIntoView({ block: 'start' }); break; }
      }
    });
    await delay(1000, 2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'final-projects-section.png') });

    const projectsOnProfile = await page.evaluate(() => {
      const projects = [];
      const projElements = document.querySelectorAll('.projects .project, [class*="projectItem"], [class*="projectCard"]');
      projElements.forEach(p => {
        projects.push(p.textContent?.trim().substring(0, 100));
      });
      // Also check the projects section for any content
      const section = document.querySelector('.projects, [class*="project"]');
      const sectionText = section?.textContent?.trim().substring(0, 500) || '';
      return { count: projects.length, projects, sectionText };
    });

    console.log(`\nProjects on profile: ${projectsOnProfile.count}`);
    console.log(`Section text: ${projectsOnProfile.sectionText.substring(0, 200)}`);
    console.log(`\n✅ Added ${addedCount}/${PROJECTS.length} projects`);

    console.log('\n═══ DONE ═══\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error.png') }).catch(() => {});
  } finally {
    await sleep(3000);
    await context.close();
  }
}

main().catch(console.error);
