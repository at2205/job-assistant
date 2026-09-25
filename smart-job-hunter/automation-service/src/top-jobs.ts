import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { query, closePool } from './db/postgres-client';

async function main() {
  const res = await query(
    `SELECT title, company_name, location, experience_min, experience_max, job_url,
            (raw_data->>'atsScore')::int AS ats,
            (raw_data->>'interviewProbability')::int AS interview
     FROM jobs
     WHERE source_platform = 'naukri'
       AND raw_data->>'priority' = 'HIGH'
     ORDER BY (raw_data->>'atsScore')::int DESC NULLS LAST,
              (raw_data->>'interviewProbability')::int DESC NULLS LAST
     LIMIT 20`
  );
  for (let i = 0; i < res.rows.length; i++) {
    const j = res.rows[i];
    const exp = (j.experience_min != null && j.experience_max != null) ? `${j.experience_min}-${j.experience_max} yrs` : '';
    console.log(`${i + 1}\t${j.ats ?? ''}\t${j.interview ?? ''}\t${j.title}\t${j.company_name}\t${j.location}\t${exp}\t${j.job_url}`);
  }
  await closePool();
}
main().catch(async e => { console.error(e.message); await closePool().catch(() => {}); process.exit(1); });
