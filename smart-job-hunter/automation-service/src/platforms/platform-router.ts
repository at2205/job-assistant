import { Page } from 'playwright';
import {
  NAUKRI_CONFIG,
  naukriLogin,
  naukriValidateSession,
  naukriParseJobCards,
  naukriApplyToJob
} from './naukri-adapter';
import {
  LINKEDIN_CONFIG,
  linkedinLogin,
  linkedinEasyApply
} from './linkedin-adapter';
import logger from '../utils/logger';

/**
 * Platform router — unified interface for all job platforms.
 * Add new platforms by creating an adapter and registering here.
 */

export type SupportedPlatform = 'naukri' | 'linkedin';

export interface PlatformLimits {
  minDelayBetweenPages: number;
  maxDelayBetweenPages: number;
  minDelayBetweenApply: number;
  maxDelayBetweenApply: number;
  maxPagesPerSession: number;
  maxAppliesPerDay: number;
}

export function getPlatformLimits(platform: SupportedPlatform): PlatformLimits {
  switch (platform) {
    case 'naukri': return NAUKRI_CONFIG.limits;
    case 'linkedin': return LINKEDIN_CONFIG.limits;
    default: return NAUKRI_CONFIG.limits;
  }
}

export async function platformLogin(
  page: Page,
  platform: SupportedPlatform,
  email: string,
  password: string
): Promise<boolean> {
  switch (platform) {
    case 'naukri': return naukriLogin(page, email, password);
    case 'linkedin': return linkedinLogin(page, email, password);
    default:
      logger.error(`Unsupported platform: ${platform}`);
      return false;
  }
}

export async function platformValidateSession(page: Page, platform: SupportedPlatform): Promise<boolean> {
  switch (platform) {
    case 'naukri': return naukriValidateSession(page);
    case 'linkedin': {
      try {
        await page.goto(LINKEDIN_CONFIG.feedUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await new Promise(r => setTimeout(r, 3000));
        const valid = await page.$(LINKEDIN_CONFIG.sessionCheck.validIndicator);
        return !!valid;
      } catch { return false; }
    }
    default: return false;
  }
}

export function buildSearchUrl(platform: SupportedPlatform, params: {
  role: string;
  location?: string;
  experience?: string;
}): string {
  switch (platform) {
    case 'naukri': return NAUKRI_CONFIG.search.buildSearchUrl(params);
    case 'linkedin': return LINKEDIN_CONFIG.search.buildSearchUrl({ ...params, easyApply: true });
    default: return '';
  }
}

export async function platformApply(
  page: Page,
  platform: SupportedPlatform,
  jobUrl: string,
  content: { resumePath?: string; coverLetter?: string; phone?: string; answers?: Record<string, string> }
): Promise<{ success: boolean; error?: string }> {
  switch (platform) {
    case 'naukri': return naukriApplyToJob(page, jobUrl, content);
    case 'linkedin': {
      // Navigate first
      await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, randomInt(3000, 6000)));
      return linkedinEasyApply(page, content);
    }
    default:
      return { success: false, error: `Unsupported platform: ${platform}` };
  }
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
