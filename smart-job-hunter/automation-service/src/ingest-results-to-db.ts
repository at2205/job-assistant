/**
 * Ingest scraped job results (Naukri + LinkedIn + Himalayas + Indeed) into PostgreSQL.
 *
 * - Reads the LATEST naukri-job-discovery-*.json and linkedin-jobs-*.json
 *   from the results/ folder (or a file passed as an arg).
 * - Transforms each job into the `jobs` table schema.
 * - Upserts via JobRepository (dedup on external_job_id + source_platform).
 *
 * Usage:
 *   npx tsx src/ingest-results-to-db.ts            # latest of each platform
 *   npx tsx src/ingest-results-to-db.ts <file.json> [<file2.json> ...]
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { runMigrations, closePool, query } from './db/postgres-client';
import { JobRepository, JobRecord } from './db/job-repository';

const RESULTS_DIR = path.resolve(process.cwd(), 'results');

function latestFile(prefix: string): string | null {
  if (!fs.existsSync(RESULTS_DIR)) return null;
  const files = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
    .map(f => ({ f, t: fs.statSync(path.join(RESULTS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files.length ? path.join(RESULTS_DIR, files[0].f) : null;
}

function parseExperience(exp?: string): { min: number | null; max: number | null } {
  if (!exp) return { min: null, max: null };
  const m = exp.match(/(\d+)\s*-\s*(\d+)/);
  if (m) return { min: parseInt(m[1], 10), max: parseInt(m[2], 10) };
  const single = exp.match(/(\d+)/);
  if (single) return { min: parseInt(single[1], 10), max: parseInt(single[1], 10) };
  return { min: null, max: null };
}

function parseSalary(sal?: string): { min: number | null; max: number | null } {
  if (!sal || /not disclosed/i.test(sal)) return { min: null, max: null };
  // e.g. "25-32.5 Lacs PA", "10-15 Lacs PA"
  const m = sal.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (m) return { min: Math.round(parseFloat(m[1])), max: Math.round(parseFloat(m[2])) };
  return { min: null, max: null };
}

function naukriExternalId(url: string): string {
  const m = url.match(/-(\d+)\/?$/);
  return m ? m[1] : url;
}

function linkedinExternalId(url: string): string {
  const m = url.match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : url;
}

function indeedExternalId(url: string): string {
  // Indeed job key: /viewjob?jk=<hex> (or &jk=<hex>).
  const m = url.match(/[?&]jk=([a-z0-9]+)/i);
  return m ? m[1] : url.split('?')[0];
}

function parseIndeedSalary(sal?: string): { min: number | null; max: number | null } {
  // Indeed India salaries: "\u20b925,000 - \u20b940,000 a month", "\u20b98,00,000 - \u20b912,00,000 a year".
  if (!sal || /not disclosed/i.test(sal)) return { min: null, max: null };
  const nums = sal.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/g);
  if (!nums || nums.length === 0) return { min: null, max: null };
  const vals = nums.map(n => parseFloat(n));
  const per = /month/i.test(sal) ? 12 : 1; // annualize monthly figures
  const toLpa = (v: number) => Math.round((v * per) / 100000); // -> lakhs per annum
  const min = toLpa(vals[0]);
  const max = vals.length > 1 ? toLpa(vals[1]) : min;
  return { min: min || null, max: max || null };
}

function himalayasExternalId(url: string): string {
  // Include the company slug so different companies that reuse a job slug
  // (e.g. "software-engineer") don't collide: "<company>/<slug>".
  const clean = url.split('?')[0].replace(/\/$/, '');
  const m = clean.match(/\/companies\/([^/]+)\/jobs\/([^/]+)$/);
  if (m) return `${m[1]}/${m[2]}`;
  const j = clean.match(/\/jobs\/([^/]+)$/);
  return j ? j[1] : clean;
}

function mapNaukri(file: string): JobRecord[] {
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const jobs: any[] = data.allJobs || data.jobs || [];
  return jobs
    .filter(j => j.url && j.title)
    .map((j): JobRecord => {
      const exp = parseExperience(j.experience);
      const sal = parseSalary(j.salary);
      return {
        external_job_id: naukriExternalId(j.url),
        source_platform: 'naukri',
        title: String(j.title).slice(0, 500),
        company_name: j.company ? String(j.company).slice(0, 500) : null,
        location: j.location ? String(j.location).slice(0, 500) : null,
        experience_min: exp.min,
        experience_max: exp.max,
        salary_min: sal.min,
        salary_max: sal.max,
        salary_currency: 'INR',
        job_description: null,
        job_url: String(j.url).slice(0, 2000),
        skills: Array.isArray(j.matchedKeywords) ? j.matchedKeywords : [],
        company_rating: null,
        job_type: null,
        posted_date: null,
        raw_data: {
          atsScore: j.atsScore ?? null,
          interviewProbability: j.interviewProbability ?? null,
          priority: j.priority ?? null,
          skillMatchPct: j.skillMatchPct ?? null,
          matchedKeywords: j.matchedKeywords ?? [],
          missingKeywords: j.missingKeywords ?? [],
          experienceText: j.experience ?? null,
          salaryText: j.salary ?? null,
        },
      };
    });
}

function mapLinkedIn(file: string): JobRecord[] {
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const jobs: any[] = data.jobs || [];
  return jobs
    .filter(j => j.url && j.title)
    .map((j): JobRecord => ({
      external_job_id: linkedinExternalId(j.url),
      source_platform: 'linkedin',
      title: String(j.title).slice(0, 500),
      company_name: j.company ? String(j.company).slice(0, 500) : null,
      location: j.location ? String(j.location).slice(0, 500) : null,
      experience_min: null,
      experience_max: null,
      salary_min: null,
      salary_max: null,
      salary_currency: 'INR',
      job_description: null,
      job_url: String(j.url).slice(0, 2000),
      skills: [],
      company_rating: null,
      job_type: null,
      posted_date: null,
      raw_data: {
        easyApply: !!j.easyApply,
        posted: j.posted ?? null,
      },
    }));
}

function mapHimalayas(file: string): JobRecord[] {
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const jobs: any[] = data.jobs || [];
  return jobs
    .filter(j => j.url && j.title)
    .map((j): JobRecord => ({
      external_job_id: himalayasExternalId(j.url),
      source_platform: 'himalayas',
      title: String(j.title).slice(0, 500),
      company_name: j.company ? String(j.company).slice(0, 500) : null,
      location: j.location ? String(j.location).slice(0, 500) : null,
      experience_min: null,
      experience_max: null,
      salary_min: null,
      salary_max: null,
      salary_currency: 'USD',
      job_description: null,
      job_url: String(j.url).slice(0, 2000),
      skills: [],
      company_rating: null,
      job_type: 'remote',
      posted_date: null,
      raw_data: {
        remote: j.remote ?? true,
        posted: j.posted ?? null,
        salaryText: j.salary ?? null,
      },
    }));
}

function mapIndeed(file: string): JobRecord[] {
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const jobs: any[] = data.jobs || [];
  return jobs
    .filter(j => j.url && j.title)
    .map((j): JobRecord => {
      const sal = parseIndeedSalary(j.salary);
      const remote = /remote/i.test(j.location || '');
      return {
        external_job_id: indeedExternalId(j.url),
        source_platform: 'indeed',
        title: String(j.title).slice(0, 500),
        company_name: j.company ? String(j.company).slice(0, 500) : null,
        location: j.location ? String(j.location).slice(0, 500) : null,
        experience_min: null,
        experience_max: null,
        salary_min: sal.min,
        salary_max: sal.max,
        salary_currency: 'INR',
        job_description: null,
        job_url: String(j.url).slice(0, 2000),
        skills: [],
        company_rating: null,
        job_type: remote ? 'remote' : null,
        posted_date: null,
        raw_data: {
          posted: j.posted ?? null,
          salaryText: j.salary ?? null,
        },
      };
    });
}

async function main() {
  console.log('='.repeat(60));
  console.log('  INGEST SCRAPED JOBS -> PostgreSQL');
  console.log('='.repeat(60));

  const argFiles = process.argv.slice(2);
  const records: JobRecord[] = [];

  if (argFiles.length > 0) {
    for (const f of argFiles) {
      const abs = path.isAbsolute(f) ? f : path.resolve(process.cwd(), f);
      const base = path.basename(abs);
      if (base.startsWith('linkedin')) records.push(...mapLinkedIn(abs));
      else if (base.startsWith('himalayas')) records.push(...mapHimalayas(abs));
      else if (base.startsWith('indeed')) records.push(...mapIndeed(abs));
      else records.push(...mapNaukri(abs));
      console.log(`  Loaded ${base}`);
    }
  } else {
    const naukri = latestFile('naukri-job-discovery-');
    const linkedin = latestFile('linkedin-jobs-');
    if (naukri) {
      const r = mapNaukri(naukri);
      records.push(...r);
      console.log(`  Naukri:   ${path.basename(naukri)} -> ${r.length} jobs`);
    }
    if (linkedin) {
      const r = mapLinkedIn(linkedin);
      records.push(...r);
      console.log(`  LinkedIn: ${path.basename(linkedin)} -> ${r.length} jobs`);
    }
    const himalayas = latestFile('himalayas-jobs-');
    if (himalayas) {
      const r = mapHimalayas(himalayas);
      records.push(...r);
      console.log(`  Himalayas: ${path.basename(himalayas)} -> ${r.length} jobs`);
    }
    const indeed = latestFile('indeed-jobs-');
    if (indeed) {
      const r = mapIndeed(indeed);
      records.push(...r);
      console.log(`  Indeed:   ${path.basename(indeed)} -> ${r.length} jobs`);
    }
  }

  if (records.length === 0) {
    console.error('No jobs found to ingest.');
    process.exit(1);
  }

  console.log(`\n  Total jobs to upsert: ${records.length}`);

  console.log('\n  Ensuring schema (running migrations)...');
  await runMigrations();

  const repo = new JobRepository();
  const result = await repo.upsertJobs(records);

  console.log('\n' + '='.repeat(60));
  console.log('  INGEST RESULT');
  console.log('='.repeat(60));
  console.log(`  Total processed: ${result.total}`);
  console.log(`  Inserted (new):  ${result.inserted}`);
  console.log(`  Updated:         ${result.updated}`);
  console.log(`  Errors:          ${result.errors}`);

  // Summary counts from DB
  const counts = await query<{ source_platform: string; count: string }>(
    `SELECT source_platform, COUNT(*)::text AS count
     FROM jobs GROUP BY source_platform ORDER BY source_platform`
  );
  console.log('\n  Rows in `jobs` table:');
  for (const row of counts.rows) {
    console.log(`    ${row.source_platform}: ${row.count}`);
  }

  await closePool();
  console.log('\n  Done.');
}

main().catch(async (e) => {
  console.error('FATAL:', e.message);
  await closePool().catch(() => {});
  process.exit(1);
});
