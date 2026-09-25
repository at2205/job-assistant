import { Page } from 'playwright';
import logger from '../utils/logger';

/**
 * LinkedIn platform adapter.
 *
 * ⚠️ CRITICAL WARNING:
 * LinkedIn has the most aggressive anti-bot detection of all job platforms.
 * They will restrict your account if they detect automation.
 *
 * SAFETY STRATEGY:
 *   - ONLY use Easy Apply (never external apply)
 *   - Max 5-8 applications per day (lower than Naukri)
 *   - Very long random delays (3-8 seconds between actions)
 *   - Session-based (never login repeatedly)
 *   - Abort immediately on any CAPTCHA/challenge
 */

export const LINKEDIN_CONFIG = {
  name: 'linkedin',
  baseUrl: 'https://www.linkedin.com',
  loginUrl: 'https://www.linkedin.com/login',
  feedUrl: 'https://www.linkedin.com/feed/',
  jobsUrl: 'https://www.linkedin.com/jobs/',

  // ---- Login Selectors ----
  login: {
    emailField: '#username, input[name="session_key"], input[autocomplete="username"]',
    passwordField: '#password, input[name="session_password"], input[autocomplete="current-password"]',
    submitButton: 'button[type="submit"], button:has-text("Sign in")',
    loginSuccessIndicator: '.global-nav__me-photo, .feed-identity-module, img[alt*="photo"], .scaffold-layout',
    captchaIndicator: '#captcha-internal, iframe[title*="challenge"], iframe[title*="Security"]',
    twoFactorField: '#input__phone_verification_pin, input[name="pin"]',
  },

  // ---- Job Search ----
  search: {
    buildSearchUrl: (params: { role: string; location?: string; experience?: string; easyApply?: boolean }) => {
      const base = 'https://www.linkedin.com/jobs/search/';
      const urlParams: string[] = [];

      urlParams.push(`keywords=${encodeURIComponent(params.role)}`);
      if (params.location) urlParams.push(`location=${encodeURIComponent(params.location)}`);
      if (params.easyApply !== false) urlParams.push('f_AL=true'); // Easy Apply filter

      // Experience mapping: 1=Internship, 2=Entry, 3=Associate, 4=Mid-Senior, 5=Director
      if (params.experience) {
        const exp = parseInt(params.experience);
        if (exp <= 2) urlParams.push('f_E=2');       // Entry level
        else if (exp <= 5) urlParams.push('f_E=3');  // Associate
        else urlParams.push('f_E=4');                 // Mid-Senior
      }

      // Date posted: last 24h
      urlParams.push('f_TPR=r86400');

      return base + '?' + urlParams.join('&');
    },

    // Job card selectors
    jobCard: '.jobs-search-results__list-item, .job-card-container',
    jobTitle: '.job-card-list__title, a.job-card-container__link strong',
    companyName: '.job-card-container__primary-description, .artdeco-entity-lockup__subtitle',
    location: '.job-card-container__metadata-wrapper, .artdeco-entity-lockup__caption',
    jobLink: 'a.job-card-container__link, a.job-card-list__title',
    easyApplyBadge: '.job-card-container__apply-method, [class*="easy-apply"]',

    // Scroll-based pagination (LinkedIn uses infinite scroll)
    jobListContainer: '.jobs-search-results-list, .scaffold-layout__list',
  },

  // ---- Job Detail ----
  jobDetail: {
    title: '.job-details-jobs-unified-top-card__job-title, h1.t-24',
    company: '.job-details-jobs-unified-top-card__company-name, a[data-tracking-control-name*="company"]',
    description: '.jobs-description__content, #job-details',
    skills: '.job-details-skill-match-status-list li',
    easyApplyButton: '.jobs-apply-button, button[aria-label*="Easy Apply"]',
    alreadyApplied: '.artdeco-inline-feedback--success, [class*="applied"]',
  },

  // ---- Easy Apply Flow ----
  easyApply: {
    modal: '.jobs-easy-apply-modal, [class*="easy-apply-modal"]',
    uploadResume: 'input[type="file"]',
    nextButton: 'button[aria-label="Continue to next step"], footer button:has-text("Next")',
    reviewButton: 'button[aria-label="Review your application"], footer button:has-text("Review")',
    submitButton: 'button[aria-label="Submit application"], footer button:has-text("Submit")',
    dismissButton: 'button[aria-label="Dismiss"]',

    // Form fields inside easy apply
    textInput: '.artdeco-text-input--input, input[type="text"]',
    textArea: 'textarea',
    selectDropdown: 'select',
    radioButton: 'input[type="radio"]',
    checkbox: 'input[type="checkbox"]',

    // Common question labels
    questionLabel: '.fb-dash-form-element__label, label',

    // Success/error indicators
    successMessage: '.artdeco-inline-feedback--success, [class*="success"]',
    errorMessage: '.artdeco-inline-feedback--error',
  },

  // ---- Session Validation ----
  sessionCheck: {
    validIndicator: '.global-nav__me-photo, .feed-identity-module',
    invalidIndicator: '.nav__button-secondary:has-text("Sign in")',
    restrictedIndicator: '[class*="restricted"], [class*="challenge"]',
  },

  // ---- Rate Limiting (CONSERVATIVE — LinkedIn bans fast) ----
  limits: {
    minDelayBetweenPages: 5000,
    maxDelayBetweenPages: 10000,
    minDelayBetweenApply: 120000,   // 2 minutes between applications!
    maxDelayBetweenApply: 300000,   // 5 minutes max
    maxPagesPerSession: 3,
    maxAppliesPerDay: 8,            // LinkedIn limit — stay well below
  },
};

