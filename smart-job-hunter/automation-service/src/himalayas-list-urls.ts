/**
 * List all Himalayas jobs stored in the DB with their apply URLs.
 * Writes results/himalayas-apply-urls.txt and prints to console.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { query, closePool } from './db/postgres-client';

async function main() {
  const res = await query<{
    title: string; company_name: string | null; location: string | null; job_url: string;
  }>(
    `SELECT title, company_name, location, job_url
     FROM jobs
     WHERE source_platform = 'himalayas'
     ORDER BY company_name NULLS LAST, title`
  );

  console.log(`Himalayas jobs in DB: ${res.rows.length}\n`);

  const lines: string[] = [];
  res.rows.forEach((r, i) => {
    const line = `${i + 1}\t${r.title} @ ${r.company_name || '?'} | ${r.location || 'Remote'}\t${r.job_url}`;
    console.log(line);
    lines.push(line);
  });

  const outFile = path.resolve(process.cwd(), 'results', 'himalayas-apply-urls.txt');
  fs.writeFileSync(outFile, lines.join('\n'), 'utf-8');
  console.log(`\nSaved: results/himalayas-apply-urls.txt (${res.rows.length} jobs)`);

  await closePool();
}
main().catch(async e => { console.error(e.message); await closePool().catch(() => {}); process.exit(1); });
