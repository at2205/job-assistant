import { BrowserContext, Page } from 'playwright';
import logger from './logger';

/**
 * Anti-detection measures for Playwright.
 * Avoids common bot fingerprinting without relying on external stealth plugins.
 */
export async function applyStealthScripts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Override navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => false });

    // Override chrome runtime
    (window as any).chrome = { runtime: {} };

    // Override permissions query
    const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
    window.navigator.permissions.query = (parameters: any) => {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: 'denied' } as PermissionStatus);
      }
      return originalQuery(parameters);
    };

    // Spoof plugins length
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    // Spoof languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });

  logger.debug('Stealth scripts injected');
}

/**
 * Human-like typing: variable speed, occasional pauses.
 */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  for (const char of text) {
    await page.keyboard.type(char, { delay: 50 + Math.random() * 150 });
    // Occasional longer pause (simulates thinking)
    if (Math.random() < 0.05) {
      await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
    }
  }
}

/**
 * Human-like mouse movement before clicking.
 */
export async function humanClick(page: Page, selector: string): Promise<void> {
  const element = await page.waitForSelector(selector, { timeout: 10000 });
  if (!element) throw new Error(`Element not found: ${selector}`);

  const box = await element.boundingBox();
  if (!box) throw new Error(`No bounding box for: ${selector}`);

  // Click at a random point within the element, not dead center
  const x = box.x + box.width * (0.3 + Math.random() * 0.4);
  const y = box.y + box.height * (0.3 + Math.random() * 0.4);

  await page.mouse.move(x, y, { steps: 5 + Math.floor(Math.random() * 10) });
  await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
  await page.mouse.click(x, y);
}

/** Realistic viewport sizes */
export function getRandomViewport(): { width: number; height: number } {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ];
  return viewports[Math.floor(Math.random() * viewports.length)];
}