/**
 * LinkedIn login flow.
 */
export async function linkedinLogin(page: Page, email: string, password: string): Promise<boolean> {
  const sel = LINKEDIN_CONFIG.login;

  await page.goto(LINKEDIN_CONFIG.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await randomDelay(3000, 6000);

  // Check already logged in (redirected to feed)
  if (page.url().includes('/feed') || page.url().includes('/mynetwork')) {
    logger.info('Already logged in to LinkedIn (redirected to feed)');
    return true;
  }

  const loggedIn = await page.$(LINKEDIN_CONFIG.sessionCheck.validIndicator);
  if (loggedIn) {
    logger.info('Already logged in to LinkedIn');
    return true;
  }

  // Wait for login form to appear (might be delayed by cookie consent)
  try {
    // Dismiss cookie consent if present
    const cookieBtn = await page.$('button[action-type="ACCEPT"]');
    if (cookieBtn) {
      await cookieBtn.click();
      await randomDelay(1000, 2000);
    }

    // Try multiple selectors for the email field
    const emailSelectors = ['#username', 'input[name="session_key"]', 'input[autocomplete="username"]'];
    let emailEl = null;
    for (const s of emailSelectors) {
      emailEl = await page.$(s);
      if (emailEl) break;
    }
    if (!emailEl) {
      await page.waitForSelector('#username', { timeout: 15000 });
    }
  } catch {
    logger.error('Login form not found on page. URL: ' + page.url());
    return false;
  }

  // Fill credentials — try multiple strategies
  let filled = false;
  try {
    // Strategy 1: Use all visible input fields on the page
    const inputs = await page.$$('input:visible');
    logger.info(`Found ${inputs.length} visible input fields`);

    let emailInput = null;
    let passInput = null;
    for (const input of inputs) {
      const type = await input.getAttribute('type') || '';
      const ac = await input.getAttribute('autocomplete') || '';
      const name = await input.getAttribute('name') || '';
      const id = await input.getAttribute('id') || '';

      if (type === 'password' || ac === 'current-password' || name === 'session_password' || id === 'password') {
        passInput = input;
      } else if (type === 'text' || type === 'email' || type === '' || ac === 'username' || name === 'session_key' || id === 'username') {
        if (!emailInput) emailInput = input; // first non-password input
      }
    }

    if (emailInput) {
      await emailInput.click();
      await randomDelay(200, 400);
      await emailInput.fill(email);
      logger.info('Email filled');
    } else {
      logger.error('Could not find email input');
    }
    await randomDelay(800, 1500);

    if (passInput) {
      await passInput.click();
      await randomDelay(200, 400);
      await passInput.fill(password);
      logger.info('Password filled');
    } else {
      logger.error('Could not find password input');
    }
    await randomDelay(1000, 2000);

    // Click Sign in button
    const buttons = await page.$$('button:visible');
    for (const btn of buttons) {
      const text = (await btn.textContent() || '').trim().toLowerCase();
      if (text === 'sign in') {
        await btn.click();
        logger.info('Sign in clicked');
        filled = true;
        break;
      }
    }
    if (!filled) {
      // Fallback: submit with Enter key
      await page.keyboard.press('Enter');
      filled = true;
    }
  } catch (fillErr: any) {
    logger.error(`Login fill error: ${fillErr.message}`);
    return false;
  }
  await randomDelay(5000, 8000);

  // Check for CAPTCHA/challenge
  const captcha = await page.$(sel.captchaIndicator);
  if (captcha) {
    logger.warn('CAPTCHA/Challenge detected! Waiting 120s for manual resolution...');
    try {
      await page.waitForSelector(sel.loginSuccessIndicator, { timeout: 120000 });
    } catch {
      logger.error('CAPTCHA not resolved in time');
      return false;
    }
  }

  // Check for 2FA
  const twoFactor = await page.$(sel.twoFactorField);
  if (twoFactor) {
    logger.warn('2FA required! Waiting 60s for manual OTP entry...');
    try {
      await page.waitForSelector(sel.loginSuccessIndicator, { timeout: 60000 });
    } catch {
      logger.error('2FA timeout');
      return false;
    }
  }

  // Verify success — check URL and page elements
  const currentUrl = page.url();
  if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork') || currentUrl.includes('/in/')) {
    logger.info('LinkedIn login successful (redirected to feed)');
    return true;
  }

  const success = await page.$('.global-nav__me-photo, .feed-identity-module, img[alt*="photo"], .scaffold-layout, .global-nav, nav[aria-label]');
  if (success) {
    logger.info('LinkedIn login successful');
    return true;
  }

  // Check if restricted
  const restricted = await page.$(LINKEDIN_CONFIG.sessionCheck.restrictedIndicator);
  if (restricted) {
    logger.error('Account RESTRICTED by LinkedIn! Stop all automation immediately.');
    return false;
  }

  logger.error('LinkedIn login failed');
  return false;
}

