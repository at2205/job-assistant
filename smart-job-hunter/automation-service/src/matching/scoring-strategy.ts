import { ScoringConfig } from './weights-config';

/**
 * Extracted features for scoring. Both user and job data normalized
 * into a common structure that strategies can consume.
 */
export interface UserFeatures {
  skills: string[];            // lowercase, normalized
  experienceYears: number;
  preferredLocations: string[]; // normalized city names
  expectedSalaryMin: number;   // LPA
  expectedSalaryMax: number;   // LPA
}

export interface JobFeatures {
  jobId: string;
  skills: string[];
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  location: string | null;
  postedDate: Date | null;
  title: string;
  companyName: string | null;
}

/**
 * Result from a single scoring dimension.
 */
export interface DimensionScore {
  score: number;        // 0-100
  reason: string;       // human-readable explanation
  matchedItems?: string[]; // e.g., matched skills list
}

/**
 * Full score breakdown for one job.
 */
export interface ScoreResult {
  jobId: string;
  totalScore: number;
  skillScore: DimensionScore;
  experienceScore: DimensionScore;
  locationScore: DimensionScore;
  salaryScore: DimensionScore;
  recencyScore: DimensionScore;
}

// ============================================
// STRATEGY 1: Skill Match
// ============================================

/** Synonym map for fuzzy skill matching */
const SKILL_SYNONYMS: Record<string, string[]> = {
  'java':        ['core java', 'j2ee', 'java8', 'java 8', 'java11', 'java 11', 'java17'],
  'spring boot': ['springboot', 'spring-boot', 'spring framework', 'spring'],
  'react':       ['reactjs', 'react.js', 'react js'],
  'node.js':     ['nodejs', 'node'],
  'javascript':  ['js', 'es6', 'ecmascript'],
  'typescript':  ['ts'],
  'postgresql':  ['postgres', 'psql'],
  'mysql':       ['mariadb'],
  'mongodb':     ['mongo'],
  'aws':         ['amazon web services', 'ec2', 's3', 'lambda'],
  'docker':      ['containerization', 'containers'],
  'kubernetes':  ['k8s'],
  'rest api':    ['rest apis', 'restful', 'rest', 'api development'],
  'microservices': ['micro services', 'micro-services'],
  'git':         ['github', 'gitlab', 'version control'],
  'sql':         ['structured query language'],
  'html':        ['html5'],
  'css':         ['css3', 'scss', 'sass'],
};

/** Build reverse lookup: synonym → canonical name */
function buildSynonymMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [canonical, synonyms] of Object.entries(SKILL_SYNONYMS)) {
    map.set(canonical, canonical);
    for (const syn of synonyms) {
      map.set(syn, canonical);
    }
  }
  return map;
}

const SYNONYM_MAP = buildSynonymMap();

function canonicalizeSkill(skill: string): string {
  const lower = skill.toLowerCase().trim();
  return SYNONYM_MAP.get(lower) || lower;
}

export function scoreSkills(user: UserFeatures, job: JobFeatures): DimensionScore {
  if (job.skills.length === 0) {
    return { score: 50, reason: 'Job has no skill requirements listed (neutral score)' };
  }

  const userCanonical = new Set(user.skills.map(canonicalizeSkill));
  const jobCanonical = job.skills.map(canonicalizeSkill);
  const uniqueJobSkills = [...new Set(jobCanonical)];

  const matched: string[] = [];
  for (const skill of uniqueJobSkills) {
    if (userCanonical.has(skill)) {
      matched.push(skill);
    }
  }

  const ratio = matched.length / uniqueJobSkills.length;
  const score = Math.round(clamp(ratio * 100, 0, 100));

  return {
    score,
    reason: `${matched.length}/${uniqueJobSkills.length} required skills matched`,
    matchedItems: matched,
  };
}

// ============================================
// STRATEGY 2: Experience Match
// ============================================

export function scoreExperience(user: UserFeatures, job: JobFeatures, config: ScoringConfig): DimensionScore {
  const userExp = user.experienceYears;
  const jobMin = job.experienceMin;
  const jobMax = job.experienceMax;

  // No experience data on job → neutral
  if (jobMin === null && jobMax === null) {
    return { score: 60, reason: 'Job has no experience requirement (neutral score)' };
  }

  const min = jobMin ?? 0;
  const max = jobMax ?? min + 5;
  const flex = config.thresholds.experienceFlexYears;

  // Perfect fit: within range
  if (userExp >= min && userExp <= max) {
    return { score: 100, reason: `${userExp} years fits perfectly within ${min}-${max} years required` };
  }

  // Slightly below: within flex range
  if (userExp >= min - flex && userExp < min) {
    return { score: 70, reason: `${userExp} years is ${min - userExp} year(s) below the ${min}-${max} range (close)` };
  }

  // Overqualified: above max
  if (userExp > max) {
    const overBy = userExp - max;
    if (overBy <= 3) {
      return { score: 85, reason: `${userExp} years is slightly overqualified for ${min}-${max} range` };
    }
    return { score: 60, reason: `${userExp} years significantly exceeds ${min}-${max} range` };
  }

  // Significantly underqualified
  return { score: 30, reason: `${userExp} years is well below the ${min}-${max} year requirement` };
}

// ============================================
// STRATEGY 3: Location Match
// ============================================

