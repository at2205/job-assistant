import { Page } from 'playwright';
import { DetectedField, FieldMapper } from './field-mapper';
import logger from '../utils/logger';

/**
 * Content prepared by Phase 4 generators, ready to fill into a form.
 */
export interface FormContent {
  resumePath?: string;           // path to PDF/DOCX to upload
  coverLetter?: string;
  answers?: Record<string, string>;  // question → answer
  name?: string;
  email?: string;
  phone?: string;
  experienceYears?: string;
  expectedSalary?: string;
}

export interface FormFillResult {
  fieldsFilled: number;
  fieldsSkipped: number;
  fieldsErrored: number;
  submitted: boolean;
  details: Array<{ field: string; status: 'filled' | 'skipped' | 'error'; reason?: string }>;
}

/**
 * Handles filling and submitting application forms.
 * All interactions use human-like delays and randomness.
 */
export class FormHandler {
  private fieldMapper: FieldMapper;

  constructor() {
    this.fieldMapper = new FieldMapper();
  }

  /**
   * Detect fields, fill form, optionally submit.
   */
  async fillAndSubmit(
    page: Page,
    content: FormContent,
    options: { dryRun?: boolean; screenshotDir?: string } = {}
  ): Promise<FormFillResult> {
    const result: FormFillResult = {
      fieldsFilled: 0,
      fieldsSkipped: 0,
      fieldsErrored: 0,
      submitted: false,
      details: [],
    };

    // 1. Detect form fields
    const fields = await this.fieldMapper.detectFields(page);
    if (fields.length === 0) {
      logger.warn('No form fields detected on this page.');
      return result;
    }

    // 2. Fill each field with human-like timing
    for (const field of fields) {
      if (field.purpose === 'submit') continue; // handle submit separately

      try {
        const filled = await this.fillField(page, field, content);
        if (filled) {
          result.fieldsFilled++;
          result.details.push({ field: field.label, status: 'filled' });
        } else {
          result.fieldsSkipped++;
          result.details.push({ field: field.label, status: 'skipped', reason: 'No matching content' });
        }
      } catch (err: any) {
        logger.error(`Error filling ${field.purpose} (${field.label}): ${err.message}`);
        result.fieldsErrored++;
        result.details.push({ field: field.label, status: 'error', reason: err.message });
      }

      // Human-like delay between fields
      await humanDelay(300, 800);
    }

    // 3. Take a pre-submit screenshot for audit
    if (options.screenshotDir) {
      try {
        const ts = Date.now();
        await page.screenshot({ path: `${options.screenshotDir}/pre-submit-${ts}.png`, fullPage: true });
        logger.info(`Pre-submit screenshot saved`);
      } catch (err: any) {
        logger.warn(`Screenshot failed: ${err.message}`);
      }
    }

    // 4. Submit
    if (options.dryRun) {
      logger.info('DRY RUN — form filled but NOT submitted');
      result.submitted = false;
    } else {
      const submitField = fields.find(f => f.purpose === 'submit');
      if (submitField) {
        result.submitted = await this.clickSubmit(page, submitField);
      } else {
        logger.warn('No submit button found. Form not submitted.');
        result.submitted = false;
      }
    }

    return result;
  }

  /**
   * Fill a single field based on its detected purpose.
   */
  private async fillField(page: Page, field: DetectedField, content: FormContent): Promise<boolean> {
    switch (field.purpose) {
      case 'resume':
        return this.handleFileUpload(page, field, content.resumePath);

      case 'cover_letter':
        return this.humanType(page, field.selector, content.coverLetter);

      case 'name':
        return this.humanType(page, field.selector, content.name);

      case 'email':
        return this.humanType(page, field.selector, content.email);

      case 'phone':
        return this.humanType(page, field.selector, content.phone);

      case 'experience':
        return this.humanType(page, field.selector, content.experienceYears);

      case 'salary':
        return this.humanType(page, field.selector, content.expectedSalary);

      case 'question':
        return this.handleQuestion(page, field, content.answers);

      case 'unknown':
        logger.debug(`Skipping unknown field: ${field.label}`);
        return false;

      default:
        return false;
    }
  }

