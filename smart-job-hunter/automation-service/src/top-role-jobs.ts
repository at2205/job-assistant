import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { query, closePool } from './db/postgres-client';

async function main() {
  const roleFilter = `(
       title ILIKE '%java%' OR title ILIKE '%spring%' OR title ILIKE '%backend%'
    OR title ILIKE '%back end%' OR title ILIKE '%full stack%' OR title ILIKE '%fullstack%'
    OR title ILIKE '%software develop%' OR title ILIKE '%software engineer%'
    OR title ILIKE '%sde%' OR title ILIKE '%node%' OR title ILIKE '%react%'
    OR title ILIKE '%microservice%' OR title ILIKE '%api develop%' OR title ILIKE '%javascript%'
  )`;

  // Best-fit: entry level (max experience <= 4 yrs OR unknown), ranked by ATS.
  const res = await query(
    `SELECT DISTINCT ON (job_url)
            source_platform, title, company_name, location, job_url,
            experience_min, experience_max,
            (raw_data->>'priority') AS priority,
            (raw_data->>'atsScore') AS ats,
            (raw_data->>'easyApply') AS easy
     FROM jobs
     WHERE ${roleFilter}
       AND (experience_max IS NULL OR experience_max <= 4)
     ORDER BY job_url, (raw_data->>'atsScore')::int DESC NULLS LAST`
  );

  const rows = res.rows.sort((a: any, b: any) => (parseInt(b.ats) || 0) - (parseInt(a.ats) || 0));
  console.log(`ENTRY-LEVEL (<=4 yrs) role-matched unique jobs: ${rows.length}\n`);
  rows.slice(0, 40).forEach((j: any, i: number) => {
    const exp = (j.experience_min != null && j.experience_max != null) ? `${j.experience_min}-${j.experience_max}y` : '';
    const tag = j.source_platform === 'naukri'
      ? `naukri${j.ats ? ' ATS' + j.ats : ''}`
      : `linkedin${j.easy === 'true' ? '/EasyApply' : ''}`;
    console.log(`${i + 1}\t[${tag}]\t${j.title} @ ${j.company_name} | ${j.location} ${exp}\t${j.job_url}`);
  });
  await closePool();
}
main().catch(async e => { console.error(e.message); await closePool().catch(() => {}); process.exit(1); });
