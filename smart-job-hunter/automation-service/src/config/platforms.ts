/**
 * Platform configuration — selectors, URLs, and login flow for each job platform.
 * Easily extensible: add a new platform by adding a config object.
 */

export interface PlatformConfig {
  name: string;
  baseUrl: string;
  loginUrl: string;
  selectors: {
    emailInput: string;
    passwordInput: string;
    loginButton: string;
    loginSuccessIndicator: string; // element visible only when logged in
    captchaIndicator?: string;    // element that appears if CAPTCHA is triggered
  };
  sessionValidation: {
    url: string;                  // URL to visit to check if session is alive
    successIndicator: string;     // selector present when session is valid
  };
  rateLimit: {
    minDelayBetweenActions: number; // ms
    maxDailyLogins: number;
    cooldownAfterFailedLogin: number; // ms
  };
}

export const PLATFORMS: Record<string, PlatformConfig> = {
  naukri: {
    name: 'Naukri',
    baseUrl: 'https://www.naukri.com',
    loginUrl: 'https://www.naukri.com/nlogin/login',
    selectors: {
      emailInput: '#usernameField',
      passwordInput: '#passwordField',
      loginButton: 'button.blue-btn[type="submit"]',
      loginSuccessIndicator: 'a.nI-gNb-drawer__hamburger, div.nI-gNb-header__right',
      captchaIndicator: 'iframe[src*="recaptcha/api2/anchor"], iframe[src*="recaptcha/api2/bframe"], div.captcha-container',
    },
    sessionValidation: {
      url: 'https://www.naukri.com/mnjuser/homepage',
      successIndicator: 'a.nI-gNb-drawer__hamburger, div.view-profile-wrapper',
    },
    rateLimit: {
      minDelayBetweenActions: 3000,
      maxDailyLogins: 3,
      cooldownAfterFailedLogin: 30 * 60 * 1000, // 30 minutes
    },
  },

  linkedin: {
    name: 'LinkedIn',
    baseUrl: 'https://www.linkedin.com',
    loginUrl: 'https://www.linkedin.com/login',
    selectors: {
      emailInput: '#username',
      passwordInput: '#password',
      loginButton: 'button[type="submit"]',
      loginSuccessIndicator: 'div.feed-identity-module, div.global-nav__me',
      captchaIndicator: '#captcha-internal, iframe[src*="checkpoint"]',
    },
    sessionValidation: {
      url: 'https://www.linkedin.com/feed/',
      successIndicator: 'div.feed-identity-module',
    },
    rateLimit: {
      minDelayBetweenActions: 5000,
      maxDailyLogins: 2,
      cooldownAfterFailedLogin: 60 * 60 * 1000, // 1 hour — LinkedIn is aggressive
    },
  },
};

export function getPlatformConfig(platform: string): PlatformConfig {
  const config = PLATFORMS[platform.toLowerCase()];
  if (!config) {
    throw new Error(`Unsupported platform: "${platform}". Supported: ${Object.keys(PLATFORMS).join(', ')}`);
  }
  return config;
}
