/**
 * Premium / high-quality company definitions for job filtering.
 *
 * A job is "premium" if the company matches the curated PREMIUM_COMPANIES list
 * (word-boundary aware), OR (fallback) has a company rating >= PREMIUM_MIN_RATING,
 * AND is not a staffing / mass-recruiter / consultancy firm (STAFFING_BLOCKLIST).
 *
 * The curated list favours product companies, unicorns/soonicorns, global product
 * MNCs, and reputable GCCs (global capability centres) that hire SDE/backend/
 * full-stack talent in India.
 */

export const PREMIUM_MIN_RATING = 3.8;

/** Curated premium employers (lowercase canonical tokens). */
export const PREMIUM_COMPANIES: string[] = [
  // Big Tech / FAANG+ and global product MNCs
  'google', 'microsoft', 'amazon', 'aws', 'meta', 'apple', 'netflix', 'nvidia',
  'adobe', 'salesforce', 'oracle', 'sap', 'ibm', 'intel', 'qualcomm', 'cisco',
  'vmware', 'dell', 'uber', 'linkedin', 'paypal', 'ebay', 'twitter', 'x corp',
  'atlassian', 'servicenow', 'workday', 'snowflake', 'databricks', 'mongodb',
  'confluent', 'elastic', 'hashicorp', 'gitlab', 'github', 'cloudflare', 'stripe',
  'twilio', 'datadog', 'splunk', 'nutanix', 'palo alto', 'akamai', 'arista',
  'expedia', 'booking', 'airbnb', 'walmart', 'walmart global tech', 'target',
  'visa', 'mastercard', 'american express', 'goldman sachs', 'morgan stanley',
  'jpmorgan', 'jp morgan', 'barclays', 'deutsche bank', 'wells fargo', 'bny mellon',
  'bloomberg', 'wayfair', 'intuit', 'autodesk', 'nutanix', 'roblox', 'coinbase',
  'okta', 'zscaler', 'crowdstrike', 'square inc', 'block inc', 'doordash', 'instacart',
  'pinterest', 'snap', 'dropbox', 'box', 'asana', 'notion', 'figma', 'canva',
  'grammarly', 'plaid', 'robinhood', 'squarespace', 'shopify', 'twitch',

  // Indian product unicorns / soonicorns / top startups
  'flipkart', 'myntra', 'phonepe', 'razorpay', 'zomato', 'swiggy', 'paytm',
  'cred', 'meesho', 'dream11', 'dream sports', 'groww', 'zerodha', 'upstox',
  'postman', 'freshworks', 'zoho', 'browserstack', 'chargebee', 'hasura',
  'gojek', 'ola', 'olacabs', 'oyo', 'urban company', 'urbancompany', 'nykaa',
  'unacademy', 'byju', "byju's", 'vedantu', 'physicswallah', 'pw', 'sharechum',
  'sharechat', 'mobikwik', 'pinelabs', 'pine labs', 'cashfree', 'juspay',
  'delhivery', 'zepto', 'blinkit', 'licious', 'bigbasket', 'cars24', 'spinny',
  'games24x7', 'mpl', 'winzo', 'navi', 'slice', 'jupiter', 'fi money',
  'khatabook', 'rupeek', 'lendingkart', 'acko', 'digit', 'policybazaar', 'coverfox',
  'purplle', 'mamaearth', 'boat', 'firstcry', 'lenskart', 'pharmeasy', '1mg',
  'tata 1mg', 'practo', 'healthkart', 'cure.fit', 'cult.fit', 'curefit',
  'darwinbox', 'whatfix', 'gupshup', 'mindtickle', 'innovaccer', 'icertis',
  'druva', 'postman', 'hasura', 'fyle', 'clevertap', 'moengage', 'netcore',
  'sprinklr', 'zeta', 'setu', 'm2p', 'perfios', 'yubi', 'kredx', 'capital float',

  // GCCs / R&D centres of global firms in India (product engineering)
  'goldman sachs services', 'wells fargo india', 'american express india',
  'walmart labs', 'target india', 'lowes', "lowe's", ' working at target',
  'shell', 'philips', 'siemens', 'ge', 'ge digital', 'honeywell', 'schneider',
  'bosch', 'continental', 'harman', 'mercedes-benz', 'volvo', 'nokia', 'ericsson',
  'samsung', 'samsung r&d', 'sony', 'texas instruments', 'micron', 'amd',
  'broadcom', 'western digital', 'seagate', 'nutanix', 'juniper', 'f5', 'netapp',
  'thoughtworks', 'sabre', 'epam', 'publicis sapient', 'sapient', 'globallogic',
  'nagarro', 'mckinsey', 'bcg', 'bain', 'deloitte digital', 'gartner',
  'expedia group', 'agoda', 'grab', 'sea group', 'sea limited', 'shopee', 'trilogy', 'crossover',
  'servicenow india', 'adobe india', 'salesforce india', 'sabre',
];

/**
 * Staffing / mass-recruiter / body-shop consultancies to EXCLUDE even if they
 * post many "premium-sounding" roles. These are not the end employer.
 */
export const STAFFING_BLOCKLIST: string[] = [
  'staffing', 'staff', 'recruit', 'recruiter', 'recruitment', 'consultanc',
  'consultant', 'consulting services', 'manpower', 'placement', 'hr services',
  'hr solutions', 'talent solutions', 'talent acquisition', 'workforce',
  'resourcing', 'hiring', 'jobs', 'careers', 'outsourc', 'staffink', 'randstad',
  'adecco', 'kelly services', 'teamlease', 'quess', 'aarvi', 'gi group',
  'crescendo', 'huquo', 'spectral', 'reputed company', 'a reputed', 'confidential',
  'client of', 'leading company', 'mnc', 'premium client', 'undisclosed',
  'staffing solutions', 'it services', 'technosoft', 'infoservices',
];

function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Whole-word-ish token presence (avoids "ge" matching "generation"). */
function containsToken(haystack: string, token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  if (/[^a-z0-9]/.test(t)) return haystack.includes(t); // multi-word / punctuated
  const re = new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);
  return re.test(haystack);
}

export function isStaffingFirm(company: string | null | undefined): boolean {
  const c = norm(company || '');
  if (!c) return true; // unknown/blank company => treat as non-premium
  return STAFFING_BLOCKLIST.some(b => (/[^a-z0-9]/.test(b) ? c.includes(b) : containsToken(c, b)));
}

export interface PremiumMatch {
  isPremium: boolean;
  reason: 'curated' | 'rating' | null;
  matchedName?: string;
}

/**
 * Decide if a company qualifies as premium.
 * @param company   company name from the job card
 * @param rating    optional company rating (0-5)
 */
export function classifyCompany(company: string | null | undefined, rating?: number | null): PremiumMatch {
  const c = norm(company || '');
  if (!c) return { isPremium: false, reason: null };
  if (isStaffingFirm(company)) return { isPremium: false, reason: null };

  for (const name of PREMIUM_COMPANIES) {
    if (containsToken(c, norm(name))) {
      return { isPremium: true, reason: 'curated', matchedName: name };
    }
  }
  if (typeof rating === 'number' && rating >= PREMIUM_MIN_RATING) {
    return { isPremium: true, reason: 'rating' };
  }
  return { isPremium: false, reason: null };
}
