import { RawJobData } from './job-parser';
import { JobRecord } from '../db/job-repository';
import logger from '../utils/logger';

/**
 * Normalizes raw scraped job data into clean, structured DB records.
 * Handles the messy reality of Naukri's inconsistent data formats.
 */
export class JobNormalizer {

  normalize(raw: RawJobData, platform: string): JobRecord {
    const experience = this.parseExperience(raw.experience);
    const salary = this.parseSalary(raw.salary);

    return {
      external_job_id: raw.externalId,
      source_platform: platform,
      title: this.cleanText(raw.title),
      company_name: this.cleanText(raw.company) || null,
      location: this.normalizeLocation(raw.location),
      experience_min: experience.min,
      experience_max: experience.max,
      salary_min: salary.min,
      salary_max: salary.max,
      salary_currency: salary.currency,
      job_description: raw.description || null,
      job_url: raw.jobUrl,
      skills: this.normalizeSkills(raw.skills),
      company_rating: this.parseRating(raw.rating),
      job_type: raw.jobType || null,
      posted_date: this.parsePostedDate(raw.postedDate),
      raw_data: raw as any,
    };
  }

  normalizeBatch(rawJobs: RawJobData[], platform: string): JobRecord[] {
    const normalized: JobRecord[] = [];

    for (const raw of rawJobs) {
      try {
        const job = this.normalize(raw, platform);
        if (this.validate(job)) {
          normalized.push(job);
        } else {
          logger.debug(`Validation failed for job: ${raw.title} (${raw.externalId})`);
        }
      } catch (err: any) {
        logger.warn(`Normalization failed for ${raw.externalId}: ${err.message}`);
      }
    }

    return normalized;
  }

  /**
   * Parse experience string like "2-5 Yrs", "0-1 Years", "Fresher"
   */
  private parseExperience(exp: string): { min: number | null; max: number | null } {
    if (!exp) return { min: null, max: null };

    const cleaned = exp.toLowerCase().trim();

    if (cleaned.includes('fresher') || cleaned === '0') {
      return { min: 0, max: 0 };
    }

    // Match patterns: "2-5 Yrs", "2 - 5 Years", "5+ Years"
    const rangeMatch = cleaned.match(/(\d+)\s*[-–to]+\s*(\d+)/);
    if (rangeMatch) {
      return { min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) };
    }

    const plusMatch = cleaned.match(/(\d+)\s*\+/);
    if (plusMatch) {
      return { min: parseInt(plusMatch[1]), max: null };
    }

    const singleMatch = cleaned.match(/(\d+)/);
    if (singleMatch) {
      const val = parseInt(singleMatch[1]);
      return { min: val, max: val };
    }

