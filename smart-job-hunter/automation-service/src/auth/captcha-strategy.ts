import { Page } from 'playwright';
import { PlatformConfig } from '../config/platforms';
import logger from '../utils/logger';

export type CaptchaAction = 'wait_for_manual' | 'abort' | 'skip';

/**
 * CAPTCHA handling strategy.
 *
 * Philosophy: We do NOT use automated CAPTCHA solvers (violates ToS and is unreliable).
 * Instead, we:
 * 1. Minimize CAPTCHA triggers through stealth
 * 2. Detect when CAPTCHA appears
 * 3. Pause and alert the user for manual solving
 * 4. Resume after manual intervention
 */
export class CaptchaStrategy {
  private manualSolveTimeoutMs: number;

  constructor(timeoutMs: number = 180000) {
    this.manualSolveTimeoutMs = timeoutMs; // 3 minutes to solve manually
  }

  async detect(page: Page, config: PlatformConfig): Promise<boolean> {
    if (!config.selectors.captchaIndicator) return false;

    try {
      const captcha = await page.$(config.selectors.captchaIndicator);
      if (captcha) {
        logger.warn(`CAPTCHA detected on ${config.name}!`);
        return true;
      }
    } catch {
      // Selector not found — no CAPTCHA
    }

    return false;
  }

  async handle(page: Page, config: PlatformConfig): Promise<CaptchaAction> {
    const hasCaptcha = await this.detect(page, config);
    if (!hasCaptcha) return 'skip';

    logger.warn(`⚠️  CAPTCHA detected on ${config.name}. Waiting for manual solve...`);
    logger.warn(`   You have ${this.manualSolveTimeoutMs / 1000}s to solve it in the browser window.`);

    try {
      // Wait for the CAPTCHA element to disappear (user solved it)
      // or for the success indicator to appear
      await page.waitForSelector(config.selectors.loginSuccessIndicator, {
        timeout: this.manualSolveTimeoutMs,
      });

      logger.info('CAPTCHA appears to be solved. Continuing...');
      return 'wait_for_manual';
    } catch {
      logger.error('CAPTCHA was not solved in time. Aborting login.');
      return 'abort';
    }
  }
}
