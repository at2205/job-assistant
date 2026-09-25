import { Page } from 'playwright';
import logger from '../utils/logger';

/**
 * Naukri.com platform adapter — REAL selectors and flows.
 *
 * IMPORTANT: These selectors are based on Naukri's structure as of early 2025.
 * Naukri changes their DOM periodically — if something breaks, update selectors here.
 *
 * Strategy:
 *   - Use saved session cookies (avoid repeated login)
 *   - Search via URL params (no need to type in search box)
 *   - Scrape job cards from search results
 *   - Apply using "Apply" or "Apply on Company Site" buttons
 */

export const NAUKRI_CONFIG = {
  name: 'naukri',
  baseUrl: 'https://www.naukri.com',
  loginUrl: 'https://www.naukri.com/nlogin/login',
  searchUrl: 'https://www.naukri.com/joblist',
  profileUrl: 'https://www.naukri.com/mnjuser/profile',

  // ---- Login Selectors ----
  login: {
    emailField: 'input[placeholder="Enter your active Email ID / Username"]',
    passwordField: 'input[placeholder="Enter your password"]',
    submitButton: 'button[type="submit"]',
    loginSuccessIndicator: '.nI-gNb-header__userImg, .user-img, [class*="user-name"]',
    otpField: 'input[placeholder="Enter OTP"]',
  },

  // ---- Search & Job List Selectors ----
  search: {
    // URL params approach (stealthier than typing)
    buildSearchUrl: (params: { role: string; location?: string; experience?: string }) => {
      const query = encodeURIComponent(params.role);
      let url = `https://www.naukri.com/${query.replace(/%20/g, '-')}-jobs`;

      const urlParams: string[] = [];
      if (params.location) urlParams.push(`l=${encodeURIComponent(params.location)}`);
      if (params.experience) urlParams.push(`experience=${params.experience}`);
      urlParams.push('wfhType=0'); // in-office + hybrid

      return url + (urlParams.length ? '?' + urlParams.join('&') : '');
    },

    // Job card selectors
    jobCard: '.srp-jobtuple-wrapper, article.jobTuple',
    jobTitle: '.title, .row1 a.title',
    companyName: '.comp-name, .row2 .subTitle, a.comp-name',
    experience: '.expwdth, .row3 .experience span',
    salary: '.sal, .row3 .salary span',
    location: '.loc, .row3 .location span',
    jobLink: '.title a, .row1 a',
    postedDate: '.job-post-day, .row6 span.date',
    skills: '.tags-gt a, .row6 .tag-li a',

    // Pagination
    nextPage: 'a.fright, a[class*="next"]',
    pageNumbers: '.pagination a',
  },

  // ---- Job Detail Page Selectors ----
  jobDetail: {
    applyButton: '#apply-button, .apply-button-container button, button[id*="apply"]',
    alreadyApplied: '.already-applied, [class*="already-applied"]',
    description: '.job-desc, .dang-inner-html, [class*="job-description"]',
    companyInfo: '.jd-header-comp-name, [class*="company-name"]',
    jobId: 'meta[name="job_id"], [data-job-id]',
  },

  // ---- Apply Flow Selectors ----
  apply: {
    // Naukri's apply modal/form
    applyModal: '.apply-modal, [class*="apply-dialog"], [class*="chatbot"]',
    uploadResume: 'input[type="file"][accept*="pdf"], input[type="file"]',
    coverLetterField: 'textarea[placeholder*="cover"], textarea[name*="coverLetter"]',
    questionsContainer: '.application-questions, [class*="ques"]',
    questionField: 'textarea, input[type="text"]',
    submitApplication: 'button[type="submit"], button:has-text("Submit"), button:has-text("Apply")',
    successMessage: '.apply-success, [class*="success"], [class*="applied"]',

    // Chatbot-style apply flow (Naukri uses this for some jobs)
    chatbotNext: 'button:has-text("Next"), button:has-text("Continue")',
    chatbotSubmit: 'button:has-text("Submit"), button:has-text("Apply")',
  },

  // ---- Session Validation ----
  sessionCheck: {
    // If we can see user avatar/name, session is valid
    validIndicator: '.nI-gNb-header__userImg, [class*="user-name"], .user-img',
    invalidIndicator: '.login-btn, a:has-text("Login")',
  },

  // ---- Rate Limiting ----
  limits: {
    minDelayBetweenPages: 3000,    // 3s between page navigations
    maxDelayBetweenPages: 7000,    // 7s max
    minDelayBetweenApply: 60000,   // 1min between applications
    maxDelayBetweenApply: 180000,  // 3min max
    maxPagesPerSession: 5,         // don't scrape more than 5 pages
    maxAppliesPerDay: 15,          // hard cap
  },
};

/**
 * Naukri login flow.
 */
export async function naukriLogin(page: Page, email: string, password: string): Promise<boolean> {
  const sel = NAUKRI_CONFIG.login;

  await page.goto(NAUKRI_CONFIG.loginUrl, { waitUntil: 'domcontentloaded' });
  await randomDelay(2000, 4000);

  // Check if already logged in
  const alreadyLoggedIn = await page.$(NAUKRI_CONFIG.sessionCheck.validIndicator);
  if (alreadyLoggedIn) {
    logger.info('Already logged in to Naukri');
    return true;
  }

  // Fill email
  await page.waitForSelector(sel.emailField, { timeout: 10000 });
  await page.click(sel.emailField);
  await randomDelay(300, 600);
  await page.type(sel.emailField, email, { delay: randomInt(40, 90) });
  await randomDelay(500, 1000);

  // Fill password
  await page.click(sel.passwordField);
  await randomDelay(200, 500);
  await page.type(sel.passwordField, password, { delay: randomInt(40, 90) });
  await randomDelay(800, 1500);

  // Submit
  await page.click(sel.submitButton);

  // Wait for login result
  try {
    await page.waitForSelector(sel.loginSuccessIndicator, { timeout: 15000 });
    logger.info('Naukri login successful');
    return true;
  } catch {
    // Check for OTP
    const otpField = await page.$(sel.otpField);
    if (otpField) {
      logger.warn('OTP required! Waiting 60s for manual OTP entry...');
      try {
        await page.waitForSelector(sel.loginSuccessIndicator, { timeout: 60000 });
        logger.info('OTP verified, login successful');
        return true;
      } catch {
        logger.error('OTP timeout');
        return false;
      }
    }

    logger.error('Login failed — no success indicator found');
    return false;
  }
}

