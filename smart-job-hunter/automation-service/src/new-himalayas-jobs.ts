/**
 * Compare a Himalayas scrape result file against the DB and print ONLY new jobs
 * (those whose external_job_id is not already stored for source_platform='himalayas').
 *
 * Usage: npx tsx src/new-himalayas-jobs.ts [results/himalayas-jobs-XXXX.json]
 *        (defaults to the latest himalayas-jobs-*.json)
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { query, closePool } from './db/postgres-client';

function latestHimalayasFile(): string {
  const dir = path.resolve(process.cwd(), 'results');
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith('himalayas-jobs-') && f.endsWith('.json'))
    .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return path.join(dir, files[0].f);
}

function himalayasId(url: string): string {
  const clean = url.split('?')[0].replace(/\/$/, '');
  const m = clean.match(/\/companies\/([^/]+)\/jobs\/([^/]+)$/);
  if (m) return `${m[1]}/${m[2]}`;
  const j = clean.match(/\/jobs\/([^/]+)$/);
  return j ? j[1] : clean;
}

async function main() {
  const arg = process.argv[2];
  const file = arg ? (path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg)) : latestHimalayasFile();
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const jobs: any[] = data.jobs || [];
  console.log(`Scrape file:       ${path.basename(file)}`);
  console.log(`Jobs in file:      ${jobs.length}`);

  const existing = await query<{ external_job_id: string }>(
    `SELECT external_job_id FROM jobs WHERE source_platform = 'himalayas'`
  );
  const seen = new Set(existing.rows.map(r => r.external_job_id));
  console.log(`In DB (himalayas): ${seen.size}`);

  const newJobs = jobs.filter(j => j.url && !seen.has(himalayasId(j.url)));

  console.log(`\n===== NEW JOBS (not in DB): ${newJobs.length} =====\n`);

  newJobs.forEach((j, i) => {
    console.log(`${i + 1}\t${j.title} @ ${j.company} | ${j.location || 'Remote'}\t${j.url}`);
  });

  const outFile = path.resolve(process.cwd(), 'results', 'new-himalayas-jobs.txt');
  const lines = newJobs.map((j, idx) =>
    `${idx + 1}\t${j.title} @ ${j.company} | ${j.location || 'Remote'}\t${j.url}`);
  fs.writeFileSync(outFile, lines.join('\n'), 'utf-8');
  console.log(`\nSaved new-only list: results/new-himalayas-jobs.txt (${newJobs.length} jobs)`);

  await closePool();
}
main().catch(async e => { console.error(e.message); await closePool().catch(() => {}); process.exit(1); });
