/**
 * Compare a Naukri scrape result file against the DB and print ONLY new jobs
 * (external_job_id not already stored for source_platform='naukri').
 *
 * Usage: npx tsx src/new-naukri-jobs.ts [results/naukri-job-discovery-XXXX.json]
 *        (defaults to the latest naukri-job-discovery-*.json)
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { query, closePool } from './db/postgres-client';

function latestNaukriFile(): string {
  const dir = path.resolve(process.cwd(), 'results');
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith('naukri-job-discovery-') && f.endsWith('.json'))
    .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return path.join(dir, files[0].f);
}

function naukriId(url: string): string {
  const m = url.match(/-(\d+)\/?$/);
  return m ? m[1] : url;
}

async function main() {
  const arg = process.argv[2];
  const file = arg ? (path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg)) : latestNaukriFile();
  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const jobs: any[] = data.allJobs || data.jobs || [];
  console.log(`Scrape file:    ${path.basename(file)}`);
  console.log(`Jobs in file:   ${jobs.length}`);

  const existing = await query<{ external_job_id: string }>(
    `SELECT external_job_id FROM jobs WHERE source_platform = 'naukri'`
  );
  const seen = new Set(existing.rows.map(r => r.external_job_id));
  console.log(`In DB (naukri): ${seen.size}`);

  // Dedupe within the file too (by external id), keeping the first occurrence.
  const fileSeen = new Set<string>();
  const newJobs = jobs.filter(j => {
    if (!j.url || !j.title) return false;
    const id = naukriId(j.url);
    if (seen.has(id) || fileSeen.has(id)) return false;
    fileSeen.add(id);
    return true;
  });

  // Rank by ATS score (Naukri jobs carry atsScore/priority).
  newJobs.sort((a, b) => (b.atsScore || 0) - (a.atsScore || 0));

  console.log(`\n===== NEW JOBS (not in DB): ${newJobs.length} =====\n`);
  newJobs.forEach((j, i) => {
    const ats = j.atsScore != null ? `ATS${j.atsScore}` : '';
    const pr = j.priority ? '/' + j.priority : '';
    console.log(`${i + 1}\t[${ats}${pr}]\t${j.title} @ ${j.company} | ${j.location} | ${j.experience || ''}\t${j.url}`);
  });

  const outFile = path.resolve(process.cwd(), 'results', 'new-naukri-jobs.txt');
  const lines = newJobs.map((j, idx) =>
    `${idx + 1}\t${j.atsScore != null ? 'ATS' + j.atsScore : ''}${j.priority ? '/' + j.priority : ''}\t${j.title} @ ${j.company} | ${j.location} | ${j.experience || ''}\t${j.url}`);
  fs.writeFileSync(outFile, lines.join('\n'), 'utf-8');
  console.log(`\nSaved new-only list: results/new-naukri-jobs.txt (${newJobs.length} jobs)`);

  await closePool();
}
main().catch(async e => { console.error(e.message); await closePool().catch(() => {}); process.exit(1); });
