import { Page } from 'playwright';
import { PlatformConfig, getPlatformConfig } from '../config/platforms';
import { SessionManager } from './session-manager';
import { CaptchaStrategy } from './captcha-strategy';
import { humanType, humanClick } from '../utils/stealth';
import { withRetry, randomDelay } from '../utils/retry';
import logger from '../utils/logger';

export interface LoginResult {
  success: boolean;
  method: 'session_restored' | 'fresh_login';
  message: string;
}

export class LoginHandler {
  private sessionManager: SessionManager;
  private captchaStrategy: CaptchaStrategy;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
    this.captchaStrategy = new CaptchaStrategy();
  }

  /**
   * Main login orchestrator.
   * 1. Try restoring saved session
   * 2. If invalid, do fresh login with anti-detection
   * 3. Save new session on success
   */
  async login(platform: string, credentials: { email: string; password: string }): Promise<LoginResult> {
    const config = getPlatformConfig(platform);

    // Step 1: Check rate limits
    const canLogin = this.sessionManager.canAttemptLogin(platform, config);
    if (!canLogin.allowed) {
      logger.error(canLogin.reason!);
      return { success: false, method: 'fresh_login', message: canLogin.reason! };
    }

    // Step 2: Try existing session
    const page = await this.sessionManager.getPage();

    try {
      logger.info(`[${config.name}] Checking existing session...`);
      const sessionValid = await this.sessionManager.validateSession(platform, config, page);

      if (sessionValid) {
        return {
          success: true,
          method: 'session_restored',
          message: `Logged into ${config.name} using saved session.`,
        };
      }

      // Step 3: Fresh login
      logger.info(`[${config.name}] Performing fresh login...`);
      return await this.freshLogin(page, platform, config, credentials);
    } catch (err: any) {
      logger.error(`[${config.name}] Login failed: ${err.message}`);
      this.sessionManager.recordLoginAttempt(platform, false);
      return { success: false, method: 'fresh_login', message: err.message };
    }
  }

  private async freshLogin(
    page: Page,
    platform: string,
    config: PlatformConfig,
    credentials: { email: string; password: string }
  ): Promise<LoginResult> {
    return await withRetry(
      async () => {
        // Navigate to login page
        await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await randomDelay(1500, 3000);

        // Check for CAPTCHA before even trying
        const preCaptcha = await this.captchaStrategy.detect(page, config);
        if (preCaptcha) {
          const action = await this.captchaStrategy.handle(page, config);
          if (action === 'abort') {
            throw new Error('CAPTCHA appeared before login. Try again later.');
          }
        }

        // Clear and type email (human-like)
        logger.info(`[${config.name}] Entering credentials...`);
        await page.waitForSelector(config.selectors.emailInput, { timeout: 10000 });
        await humanType(page, config.selectors.emailInput, credentials.email);
        await randomDelay(500, 1500);

        // Clear and type password
        await humanType(page, config.selectors.passwordInput, credentials.password);
        await randomDelay(800, 2000);

        // Click login
        await humanClick(page, config.selectors.loginButton);
        logger.info(`[${config.name}] Login button clicked. Waiting for response...`);

        // Wait for either success or CAPTCHA
        await randomDelay(3000, 5000);

        // Check for CAPTCHA after submit
        const postCaptcha = await this.captchaStrategy.detect(page, config);
        if (postCaptcha) {
          const action = await this.captchaStrategy.handle(page, config);
          if (action === 'abort') {
            throw new Error('CAPTCHA after login. Manual solve timed out.');
          }
        }

        // Verify login success — check if we navigated away from login page
        try {
          await page.waitForURL((url) => !url.toString().includes('/nlogin/login'), { timeout: 15000 });
        } catch {
          // Check for error messages
          const pageContent = await page.textContent('body');
          if (pageContent?.includes('incorrect') || pageContent?.includes('Invalid')) {
            throw new Error('Invalid credentials. Check your email/password in .env');
          }
          throw new Error('Login did not succeed — still on login page after 15s.');
        }

        // Success — save session
        logger.info(`[${config.name}] Login successful!`);
        await this.sessionManager.saveSession(platform, page);
        this.sessionManager.recordLoginAttempt(platform, true);

        return {
          success: true,
          method: 'fresh_login' as const,
          message: `Successfully logged into ${config.name}. Session saved.`,
        };
      },
      `${config.name}-login`,
      { maxAttempts: 2, baseDelayMs: 8000 }
    );
  }
}