    return { min: null, max: null };
  }

  /**
   * Parse salary string.
   * Naukri formats: "5-10 Lacs PA", "₹5,00,000 - ₹10,00,000", "Not disclosed"
   */
  private parseSalary(sal: string): { min: number | null; max: number | null; currency: string } {
    if (!sal) return { min: null, max: null, currency: 'INR' };

    const cleaned = sal.toLowerCase().trim();

    if (cleaned.includes('not disclosed') || cleaned.includes('confidential')) {
      return { min: null, max: null, currency: 'INR' };
    }

    // "5-10 Lacs PA" → 5 LPA to 10 LPA
    const lacsMatch = cleaned.match(/([\d.]+)\s*[-–to]+\s*([\d.]+)\s*(?:lacs?|lakhs?)/);
    if (lacsMatch) {
      return {
        min: Math.round(parseFloat(lacsMatch[1])),
        max: Math.round(parseFloat(lacsMatch[2])),
        currency: 'INR',
      };
    }

    // "5 Lacs PA" (single value)
    const singleLacMatch = cleaned.match(/([\d.]+)\s*(?:lacs?|lakhs?)/);
    if (singleLacMatch) {
      const val = Math.round(parseFloat(singleLacMatch[1]));
      return { min: val, max: val, currency: 'INR' };
    }

    // "₹5,00,000 - ₹10,00,000" → convert to LPA
    const rupeeMatch = cleaned.match(/₹?\s*([\d,]+)\s*[-–to]+\s*₹?\s*([\d,]+)/);
    if (rupeeMatch) {
      const minVal = parseInt(rupeeMatch[1].replace(/,/g, '')) / 100000; // convert to lacs
      const maxVal = parseInt(rupeeMatch[2].replace(/,/g, '')) / 100000;
      return { min: Math.round(minVal), max: Math.round(maxVal), currency: 'INR' };
    }

    // USD patterns
    if (cleaned.includes('$') || cleaned.includes('usd')) {
      const usdMatch = cleaned.match(/([\d,]+)\s*[-–to]+\s*([\d,]+)/);
      if (usdMatch) {
        return {
          min: parseInt(usdMatch[1].replace(/,/g, '')),
          max: parseInt(usdMatch[2].replace(/,/g, '')),
          currency: 'USD',
        };
      }
    }

    return { min: null, max: null, currency: 'INR' };
  }

  /**
   * Normalize skills: lowercase, deduplicate, remove junk.
   */
  private normalizeSkills(skills: string[]): string[] {
    const SKILL_ALIASES: Record<string, string> = {
      'springboot': 'spring boot',
      'spring-boot': 'spring boot',
      'reactjs': 'react',
      'react.js': 'react',
      'nodejs': 'node.js',
      'node': 'node.js',
      'javascript': 'javascript',
      'js': 'javascript',
      'typescript': 'typescript',
      'ts': 'typescript',
      'postgresql': 'postgresql',
      'postgres': 'postgresql',
      'mysql': 'mysql',
      'mongodb': 'mongodb',
      'mongo': 'mongodb',
      'aws': 'aws',
      'amazon web services': 'aws',
      'docker': 'docker',
      'kubernetes': 'kubernetes',
      'k8s': 'kubernetes',
      'html5': 'html',
      'css3': 'css',
    };

    const JUNK_SKILLS = new Set(['', 'etc', 'others', 'more', '...', 'and more']);

    return [...new Set(
      skills
        .map(s => s.toLowerCase().trim())
        .filter(s => s.length > 0 && s.length < 50 && !JUNK_SKILLS.has(s))
        .map(s => SKILL_ALIASES[s] || s)
    )];
  }

  /**
   * Normalize location strings.
   */
  private normalizeLocation(loc: string): string | null {
    if (!loc) return null;

    return loc
      .split(',')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(l => {
        // Standardize common city names
        const lower = l.toLowerCase();
        if (lower.includes('bengaluru') || lower.includes('bangalore')) return 'Bangalore';
        if (lower.includes('delhi') || lower.includes('ncr') || lower.includes('noida') || lower.includes('gurgaon') || lower.includes('gurugram')) return 'Delhi NCR';
        if (lower.includes('mumbai') || lower.includes('bombay')) return 'Mumbai';
        if (lower.includes('hyderabad')) return 'Hyderabad';
        if (lower.includes('chennai')) return 'Chennai';
        if (lower.includes('pune')) return 'Pune';
        if (lower.includes('kolkata') || lower.includes('calcutta')) return 'Kolkata';
        if (lower.includes('remote') || lower.includes('work from home') || lower.includes('wfh')) return 'Remote';
        return l;
      })
      .filter((v, i, arr) => arr.indexOf(v) === i) // deduplicate
      .join(', ');
  }

  private parseRating(rating: string): number | null {
    if (!rating) return null;
    const match = rating.match(/([\d.]+)/);
    if (match) {
      const val = parseFloat(match[1]);
      return val > 0 && val <= 5 ? val : null;
    }
    return null;
  }

  /**
   * Convert relative dates like "3 Days Ago", "Today", "1 Month Ago" to ISO date strings.
   */
  private parsePostedDate(dateStr: string): string | null {
    if (!dateStr) return null;

    const cleaned = dateStr.toLowerCase().trim();
    const now = new Date();

    if (cleaned.includes('today') || cleaned.includes('just now')) {
      return now.toISOString().split('T')[0];
    }

    if (cleaned.includes('yesterday')) {
      now.setDate(now.getDate() - 1);
      return now.toISOString().split('T')[0];
    }

    const daysMatch = cleaned.match(/(\d+)\s*day/);
    if (daysMatch) {
      now.setDate(now.getDate() - parseInt(daysMatch[1]));
      return now.toISOString().split('T')[0];
    }

    const weeksMatch = cleaned.match(/(\d+)\s*week/);
    if (weeksMatch) {
      now.setDate(now.getDate() - parseInt(weeksMatch[1]) * 7);
      return now.toISOString().split('T')[0];
    }

    const monthsMatch = cleaned.match(/(\d+)\s*month/);
    if (monthsMatch) {
      now.setMonth(now.getMonth() - parseInt(monthsMatch[1]));
      return now.toISOString().split('T')[0];
    }

    // Try direct date parse as fallback
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }

    return null;
  }

  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/[\n\r\t]/g, ' ')
      .trim();
  }

  /**
   * Basic validation — reject garbage entries.
   */
  private validate(job: JobRecord): boolean {
    if (!job.external_job_id) return false;
    if (!job.title || job.title.length < 3) return false;
    if (!job.job_url || !job.job_url.startsWith('http')) return false;
    return true;
  }
}