  /**
   * Type text into a field with human-like character-by-character timing.
   */
  private async humanType(page: Page, selector: string, value?: string): Promise<boolean> {
    if (!value) return false;

    try {
      const el = await page.$(selector);
      if (!el) {
        logger.warn(`Element not found: ${selector}`);
        return false;
      }

      // Click first (human behavior)
      await el.click();
      await humanDelay(100, 300);

      // Clear existing content
      await el.fill('');
      await humanDelay(50, 150);

      // Type character by character for short values, paste for long text
      if (value.length <= 50) {
        await el.type(value, { delay: randomBetween(30, 80) });
      } else {
        // For long text (cover letters, answers), use fill (simulates paste)
        await el.fill(value);
      }

      // Tab out (triggers validation)
      await humanDelay(200, 500);
      await page.keyboard.press('Tab');

      return true;
    } catch (err: any) {
      logger.warn(`Failed to type into ${selector}: ${err.message}`);
      return false;
    }
  }

  /**
   * Handle file upload (resume).
   */
  private async handleFileUpload(page: Page, field: DetectedField, filePath?: string): Promise<boolean> {
    if (!filePath) {
      logger.info('No resume path provided, skipping file upload');
      return false;
    }

    try {
      // File inputs may be hidden behind a button
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(filePath);
        logger.info(`Resume uploaded: ${filePath}`);
        await humanDelay(1000, 2000); // wait for upload processing
        return true;
      }

      logger.warn('No file input found for resume upload');
      return false;
    } catch (err: any) {
      logger.error(`File upload failed: ${err.message}`);
      return false;
    }
  }

  /**
   * Handle application questions.
   * Matches question text to pre-generated answers.
   */
  private async handleQuestion(
    page: Page,
    field: DetectedField,
    answers?: Record<string, string>
  ): Promise<boolean> {
    if (!answers || Object.keys(answers).length === 0) return false;

    // Find best matching answer by fuzzy matching on label
    const fieldLabel = field.label.toLowerCase();
    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const [question, answer] of Object.entries(answers)) {
      const score = fuzzyMatch(fieldLabel, question.toLowerCase());
      if (score > bestScore && score > 0.3) {
        bestScore = score;
        bestMatch = answer;
      }
    }

    if (!bestMatch) {
      // Use first answer as generic fallback
      const firstAnswer = Object.values(answers)[0];
      if (firstAnswer) {
        bestMatch = firstAnswer;
      }
    }

    if (bestMatch) {
      return this.humanType(page, field.selector, bestMatch);
    }

    return false;
  }

  /**
   * Click the submit button with safety checks.
   */
  private async clickSubmit(page: Page, submitField: DetectedField): Promise<boolean> {
    try {
      // Pre-submit pause (human thinks before clicking)
      await humanDelay(1500, 3000);

      const btn = await page.$(submitField.selector);
      if (!btn) {
        logger.error(`Submit button not found: ${submitField.selector}`);
        return false;
      }

      // Scroll into view
      await btn.scrollIntoViewIfNeeded();
      await humanDelay(300, 600);

      // Click
      await btn.click();
      logger.info('Submit button clicked');

      // Wait for navigation or confirmation
      try {
        await page.waitForLoadState('networkidle', { timeout: 10_000 });
      } catch {
        // May not trigger full navigation
      }

      // Check for success indicators
      const pageText = await page.textContent('body') || '';
      const successPatterns = [
        /successfully applied/i,
        /application.*submitted/i,
        /thank.*for.*applying/i,
        /application.*received/i,
        /applied successfully/i,
      ];

      for (const pat of successPatterns) {
        if (pat.test(pageText)) {
          logger.info('Application confirmed by platform!');
          return true;
        }
      }

      // Check for error indicators
      const errorPatterns = [
        /already applied/i,
        /error.*submitting/i,
        /please.*try.*again/i,
        /required.*field/i,
      ];

      for (const pat of errorPatterns) {
        if (pat.test(pageText)) {
          logger.warn(`Platform error after submit: matched "${pat.source}"`);
          return false;
        }
      }

      // No clear indicator — assume success (page changed)
      logger.info('Submit completed (no explicit confirmation detected)');
      return true;
    } catch (err: any) {
      logger.error(`Submit failed: ${err.message}`);
      return false;
    }
  }
}

// ============================================
// Utility functions
// ============================================

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = randomBetween(minMs, maxMs);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Simple word-overlap fuzzy match score (0–1).
 */
function fuzzyMatch(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let matches = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) matches++;
  }

  return matches / Math.max(wordsA.size, wordsB.size);
}
