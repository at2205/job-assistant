/**
 * Premium-company job shortlister.
 *
 * Reads the latest discovery JSON from each board (Naukri, Indeed, LinkedIn,
 * Himalayas), normalizes them, keeps only jobs whose TITLE matches the desired
 * roles AND whose company is premium (curated list or rating>=3.8, excluding
 * staffing firms), then writes a ranked shortlist.
 *
 * Usage (from automation-service/):
 *   npx tsx src/filter-premium-jobs.ts
 *   npx tsx src/filter-premium-jobs.ts --files a.json b.json   # explicit files
 *
 * Output: results/premium-jobs.json | .md | .csv
 */
import path from 'path';
import fs from 'fs';
import { classifyCompany } from './config/premium-companies';

const RESULTS_DIR = path.resolve(process.cwd(), 'results');

// Desired roles (match on job title). Backend / full-stack / SDE family.
const ROLE_PATTERNS: RegExp[] = [
  /\bjava\b/i, /\bspring\b/i, /\bbackend\b/i, /\bback[\s-]?end\b/i,
  /\bfull[\s-]?stack\b/i, /\bsoftware\s+develop/i, /\bsoftware\s+engineer/i,
  /\bsde\b/i, /\bnode(\.js)?\b/i, /\breact\b/i, /\bmicroservice/i,
  /\bapi\s+develop/i, /\bjavascript\b/i, /\bengineer\b/i, /\bdeveloper\b/i,
];

// Reject obvious non-engineering titles even if they contain "engineer"/"developer".
const TITLE_BLOCK: RegExp[] = [
  /\bsales\b/i, /\bmarketing\b/i, /\bbusiness\s+develop/i, /\bhr\b/i,
  /\brecruit/i, /\bsupport\s+engineer\b/i, /\bnetwork\s+engineer\b/i,
  /\bcivil\b/i, /\bmechanical\b/i, /\belectrical\b/i, /\bqa\b/i, /\btest\s+engineer\b/i,
  /\bdevops\b/i, /\bsite\s+reliability\b/i, /\bdata\s+engineer\b/i, /\bml\s+engineer\b/i,
];

interface NormJob {
  platform: string;
  title: string;
  company: string;
  location: string;
  url: string;
  salary: string;
  posted: string;
  rating: number | null;
  atsScore: number | null;
  priority: string | null;
  easyApply: boolean | null;
  matchedKeywords: string[];
  missingKeywords: string[];
}