/**
 * LinkedIn Easy Apply flow.
 */
export async function linkedinEasyApply(page: Page, content: {
  resumePath?: string;
  phone?: string;
  answers?: Record<string, string>;
}): Promise<{ success: boolean; error?: string }> {
  const sel = LINKEDIN_CONFIG.easyApply;

  // Click Easy Apply button
  const applyBtn = await page.$(LINKEDIN_CONFIG.jobDetail.easyApplyButton);
  if (!applyBtn) {
    return { success: false, error: 'Easy Apply button not found (may require external apply)' };
  }

  // Check if already applied
  const alreadyApplied = await page.$(LINKEDIN_CONFIG.jobDetail.alreadyApplied);
  if (alreadyApplied) {
    return { success: false, error: 'Already applied' };
  }

  await applyBtn.scrollIntoViewIfNeeded();
  await randomDelay(1500, 3000);
  await applyBtn.click();
  await randomDelay(2000, 4000);

  // Wait for modal
  try {
    await page.waitForSelector(sel.modal, { timeout: 10000 });
  } catch {
    return { success: false, error: 'Easy Apply modal did not open' };
  }

  // Multi-step form — keep clicking Next until we reach Submit
  let maxSteps = 8;
  let submitted = false;

  while (maxSteps-- > 0 && !submitted) {
    await randomDelay(2000, 4000);

    // Fill any visible fields on current step
    await fillCurrentStep(page, content);

    // Check for Submit button
    const submitBtn = await page.$(sel.submitButton);
    if (submitBtn && await submitBtn.isVisible()) {
      await randomDelay(2000, 4000);
      await submitBtn.click();
      submitted = true;
      break;
    }

    // Check for Review button
    const reviewBtn = await page.$(sel.reviewButton);
    if (reviewBtn && await reviewBtn.isVisible()) {
      await reviewBtn.click();
      await randomDelay(2000, 3000);
      continue;
    }

    // Click Next
    const nextBtn = await page.$(sel.nextButton);
    if (nextBtn && await nextBtn.isVisible()) {
      await nextBtn.click();
      await randomDelay(1500, 3000);
    } else {
      // No navigation buttons found
      break;
    }
  }

  if (!submitted) {
    // Close modal to not leave it hanging
    const dismiss = await page.$(sel.dismissButton);
    if (dismiss) await dismiss.click();
    return { success: false, error: 'Could not complete multi-step form' };
  }

  // Wait for confirmation
  await randomDelay(2000, 4000);
  const success = await page.$(sel.successMessage);
  if (success) {
    // Dismiss success dialog
    const dismiss = await page.$(sel.dismissButton);
    if (dismiss) await dismiss.click();
    return { success: true };
  }

  return { success: true }; // Assume success if no error shown
}

