import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { query, closePool } from './db/postgres-client';

async function main() {
  const total = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM jobs');
  console.log('Total jobs:', total.rows[0].count);

  const byPlat = await query<{ source_platform: string; count: string }>(
    'SELECT source_platform, COUNT(*)::text AS count FROM jobs GROUP BY source_platform ORDER BY 1'
  );
  console.table(byPlat.rows);

  const sample = await query(
    `SELECT source_platform, title, company_name, location, experience_min, experience_max, external_job_id
     FROM jobs ORDER BY scraped_at DESC LIMIT 8`
  );
  console.table(sample.rows);

  await closePool();
}
main().catch(async e => { console.error(e.message); await closePool().catch(()=>{}); process.exit(1); });