function latestFile(prefix: string): string | null {
  if (!fs.existsSync(RESULTS_DIR)) return null;
  const files = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
    .map(f => ({ f, t: fs.statSync(path.join(RESULTS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files.length ? path.join(RESULTS_DIR, files[0].f) : null;
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function platformOf(file: string): string {
  const b = path.basename(file);
  if (b.startsWith('linkedin')) return 'linkedin';
  if (b.startsWith('indeed')) return 'indeed';
  if (b.startsWith('himalayas')) return 'himalayas';
  if (b.startsWith('huntingcube')) return 'huntingcube';
  return 'naukri';
}

function normalize(file: string): NormJob[] {
  const data = readJson(file);
  const platform = platformOf(file);
  const arr: any[] = data.allJobs || data.jobs || data.top20 || (Array.isArray(data) ? data : []);
  return arr.map((j: any) => ({
    platform,
    title: (j.title || '').trim(),
    company: (j.company || j.company_name || '').trim(),
    location: (j.location || '').trim(),
    url: (j.url || j.job_url || '').trim(),
    salary: (j.salary || '').trim(),
    posted: (j.posted || j.experience || '').trim(),
    rating: typeof j.companyRating === 'number' ? j.companyRating
      : (typeof j.rating === 'number' ? j.rating : null),
    atsScore: typeof j.atsScore === 'number' ? j.atsScore : null,
    priority: j.priority || null,
    easyApply: typeof j.easyApply === 'boolean' ? j.easyApply : null,
    matchedKeywords: j.matchedKeywords || [],
    missingKeywords: j.missingKeywords || [],
  })).filter(j => j.url && j.title);
}

function titleMatchesRole(title: string): boolean {
  if (TITLE_BLOCK.some(re => re.test(title))) return false;
  return ROLE_PATTERNS.some(re => re.test(title));
}

function main() {
  const args = process.argv.slice(2);
  let files: string[] = [];
  const fi = args.indexOf('--files');
  if (fi !== -1) {
    files = args.slice(fi + 1).map(f => (path.isAbsolute(f) ? f : path.resolve(process.cwd(), f)));
  } else {
    for (const p of ['naukri-job-discovery-', 'indeed-jobs-', 'linkedin-jobs-', 'himalayas-jobs-', 'huntingcube-jobs-']) {
      const f = latestFile(p);
      if (f) files.push(f);
    }
  }

  if (!files.length) {
    console.error('No discovery files found. Run the scrapers first.');
    process.exit(1);
  }

  console.log('Reading boards:');
  const all: NormJob[] = [];
  for (const f of files) {
    const jobs = normalize(f);
    console.log(`  ${path.basename(f)} -> ${jobs.length} jobs`);
    all.push(...jobs);
  }

  // Dedupe by url.
  const byUrl = new Map<string, NormJob>();
  for (const j of all) if (!byUrl.has(j.url)) byUrl.set(j.url, j);
  const unique = [...byUrl.values()];

  // Filter: role match + premium company.
  const premium = unique
    .map(j => ({ job: j, cls: classifyCompany(j.company, j.rating) }))
    .filter(x => titleMatchesRole(x.job.title) && x.cls.isPremium);

  // Rank: curated-name matches first, then ATS score, then platform priority.
  premium.sort((a, b) => {
    const ra = a.cls.reason === 'curated' ? 0 : 1;
    const rb = b.cls.reason === 'curated' ? 0 : 1;
    if (ra !== rb) return ra - rb;
    const pa = a.job.priority === 'HIGH' ? 0 : 1;
    const pb = b.job.priority === 'HIGH' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return (b.job.atsScore || 0) - (a.job.atsScore || 0);
  });

  console.log(`\nScanned ${unique.length} unique jobs -> ${premium.length} premium-company role matches.`);

  // Group summary by company.
  const byCompany = new Map<string, number>();
  for (const p of premium) byCompany.set(p.job.company, (byCompany.get(p.job.company) || 0) + 1);
  const companies = [...byCompany.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`Premium companies found: ${companies.length}`);
  companies.slice(0, 25).forEach(([c, n]) => console.log(`  ${c} (${n})`));

  // Outputs.
  const jsonOut = {
    generated: new Date().toISOString(),
    sources: files.map(f => path.basename(f)),
    totalScanned: unique.length,
    totalPremium: premium.length,
    companies: companies.map(([name, count]) => ({ name, count })),
    jobs: premium.map(p => ({
      platform: p.job.platform, title: p.job.title, company: p.job.company,
      location: p.job.location, salary: p.job.salary, url: p.job.url,
      atsScore: p.job.atsScore, priority: p.job.priority, easyApply: p.job.easyApply,
      matchReason: p.cls.reason, matchedName: p.cls.matchedName || null,
    })),
  };
  fs.writeFileSync(path.join(RESULTS_DIR, 'premium-jobs.json'), JSON.stringify(jsonOut, null, 2), 'utf-8');

  const md: string[] = [
    `# Premium-company job shortlist — ${premium.length} roles`,
    `Generated ${jsonOut.generated}`,
    `Sources: ${jsonOut.sources.join(', ')}`,
    '',
  ];
  premium.forEach((p, i) => {
    md.push(`${i + 1}. [${p.job.platform}] **${p.job.title}** @ ${p.job.company} — ${p.job.location || 'N/A'}`
      + `${p.job.salary ? ' | ' + p.job.salary : ''}${p.job.atsScore ? ' | ATS ' + p.job.atsScore : ''}`
      + `\n   ${p.job.url}`);
  });
  fs.writeFileSync(path.join(RESULTS_DIR, 'premium-jobs.md'), md.join('\n'), 'utf-8');

  const csvSafe = (s: any) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const csv: string[] = ['num,platform,company,title,location,salary,ats,priority,easyApply,matchReason,url'];
  premium.forEach((p, i) => {
    csv.push([
      i + 1, p.job.platform, csvSafe(p.job.company), csvSafe(p.job.title),
      csvSafe(p.job.location), csvSafe(p.job.salary), p.job.atsScore ?? '',
      p.job.priority ?? '', p.job.easyApply ?? '', p.cls.reason, p.job.url,
    ].join(','));
  });
  fs.writeFileSync(path.join(RESULTS_DIR, 'premium-jobs.csv'), csv.join('\n'), 'utf-8');

  console.log(`\nSaved: results/premium-jobs.json | .md | .csv`);
}

main();
