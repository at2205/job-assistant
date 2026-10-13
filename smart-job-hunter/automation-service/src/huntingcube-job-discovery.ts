/**
 * HuntingCube (https://huntingcube.ai) job discovery.
 *
 * HuntingCube exposes a PUBLIC search API (no auth) that backs its job board:
 *   POST /api/jobs/search/marketing
 *   body: { filters:{ jobStatuses:[...] }, page, pageSize, sortFields:[{createdAt:'desc'}], searchAfter }
 * Each result._source carries FULL structured data: jobTitle, clientName (company),
 * jobLocations, jobType, workMode, jobDescription (full text), primarySkills,
 * secondarySkills, yearsOfExperienceMin/Max, budgetMin/Max, jobId, createdAt.
 *
 * We paginate newest-first, keep only tech role-title matches, and write
 * results/huntingcube-jobs-<ts>.json in the shape the ingest + premium filter expect.
 *
 * Env:
 *   HUNTINGCUBE_QUICK=true       3 pages only (fast smoke run)
 *   HUNTINGCUBE_MAX_PAGES=N      pages to pull (default 15, quick=3)
 *   HUNTINGCUBE_PAGE_SIZE=N      results per page (default 100)
 *   HUNTINGCUBE_ALL=true         keep ALL jobs (skip the tech-role title filter)
 *
 * Usage: npx tsx src/huntingcube-job-discovery.ts
 */
import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const ENDPOINT = 'https://huntingcube.ai/api/jobs/search/marketing';

// Desired tech roles (title match). Backend / full-stack / SDE family.
const ROLE_PATTERNS: RegExp[] = [
  /\bjava\b/i, /\bspring\b/i, /\bbackend\b/i, /\bback[\s-]?end\b/i,
  /\bfull[\s-]?stack\b/i, /\bsoftware\s+develop/i, /\bsoftware\s+engineer/i,
  /\bsde\b/i, /\bnode(\.js)?\b/i, /\breact\b/i, /\bmicroservice/i,
  /\bapi\s+develop/i, /\bjavascript\b/i, /\btypescript\b/i, /\bengineer\b/i,
  /\bdeveloper\b/i, /\bprogrammer\b/i, /\bmern\b/i,
];
// Reject obvious non-engineering titles.
const TITLE_BLOCK: RegExp[] = [
  /\bsales\b/i, /\bmarketing\b/i, /\bbusiness\s+develop/i, /\bhr\b/i, /\brecruit/i,
  /\bfinance\b/i, /\baccount/i, /\bcivil\b/i, /\bmechanical\b/i, /\belectrical\b/i,
  /\boperations\s+engineer\b/i, /\bproduct\s+manager\b/i, /\bdesigner\b/i,
];

interface HCJob {
  title: string;
  company: string;
  location: string;
  url: string;
  salary: string;
  posted: string;
  description: string;
  skills: string[];
  experience: string;
  workMode: string;
  jobId: string;
}

function titleMatchesRole(title: string): boolean {
  if (TITLE_BLOCK.some(re => re.test(title))) return false;
  return ROLE_PATTERNS.some(re => re.test(title));
}

/** budgetMin/Max are absolute annual INR; format as "₹XL - ₹YL pa" (lakhs). */
function fmtSalary(min?: number, max?: number): string {
  const toL = (v?: number) => (typeof v === 'number' && v > 0 ? `₹${Math.round(v / 100000)}L` : '');
  const a = toL(min), b = toL(max);
  if (!a && !b) return '';
  if (a && b) return `${a} - ${b} pa`;
  return `${a || b} pa`;
}

function fmtLocation(locs: any[]): string {
  if (!Array.isArray(locs) || !locs.length) return '';
  const l = locs[0] || {};
  const parts = [l.city, l.country].filter(Boolean);
  // De-dup "HSR Layout, Bangalore" style repeated city/state.
  return [...new Set(String(parts.join(', ')).split(', '))].join(', ');
}

function relTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  if (isNaN(d)) return '';
  const days = Math.floor((Date.now() - d) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function mapSource(src: any): HCJob {
  const skills = [...new Set([...(src.primarySkills || []), ...(src.secondarySkills || [])]
    .map((s: any) => String(s).trim()).filter(Boolean))];
  const expMin = src.yearsOfExperienceMin;
  const expMax = src.yearsOfExperienceMax;
  const experience = (expMin != null && expMax != null) ? `${expMin}-${expMax} Yrs`
    : (expMin != null ? `${expMin}+ Yrs` : '');
  return {
    title: (src.jobTitle || '').trim(),
    company: (src.clientName || '').trim(),
    location: fmtLocation(src.jobLocations),
    url: `https://huntingcube.ai/browse/job-apply?jobId=${src.jobId}`,
    salary: fmtSalary(src.budgetMin, src.budgetMax),
    posted: relTime(src.createdAt),
    description: (src.jobDescription || '').trim(),
    skills,
    experience,
    workMode: src.workMode || '',
    jobId: String(src.jobId || ''),
  };
}

async function main() {
  console.log('============================================================');
  console.log('  HUNTINGCUBE JOB DISCOVERY ENGINE (public API)');
  console.log('============================================================\n');

  const QUICK = /^(1|true|yes)$/i.test(process.env.HUNTINGCUBE_QUICK || '');
  const KEEP_ALL = /^(1|true|yes)$/i.test(process.env.HUNTINGCUBE_ALL || '');
  const MAX_PAGES = process.env.HUNTINGCUBE_MAX_PAGES
    ? parseInt(process.env.HUNTINGCUBE_MAX_PAGES, 10) : (QUICK ? 3 : 15);
  const PAGE_SIZE = process.env.HUNTINGCUBE_PAGE_SIZE
    ? parseInt(process.env.HUNTINGCUBE_PAGE_SIZE, 10) : 100;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  // Load the listing page once to establish origin/cookies for the API call.
  await page.goto('https://huntingcube.ai/browse/job-listing', { waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(3000);

  const allJobs: HCJob[] = [];
  const seen = new Set<string>();
  let totalHits: number | null = null;
  let scanned = 0;
  let searchAfter: any = null;

  try {
    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const body = {
        filters: { jobStatuses: ['active', 'on_hold', 'closed'] },
        page: pageNum,
        pageSize: PAGE_SIZE,
        sortFields: [{ createdAt: 'desc' }],
        searchAfter,
      };

      let data: any;
      try {
        const res = await page.request.post(ENDPOINT, {
          data: body,
          headers: {
            'content-type': 'application/json',
            'accept': 'application/json, text/plain, */*',
            'referer': 'https://huntingcube.ai/browse/job-listing',
          },
          timeout: 30000,
        });
        if (!res.ok()) { console.log(`  page ${pageNum}: HTTP ${res.status()} — stopping`); break; }
        data = await res.json();
      } catch (e: any) {
        console.log(`  page ${pageNum}: request failed (${e.message}) — stopping`);
        break;
      }

      const results: any[] = data.results || data.hits?.hits || [];
      if (totalHits == null) {
        totalHits = data.pagination?.total ?? data.total ?? data.hits?.total?.value ?? null;
      }
      if (!results.length) { console.log(`  page ${pageNum}: 0 results — end reached`); break; }

      // Advance the cursor to the last result's sort values (ES search_after).
      const lastSort = results[results.length - 1]?.sort;
      if (Array.isArray(lastSort)) searchAfter = lastSort;

      let added = 0;
      for (const r of results) {
        scanned++;
        const src = r._source || r;
        if (!src || !src.jobId) continue;
        const job = mapSource(src);
        if (seen.has(job.jobId)) continue;
        if (!KEEP_ALL && !titleMatchesRole(job.title)) continue;
        seen.add(job.jobId);
        allJobs.push(job);
        added++;
      }
      console.log(`  page ${pageNum}: ${results.length} results, +${added} role-matched (total ${allJobs.length})`);
      if (!searchAfter) { console.log('  no cursor — stopping'); break; }
      await sleep(600 + Math.random() * 600);
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  console.log(`\n============================================================`);
  console.log(`  Scanned ${scanned} jobs${totalHits ? ` (of ~${totalHits} total on board)` : ''}`);
  console.log(`  KEPT ${allJobs.length} ${KEEP_ALL ? 'jobs' : 'tech role-matched jobs'}`);
  console.log(`============================================================\n`);

  allJobs.slice(0, 25).forEach((j, i) => {
    console.log(`${i + 1}. ${j.title} @ ${j.company || 'N/A'}`);
    console.log(`   📍 ${j.location || 'N/A'}${j.salary ? ` | 💰 ${j.salary}` : ''}${j.experience ? ` | ${j.experience}` : ''}`);
    console.log(`   ${j.url}\n`);
  });

  const resultsDir = path.resolve(process.cwd(), 'results');
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
  const filename = `huntingcube-jobs-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(resultsDir, filename),
    JSON.stringify({ timestamp: new Date().toISOString(), total: allJobs.length, jobs: allJobs }, null, 2)
  );
  console.log(`💾 Saved to results/${filename}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