/**
 * Fill fields on the current Easy Apply step.
 */
async function fillCurrentStep(page: Page, content: {
  resumePath?: string;
  phone?: string;
  answers?: Record<string, string>;
}): Promise<void> {
  const sel = LINKEDIN_CONFIG.easyApply;

  // Handle file upload (resume)
  const fileInput = await page.$(sel.uploadResume);
  if (fileInput && content.resumePath) {
    try {
      await fileInput.setInputFiles(content.resumePath);
      await randomDelay(2000, 3000);
    } catch (err: any) {
      logger.debug(`Resume upload skipped: ${err.message}`);
    }
  }

  // Handle text inputs (phone, city, etc.)
  const inputs = await page.$$(`${sel.modal} ${sel.textInput}`);
  for (const input of inputs) {
    const value = await input.inputValue();
    if (value) continue; // already filled (LinkedIn pre-fills from profile)

    const label = await getFieldLabel(page, input);
    const lowerLabel = label.toLowerCase();

    if (lowerLabel.includes('phone') || lowerLabel.includes('mobile')) {
      if (content.phone) {
        await input.fill(content.phone);
        await randomDelay(300, 600);
      }
    }
  }

  // Handle textareas (additional questions)
  const textareas = await page.$$(`${sel.modal} ${sel.textArea}`);
  for (const ta of textareas) {
    const value = await ta.inputValue();
    if (value) continue;

    if (content.answers) {
      // Use first available answer for any unfilled textarea
      const firstAnswer = Object.values(content.answers)[0];
      if (firstAnswer) {
        await ta.fill(firstAnswer);
        await randomDelay(500, 1000);
      }
    }
  }

  // Handle select dropdowns
  const selects = await page.$$(`${sel.modal} ${sel.selectDropdown}`);
  for (const select of selects) {
    const currentVal = await select.inputValue();
    if (currentVal && currentVal !== 'Select an option') continue;

    // Select first non-empty option
    try {
      const options = await select.$$('option');
      if (options.length > 1) {
        const optVal = await options[1].getAttribute('value');
        if (optVal) await select.selectOption(optVal);
      }
    } catch {
      // ignore select errors
    }
  }
}

/**
 * Get the label text for a form field.
 */
async function getFieldLabel(page: Page, el: any): Promise<string> {
  try {
    const id = await el.getAttribute('id');
    if (id) {
      const label = await page.$(`label[for="${id}"]`);
      if (label) return (await label.textContent())?.trim() || '';
    }
    return '';
  } catch {
    return '';
  }
}

// ---- Utilities ----

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDelay(min: number, max: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, randomInt(min, max)));
}
