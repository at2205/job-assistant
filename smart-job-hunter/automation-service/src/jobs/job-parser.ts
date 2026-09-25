import { Page } from 'playwright';
import logger from '../utils/logger';

/**
 * Raw job data as scraped from DOM before normalization.
 */
export interface RawJobData {
  externalId: string;
  title: string;
  company: string;
  experience: string;      // "2-5 Yrs"
  salary: string;           // "5-10 Lacs PA" or "Not disclosed"
  location: string;         // "Delhi, Bangalore"
  skills: string[];         // ["Java", "Spring Boot"]
  description: string;
  jobUrl: string;
  rating: string;           // "4.2"
  postedDate: string;       // "3 Days Ago", "Today"
  jobType: string;          // "Full Time"
}

/**
 * Naukri-specific selectors.
 * Centralized here so selector changes only need one file update.
 */
const NAUKRI_SELECTORS = {
  jobCard: 'div.srp-jobtuple-wrapper, article.jobTuple',
  title: 'a.title, a.jobTitle',
  company: 'a.comp-name, a.subTitle',
  experience: 'span.expwdth, span.experience',
  salary: 'span.sal, span.salary',
  location: 'span.locWdth, span.location',
  skills: 'ul.tags-gt li, ul.skillList li, span.tag-li',
  rating: 'span.main-2, span.companyRating',
  postedDate: 'span.job-post-day, span.posted-date',
  description: 'div.job-description, div.jobDesc',
  nextPage: 'a.fright.fs14.btn-secondary, a[class*="nextPage"]',
  noResults: 'div.no-result, div.noResults',
  // Search page elements
  searchInput: 'input.suggestor-input, input#searchBox',
  experienceDropdown: 'select#experienceDD, div.experience select',
  locationInput: 'input#searchLocation, input.locationSugestor',
  searchButton: 'button.qsbSubmit, button[type="submit"]',
};

export class JobParser {

  /**
   * Parse all job cards on the current page.
   * Returns array of raw (unnormalized) job data.
   */
  async parseJobCards(page: Page): Promise<RawJobData[]> {
    const jobs: RawJobData[] = [];

    try {
      // Wait for job cards to render (dynamic content)
      await page.waitForSelector(NAUKRI_SELECTORS.jobCard, { timeout: 15000 });
    } catch {
      // Check if it's a "no results" page
      const noResults = await page.$(NAUKRI_SELECTORS.noResults);
      if (noResults) {
        logger.info('No job results found for current filters');
        return [];
      }
      logger.warn('Job cards did not load within timeout');
      return [];
    }

    const cardElements = await page.$$(NAUKRI_SELECTORS.jobCard);
    logger.info(`Found ${cardElements.length} job cards on page`);

    for (let i = 0; i < cardElements.length; i++) {
      try {
        const card = cardElements[i];
        const job = await this.parseOneCard(card, page);
        if (job && job.title && job.jobUrl) {
          jobs.push(job);
        } else {
          logger.debug(`Skipped card ${i}: missing title or URL`);
        }
      } catch (err: any) {
        logger.warn(`Failed to parse card ${i}: ${err.message}`);
      }
    }

    logger.info(`Successfully parsed ${jobs.length}/${cardElements.length} jobs`);
    return jobs;
  }

  private async parseOneCard(card: any, page: Page): Promise<RawJobData | null> {
    const getText = async (selector: string): Promise<string> => {
      try {
        const el = await card.$(selector);
        if (!el) return '';
        return ((await el.textContent()) || '').trim();
      } catch {
        return '';
      }
    };

    const getAttr = async (selector: string, attr: string): Promise<string> => {
      try {
        const el = await card.$(selector);
        if (!el) return '';
        return (await el.getAttribute(attr)) || '';
      } catch {
        return '';
      }
    };

    // Extract job URL and external ID from href
    const jobUrl = await getAttr(NAUKRI_SELECTORS.title, 'href');
    const externalId = this.extractJobId(jobUrl);

    if (!externalId) return null;

    // Extract skills as array
    const skillElements = await card.$$(NAUKRI_SELECTORS.skills);
    const skills: string[] = [];
    for (const el of skillElements) {
      const text = ((await el.textContent()) || '').trim();
      if (text && text.length < 50) { // filter out garbage
        skills.push(text);
      }
    }

    return {
      externalId,
      title: await getText(NAUKRI_SELECTORS.title),
      company: await getText(NAUKRI_SELECTORS.company),
      experience: await getText(NAUKRI_SELECTORS.experience),
      salary: await getText(NAUKRI_SELECTORS.salary),
      location: await getText(NAUKRI_SELECTORS.location),
      skills,
      description: await getText(NAUKRI_SELECTORS.description),
      jobUrl: jobUrl.startsWith('http') ? jobUrl : `https://www.naukri.com${jobUrl}`,
      rating: await getText(NAUKRI_SELECTORS.rating),
      postedDate: await getText(NAUKRI_SELECTORS.postedDate),
      jobType: 'Full Time', // default; refined if available
    };
  }

  /**
   * Extract Naukri job ID from URL.
   * URL pattern: /job-title-companyname-delhi-ncr-x-to-x-years-JOBID
   * Or: /job-listing-...-jid-XXXXXXXXXXXXX
   */
  private extractJobId(url: string): string {
    // Pattern 1: jid parameter
    const jidMatch = url.match(/jid[_-](\d+)/i);
    if (jidMatch) return jidMatch[1];

    // Pattern 2: last segment of URL after last dash (common Naukri pattern)
    const segmentMatch = url.match(/-(\d{10,})(?:\?|$)/);
    if (segmentMatch) return segmentMatch[1];

    // Pattern 3: jobId query param
    const urlObj = tryParseUrl(url);
    if (urlObj) {
      const jobId = urlObj.searchParams.get('jobId');
      if (jobId) return jobId;
    }

    // Fallback: hash the URL to create a stable ID
    return hashString(url);
  }

  /**
   * Check if there's a next page.
   */
  async hasNextPage(page: Page): Promise<boolean> {
    const nextBtn = await page.$(NAUKRI_SELECTORS.nextPage);
    return nextBtn !== null;
  }

  /**
   * Click next page and wait for content to load.
   */
  async goToNextPage(page: Page): Promise<boolean> {
    try {
      const nextBtn = await page.$(NAUKRI_SELECTORS.nextPage);
      if (!nextBtn) return false;

      await nextBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      return true;
    } catch (err: any) {
      logger.warn(`Failed navigating to next page: ${err.message}`);
      return false;
    }
  }

  getSelectors() {
    return NAUKRI_SELECTORS;
  }
}

function tryParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString();
}
