import { Browser, BrowserContext, chromium, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import CryptoJS from 'crypto-js';
import { PlatformConfig } from '../config/platforms';
import { applyStealthScripts, getRandomViewport } from '../utils/stealth';
import logger from '../utils/logger';
import { randomDelay } from '../utils/retry';

interface SessionData {
  platform: string;
  cookies: any[];
  localStorage: Record<string, string>;
  savedAt: string;
  expiresAt: string; // auto-expire sessions after 24h
}

interface LoginAttemptLog {
  platform: string;
  timestamp: number;
  success: boolean;
}

export class SessionManager {
  private sessionsDir: string;
  private encryptKey: string;
  private loginLog: LoginAttemptLog[] = [];
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor() {
    this.sessionsDir = path.resolve(process.cwd(), 'sessions');
    this.encryptKey = process.env.SESSION_ENCRYPT_KEY || 'default-change-me';

    if (this.encryptKey === 'default-change-me' || this.encryptKey === 'change-this-to-a-random-32-char-key') {
      logger.warn('SESSION_ENCRYPT_KEY is using default value. Set a secure key in .env');
    }

    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }

    this.loadLoginLog();
  }

  // --- Browser Lifecycle ---

  async launchBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
    const headless = process.env.HEADLESS === 'true';
    const slowMo = parseInt(process.env.SLOW_MO || '50');
    const viewport = getRandomViewport();

    this.browser = await chromium.launch({
      headless,
      slowMo,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--no-sandbox',
        `--window-size=${viewport.width},${viewport.height}`,
      ],
    });

    this.context = await this.browser.newContext({
      viewport,
      userAgent: this.getRandomUserAgent(),
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      geolocation: { latitude: 28.6139, longitude: 77.209 }, // Delhi
      permissions: ['geolocation'],
    });

    logger.info(`Browser launched (headless=${headless}, viewport=${viewport.width}x${viewport.height})`);
    return { browser: this.browser, context: this.context };
  }

  async getPage(): Promise<Page> {
    if (!this.context) {
      await this.launchBrowser();
    }
    const page = await this.context!.newPage();
    await applyStealthScripts(page);
    return page;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      logger.info('Browser closed');
    }
  }

  // --- Session Save/Load (Encrypted) ---

  async saveSession(platform: string, page: Page): Promise<void> {
    const cookies = await this.context!.cookies();

    // Capture localStorage
    const localStorage = await page.evaluate(() => {
      const data: Record<string, string> = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key) data[key] = window.localStorage.getItem(key) || '';
      }
      return data;
    });

    const sessionData: SessionData = {
      platform,
      cookies,
      localStorage,
      savedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
    };

    const encrypted = CryptoJS.AES.encrypt(
      JSON.stringify(sessionData),
      this.encryptKey
    ).toString();

    const filePath = this.getSessionFilePath(platform);
    fs.writeFileSync(filePath, encrypted, 'utf-8');
    logger.info(`Session saved for ${platform} (expires: ${sessionData.expiresAt})`);
  }

  async loadSession(platform: string): Promise<SessionData | null> {
    const filePath = this.getSessionFilePath(platform);

    if (!fs.existsSync(filePath)) {
      logger.info(`No saved session found for ${platform}`);
      return null;
    }

    try {
      const encrypted = fs.readFileSync(filePath, 'utf-8');
      const decrypted = CryptoJS.AES.decrypt(encrypted, this.encryptKey).toString(CryptoJS.enc.Utf8);

      if (!decrypted) {
        logger.warn(`Failed to decrypt session for ${platform}. Key may have changed.`);
        this.deleteSession(platform);
        return null;
      }

      const session: SessionData = JSON.parse(decrypted);

      // Check expiry
      if (new Date(session.expiresAt) < new Date()) {
        logger.info(`Session for ${platform} has expired. Deleting.`);
        this.deleteSession(platform);
        return null;
      }

      return session;
    } catch (err: any) {
      logger.error(`Error loading session for ${platform}: ${err.message}`);
      this.deleteSession(platform);
      return null;
    }
  }

  async restoreSession(platform: string, page: Page): Promise<boolean> {
    const session = await this.loadSession(platform);
    if (!session) return false;

    try {
      // Restore cookies
      await this.context!.addCookies(session.cookies);

      // Navigate first, then restore localStorage
      await page.goto(session.platform === 'naukri' ? 'https://www.naukri.com' : 'https://www.linkedin.com', {
        waitUntil: 'domcontentloaded',
      });

      await page.evaluate((stored) => {
        for (const [key, value] of Object.entries(stored)) {
          window.localStorage.setItem(key, value);
        }
      }, session.localStorage);

      logger.info(`Session restored for ${platform}`);
      return true;
    } catch (err: any) {
      logger.error(`Failed to restore session for ${platform}: ${err.message}`);
      return false;
    }
  }

  deleteSession(platform: string): void {
    const filePath = this.getSessionFilePath(platform);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`Session file deleted for ${platform}`);
    }
  }

  // --- Session Validation ---

  async validateSession(platform: string, config: PlatformConfig, page: Page): Promise<boolean> {
    try {
      const restored = await this.restoreSession(platform, page);
      if (!restored) return false;

      await page.goto(config.sessionValidation.url, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });

      await randomDelay(2000, 4000);

      // Check if we're still on the page (not redirected to login)
      const currentUrl = page.url();
      const isLoggedIn = !currentUrl.includes('/nlogin/login') && !currentUrl.includes('/login');

      if (isLoggedIn) {
        logger.info(`Session for ${platform} is VALID — skipping login`);
        return true;
      }

      logger.info(`Session for ${platform} is INVALID — login required`);
      this.deleteSession(platform);
      return false;
    } catch (err: any) {
      logger.warn(`Session validation failed for ${platform}: ${err.message}`);
      return false;
    }
  }

  // --- Rate Limiting ---

  canAttemptLogin(platform: string, config: PlatformConfig): { allowed: boolean; reason?: string } {
    const today = new Date().toDateString();
    const todayAttempts = this.loginLog.filter(
      (l) => l.platform === platform && new Date(l.timestamp).toDateString() === today
    );

    if (todayAttempts.length >= config.rateLimit.maxDailyLogins) {
      return { allowed: false, reason: `Daily login limit (${config.rateLimit.maxDailyLogins}) reached for ${platform}` };
    }

    const lastFailed = this.loginLog
      .filter((l) => l.platform === platform && !l.success)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (lastFailed) {
      const timeSince = Date.now() - lastFailed.timestamp;
      if (timeSince < config.rateLimit.cooldownAfterFailedLogin) {
        const remaining = Math.ceil((config.rateLimit.cooldownAfterFailedLogin - timeSince) / 60000);
        return { allowed: false, reason: `Cooldown active after failed login. Wait ${remaining} more minutes.` };
      }
    }

    return { allowed: true };
  }

  recordLoginAttempt(platform: string, success: boolean): void {
    this.loginLog.push({ platform, timestamp: Date.now(), success });
    this.saveLoginLog();
  }

  // --- Private Helpers ---

  private getSessionFilePath(platform: string): string {
    return path.join(this.sessionsDir, `${platform}.session.enc`);
  }

  private getLoginLogPath(): string {
    return path.join(this.sessionsDir, 'login-attempts.json');
  }

  private loadLoginLog(): void {
    const logPath = this.getLoginLogPath();
    if (fs.existsSync(logPath)) {
      try {
        this.loginLog = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
      } catch {
        this.loginLog = [];
      }
    }
  }

  private saveLoginLog(): void {
    fs.writeFileSync(this.getLoginLogPath(), JSON.stringify(this.loginLog, null, 2), 'utf-8');
  }

  private getRandomUserAgent(): string {
    const agents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
    ];
    return agents[Math.floor(Math.random() * agents.length)];
  }
}