/**
 * Validate existing Naukri session.
 */
export async function naukriValidateSession(page: Page): Promise<boolean> {
  try {
    await page.goto(NAUKRI_CONFIG.profileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await randomDelay(2000, 3000);

    const valid = await page.$(NAUKRI_CONFIG.sessionCheck.validIndicator);
    return !!valid;
  } catch {
    return false;
  }
}

/**
 * Parse job cards from Naukri search results.
 */
export async function naukriParseJobCards(page: Page): Promise<Array<{
  title: string;
  company: string;
  experience: string;
  salary: string;
  location: string;
  url: string;
  skills: string[];
  postedDate: string;
}>> {
  const sel = NAUKRI_CONFIG.search;
  const jobs: any[] = [];

  const cards = await page.$$(sel.jobCard);
  logger.info(`Found ${cards.length} job cards on page`);

  for (const card of cards) {
    try {
      const title = await safeText(card, sel.jobTitle);
      const company = await safeText(card, sel.companyName);
      const experience = await safeText(card, sel.experience);
      const salary = await safeText(card, sel.salary);
      const location = await safeText(card, sel.location);
      const postedDate = await safeText(card, sel.postedDate);

      // Get job URL
      const linkEl = await card.$(sel.jobLink);
      const url = linkEl ? (await linkEl.getAttribute('href')) || '' : '';

      // Get skills
      const skillEls = await card.$$(sel.skills);
      const skills: string[] = [];
      for (const skillEl of skillEls) {
        const text = await skillEl.textContent();
        if (text?.trim()) skills.push(text.trim());
      }

      if (title) {
        jobs.push({ title, company, experience, salary, location, url, skills, postedDate });
      }
    } catch (err: any) {
      logger.debug(`Failed to parse a job card: ${err.message}`);
    }
  }

  return jobs;
}

/**
 * Apply to a job on Naukri.
 */
export async function naukriApplyToJob(page: Page, jobUrl: string, content: {
  resumePath?: string;
  coverLetter?: string;
  answers?: Record<string, string>;
}): Promise<{ success: boolean; error?: string }> {
  const sel = NAUKRI_CONFIG.apply;

  // Navigate to job page
  await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await randomDelay(3000, 5000);

  // Check if already applied
  const alreadyApplied = await page.$(NAUKRI_CONFIG.jobDetail.alreadyApplied);
  if (alreadyApplied) {
    return { success: false, error: 'Already applied to this job' };
  }

  // Click Apply button
  const applyBtn = await page.$(NAUKRI_CONFIG.jobDetail.applyButton);
  if (!applyBtn) {
    return { success: false, error: 'Apply button not found' };
  }

  await applyBtn.scrollIntoViewIfNeeded();
  await randomDelay(1000, 2000);
  await applyBtn.click();
  await randomDelay(2000, 4000);

  // Handle apply modal/chatbot if it appears
  const modal = await page.$(sel.applyModal);
  if (modal) {
    // Upload resume if requested
    if (content.resumePath) {
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(content.resumePath);
        await randomDelay(2000, 3000);
      }
    }

    // Fill cover letter if field exists
    if (content.coverLetter) {
      const coverField = await page.$(sel.coverLetterField);
      if (coverField) {
        await coverField.fill(content.coverLetter);
        await randomDelay(500, 1000);
      }
    }

    // Handle application questions
    const questions = await page.$$(sel.questionsContainer + ' ' + sel.questionField);
    if (questions.length > 0 && content.answers) {
      const answerValues = Object.values(content.answers);
      for (let i = 0; i < Math.min(questions.length, answerValues.length); i++) {
        await questions[i].fill(answerValues[i]);
        await randomDelay(300, 700);
      }
    }

    // Click through chatbot steps if needed
    let chatbotNext = await page.$(sel.chatbotNext);
    let steps = 0;
    while (chatbotNext && steps < 5) {
      await chatbotNext.click();
      await randomDelay(1500, 2500);
      chatbotNext = await page.$(sel.chatbotNext);
      steps++;
    }

    // Final submit
    const submitBtn = await page.$(sel.submitApplication);
    if (submitBtn) {
      await randomDelay(1500, 3000);
      await submitBtn.click();
      await randomDelay(3000, 5000);
    }
  }

  // Check for success
  await randomDelay(2000, 3000);
  const pageText = await page.textContent('body') || '';

  if (/already applied/i.test(pageText)) {
    return { success: false, error: 'Already applied' };
  }

  if (/applied|success|thank/i.test(pageText)) {
    return { success: true };
  }

  // If no apply modal appeared, clicking Apply might have directly applied
  // (Naukri does this for "Easy Apply" jobs)
  return { success: true };
}

// ---- Utilities ----

async function safeText(parent: any, selector: string): Promise<string> {
  try {
    const el = await parent.$(selector);
    if (!el) return '';
    return (await el.textContent())?.trim() || '';
  } catch {
    return '';
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDelay(min: number, max: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, randomInt(min, max)));
}
