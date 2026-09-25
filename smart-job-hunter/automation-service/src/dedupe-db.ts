import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { query, closePool } from './db/postgres-client';

async function main() {
  // Remove duplicate job_url rows, keeping the most recently scraped one.
  const before = await query<{ c: string }>('SELECT COUNT(*)::text c FROM jobs');
  const dup = await query<{ c: string }>(
    `SELECT COUNT(*)::text c FROM (
       SELECT job_url FROM jobs GROUP BY job_url HAVING COUNT(*) > 1
     ) t`
  );
  console.log(`Rows before: ${before.rows[0].c} | duplicate URLs: ${dup.rows[0].c}`);

  const del = await query(
    `DELETE FROM jobs a
     USING jobs b
     WHERE a.job_url = b.job_url
       AND a.ctid < b.ctid`
  );
  console.log(`Deleted duplicate rows: ${del.rowCount}`);

  const after = await query<{ c: string }>('SELECT COUNT(*)::text c FROM jobs');
  const distinct = await query<{ c: string }>('SELECT COUNT(DISTINCT job_url)::text c FROM jobs');
  console.log(`Rows after: ${after.rows[0].c} | distinct job_url: ${distinct.rows[0].c}`);

  await closePool();
}
main().catch(async e => { console.error(e.message); await closePool().catch(() => {}); process.exit(1); });