/** Map of city → region for regional matching */
const REGION_MAP: Record<string, string> = {
  'delhi ncr': 'north',
  'noida': 'north',
  'gurgaon': 'north',
  'gurugram': 'north',
  'chandigarh': 'north',
  'jaipur': 'north',
  'lucknow': 'north',
  'mumbai': 'west',
  'pune': 'west',
  'ahmedabad': 'west',
  'bangalore': 'south',
  'chennai': 'south',
  'hyderabad': 'south',
  'kochi': 'south',
  'kolkata': 'east',
};

export function scoreLocation(user: UserFeatures, job: JobFeatures): DimensionScore {
  if (!job.location) {
    return { score: 50, reason: 'Job location not specified (neutral)' };
  }

  if (user.preferredLocations.length === 0) {
    return { score: 70, reason: 'User has no location preference (lenient)' };
  }

  const jobLoc = job.location.toLowerCase().trim();

  // Remote is always good
  if (jobLoc.includes('remote') || jobLoc.includes('work from home') || jobLoc.includes('wfh')) {
    return { score: 90, reason: 'Remote job — matches most preferences' };
  }

  const userLocs = user.preferredLocations.map(l => l.toLowerCase().trim());

  // Exact city match
  for (const userLoc of userLocs) {
    if (jobLoc.includes(userLoc) || userLoc.includes(jobLoc)) {
      return { score: 100, reason: `Exact location match: ${job.location}` };
    }
  }

  // Regional match
  const jobRegion = findRegion(jobLoc);
  for (const userLoc of userLocs) {
    const userRegion = findRegion(userLoc);
    if (jobRegion && userRegion && jobRegion === userRegion) {
      return { score: 70, reason: `Same region (${jobRegion}): ${job.location} vs user's ${userLoc}` };
    }
  }

  // Hybrid jobs get a small boost
  if (jobLoc.includes('hybrid')) {
    return { score: 55, reason: `Hybrid role in ${job.location} — not in preferred locations` };
  }

  return { score: 40, reason: `${job.location} not in preferred locations: ${user.preferredLocations.join(', ')}` };
}

function findRegion(location: string): string | null {
  for (const [city, region] of Object.entries(REGION_MAP)) {
    if (location.includes(city)) return region;
  }
  return null;
}

// ============================================
// STRATEGY 4: Salary Match
// ============================================

export function scoreSalary(user: UserFeatures, job: JobFeatures, config: ScoringConfig): DimensionScore {
  // No salary data
  if (job.salaryMin === null && job.salaryMax === null) {
    return { score: 50, reason: 'Salary not disclosed (neutral)' };
  }

  if (user.expectedSalaryMin === 0 && user.expectedSalaryMax === 0) {
    return { score: 70, reason: 'User has no salary expectation set (lenient)' };
  }

  const jobMin = job.salaryMin ?? 0;
  const jobMax = job.salaryMax ?? jobMin;
  const userMin = user.expectedSalaryMin;
  const flexPercent = config.thresholds.salaryFlexPercent;

  // Job pays at or above expected
  if (jobMax >= userMin) {
    if (jobMin >= userMin) {
      return { score: 100, reason: `Job salary ${jobMin}-${jobMax} LPA meets/exceeds expected ${userMin} LPA` };
    }
    return { score: 90, reason: `Job range ${jobMin}-${jobMax} LPA overlaps with expected ${userMin} LPA` };
  }

  // Slightly below (within flex)
  const flexAmount = userMin * flexPercent;
  if (jobMax >= userMin - flexAmount) {
    return { score: 70, reason: `Job salary ${jobMax} LPA is slightly below expected ${userMin} LPA (within ${Math.round(flexPercent * 100)}% flex)` };
  }

  // Significantly below
  const deficit = Math.round(((userMin - jobMax) / userMin) * 100);
  if (deficit <= 30) {
    return { score: 50, reason: `Job salary ${jobMax} LPA is ${deficit}% below expected ${userMin} LPA` };
  }

  return { score: 30, reason: `Job salary ${jobMax} LPA is ${deficit}% below expected ${userMin} LPA (significant gap)` };
}

// ============================================
// STRATEGY 5: Recency
// ============================================

export function scoreRecency(job: JobFeatures, config: ScoringConfig): DimensionScore {
  if (!job.postedDate) {
    return { score: 50, reason: 'Posted date unknown (neutral)' };
  }

  const now = new Date();
  const posted = new Date(job.postedDate);
  const daysDiff = Math.floor((now.getTime() - posted.getTime()) / (1000 * 60 * 60 * 24));

  const tiers = config.recencyTiers;

  if (daysDiff <= tiers.fresh.maxDays) {
    return { score: tiers.fresh.score, reason: `Posted ${daysDiff} day(s) ago (fresh)` };
  }
  if (daysDiff <= tiers.recent.maxDays) {
    return { score: tiers.recent.score, reason: `Posted ${daysDiff} days ago (recent)` };
  }
  if (daysDiff <= tiers.moderate.maxDays) {
    return { score: tiers.moderate.score, reason: `Posted ${daysDiff} days ago (moderate)` };
  }
  return { score: tiers.stale.score, reason: `Posted ${daysDiff} days ago (stale)` };
}

// ============================================
// Utility
// ============================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
