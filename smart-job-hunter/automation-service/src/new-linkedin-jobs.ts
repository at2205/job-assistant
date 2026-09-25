/**
 * Compare a LinkedIn scrape result file against the DB and print ONLY new jobs
 * (those whose external_job_id is not already stored for source_platform='linkedin').
 *
 * Usage: npx tsx src/new-linkedin-jobs.ts [results/linkedin-jobs-XXXX.json]
 *        (defaults to the latest linkedin-jobs-*.json)
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { query, closePool } from './db/postgres-client';

function latestLinkedInFile(): string {
  const dir = path.resolve(process.cwd(), 'results');
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith('linkedin-jobs-') && f.endsWith('.json'))
    .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return path.join(dir, files[0].f);
}

function linkedinId(url: string): string {
  const m = url.match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : url;
}

async function main() {
  const arg = process.argv[2];
  const file = arg ? (path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg)) : latestLinkedInFile();
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const jobs: any[] = data.jobs || [];
  console.log(`Scrape file:      ${path.basename(file)}`);
  console.log(`Jobs in file:     ${jobs.length}`);

  // Existing linkedin external ids in DB.
  const existing = await query<{ external_job_id: string }>(
    `SELECT external_job_id FROM jobs WHERE source_platform = 'linkedin'`
  );
  const seen = new Set(existing.rows.map(r => r.external_job_id));
  console.log(`In DB (linkedin): ${seen.size}`);

  const newJobs = jobs.filter(j => j.url && !seen.has(linkedinId(j.url)));
  const easy = newJobs.filter(j => j.easyApply);
  const ext = newJobs.filter(j => !j.easyApply);

  console.log(`\n===== NEW JOBS (not in DB): ${newJobs.length} =====`);
  console.log(`  Easy Apply: ${easy.length} | External: ${ext.length}\n`);

  let i = 0;
  for (const j of [...easy, ...ext]) {
    i++;
    const tag = j.easyApply ? 'EasyApply' : 'External';
    console.log(`${i}\t${tag}\t${j.title} @ ${j.company} | ${j.location}\t${j.url}`);
  }

  // Save a clean file of only the new jobs.
  const outFile = path.resolve(process.cwd(), 'results', 'new-linkedin-jobs.txt');
  const lines = [...easy, ...ext].map((j, idx) =>
    `${idx + 1}\t${j.easyApply ? 'EasyApply' : 'External'}\t${j.title} @ ${j.company} | ${j.location}\t${j.url}`);
  fs.writeFileSync(outFile, lines.join('\n'), 'utf-8');
  console.log(`\nSaved new-only list: results/new-linkedin-jobs.txt (${newJobs.length} jobs)`);

  await closePool();
}
main().catch(async e => { console.error(e.message); await closePool().catch(() => {}); process.exit(1); });
