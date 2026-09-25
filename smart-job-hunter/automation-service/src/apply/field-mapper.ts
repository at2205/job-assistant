import { Page } from 'playwright';
import logger from '../utils/logger';

/**
 * Detected form field with its type and location.
 */
export interface DetectedField {
  type: 'text' | 'textarea' | 'file' | 'select' | 'radio' | 'checkbox' | 'button';
  purpose: 'resume' | 'cover_letter' | 'name' | 'email' | 'phone' | 'experience' | 'salary' | 'question' | 'submit' | 'unknown';
  selector: string;
  label: string;
  required: boolean;
  currentValue?: string;
}

/**
 * Heuristic patterns to detect field purpose from label text, name, id, placeholder.
 */
const FIELD_PATTERNS: Array<{ purpose: DetectedField['purpose']; patterns: RegExp[] }> = [
  {
    purpose: 'resume',
    patterns: [/resume/i, /cv[\s_-]?upload/i, /attach.*resume/i, /upload.*resume/i, /file.*resume/i],
  },
  {
    purpose: 'cover_letter',
    patterns: [/cover[\s_-]?letter/i, /covering[\s_-]?letter/i, /letter.*motivation/i],
  },
  {
    purpose: 'name',
    patterns: [/full[\s_-]?name/i, /your[\s_-]?name/i, /^name$/i, /candidate[\s_-]?name/i],
  },
  {
    purpose: 'email',
    patterns: [/email/i, /e-mail/i, /mail[\s_-]?id/i],
  },
  {
    purpose: 'phone',
    patterns: [/phone/i, /mobile/i, /contact[\s_-]?number/i, /cell/i],
  },
  {
    purpose: 'experience',
    patterns: [/experience/i, /years.*exp/i, /exp.*years/i, /total[\s_-]?exp/i],
  },
  {
    purpose: 'salary',
    patterns: [/salary/i, /ctc/i, /compensation/i, /expected.*pay/i, /current.*ctc/i],
  },
  {
    purpose: 'question',
    patterns: [/why.*(?:join|hire|apply)/i, /describe/i, /tell.*about/i, /what.*(?:strength|motivat)/i],
  },
];

/**
 * Detects and maps form fields on a job application page.
 * Platform-agnostic — uses heuristics to find fields regardless of DOM structure.
 */
export class FieldMapper {

  /**
   * Scan the current page for application form fields.
   */
  async detectFields(page: Page): Promise<DetectedField[]> {
    const fields: DetectedField[] = [];

    // Detect input fields
    const inputs = await page.$$('input:visible, textarea:visible, select:visible');
    for (const el of inputs) {
      const field = await this.analyzeElement(page, el);
      if (field) fields.push(field);
    }

    // Detect file upload inputs (often hidden)
    const fileInputs = await page.$$('input[type="file"]');
    for (const el of fileInputs) {
      const field = await this.analyzeElement(page, el, true);
      if (field) fields.push(field);
    }

    // Detect submit button
    const submitBtn = await this.findSubmitButton(page);
    if (submitBtn) fields.push(submitBtn);

    logger.info(`Detected ${fields.length} form fields: ${fields.map(f => `${f.purpose}(${f.type})`).join(', ')}`);
    return fields;
  }

  /**
   * Analyze a single DOM element to determine its purpose.
   */
  private async analyzeElement(page: Page, el: any, isFile: boolean = false): Promise<DetectedField | null> {
    try {
      const info = await el.evaluate((node: HTMLInputElement) => ({
        tagName: node.tagName.toLowerCase(),
        type: node.type || 'text',
        name: node.name || '',
        id: node.id || '',
        placeholder: node.placeholder || '',
        required: node.required || node.getAttribute('aria-required') === 'true',
        ariaLabel: node.getAttribute('aria-label') || '',
        value: node.value || '',
      }));

      // Get associated label
      const label = await this.getLabel(page, el, info.id);

      // Determine field type
      let type: DetectedField['type'] = 'text';
      if (isFile || info.type === 'file') type = 'file';
      else if (info.tagName === 'textarea') type = 'textarea';
      else if (info.tagName === 'select') type = 'select';
      else if (info.type === 'radio') type = 'radio';
      else if (info.type === 'checkbox') type = 'checkbox';

      // Build selector
      const selector = info.id
        ? `#${CSS.escape(info.id)}`
        : info.name
          ? `${info.tagName}[name="${info.name}"]`
          : `${info.tagName}[placeholder="${info.placeholder}"]`;

      // Determine purpose via heuristics
      const searchText = [label, info.name, info.id, info.placeholder, info.ariaLabel].join(' ');
      const purpose = this.classifyPurpose(searchText);

      return {
        type,
        purpose,
        selector,
        label: label || info.placeholder || info.name || 'Unknown',
        required: info.required,
        currentValue: info.value || undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get the label text for a form element.
   */
  private async getLabel(page: Page, el: any, id: string): Promise<string> {
    try {
      // Try explicit label[for]
      if (id) {
        const labelEl = await page.$(`label[for="${id}"]`);
        if (labelEl) {
          return (await labelEl.textContent())?.trim() || '';
        }
      }

      // Try parent label
      const parentLabel = await el.evaluate((node: Element) => {
        const label = node.closest('label');
        return label?.textContent?.trim() || '';
      });
      if (parentLabel) return parentLabel;

      // Try preceding sibling/nearby text
      const nearby = await el.evaluate((node: Element) => {
        const prev = node.previousElementSibling;
        if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'P')) {
          return prev.textContent?.trim() || '';
        }
        const parent = node.parentElement;
        const span = parent?.querySelector('span, label, p');
        return span?.textContent?.trim() || '';
      });

      return nearby || '';
    } catch {
      return '';
    }
  }

  /**
   * Classify field purpose from combined label/name/id text.
   */
  private classifyPurpose(text: string): DetectedField['purpose'] {
    if (!text) return 'unknown';

    for (const { purpose, patterns } of FIELD_PATTERNS) {
      for (const pat of patterns) {
        if (pat.test(text)) return purpose;
      }
    }

    return 'unknown';
  }

  /**
   * Find the submit/apply button on the page.
   */
  private async findSubmitButton(page: Page): Promise<DetectedField | null> {
    const selectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Apply")',
      'button:has-text("Submit")',
      'a:has-text("Apply Now")',
      'button:has-text("Apply Now")',
      'button:has-text("Easy Apply")',
      '[class*="apply" i] button',
      '[id*="apply" i]',
    ];

    for (const sel of selectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          const isVisible = await btn.isVisible();
          if (isVisible) {
            return {
              type: 'button',
              purpose: 'submit',
              selector: sel,
              label: (await btn.textContent())?.trim() || 'Apply',
              required: false,
            };
          }
        }
      } catch {
        continue;
      }
    }

    return null;
  }
}

// CSS.escape polyfill for Node
function cssEscapePolyfill(value: string): string {
  return value.replace(/([^\w-])/g, '\\$1');
}
if (typeof CSS === 'undefined') {
  (globalThis as any).CSS = { escape: cssEscapePolyfill };
}
