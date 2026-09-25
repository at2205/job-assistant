import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import { query, closePool } from './db/postgres-client';

async function main() {
  // Roles relevant to the user's profile (Java / backend / full-stack / JS / React / SDE).
  const roleFilter = `(
       title ILIKE '%java%'
    OR title ILIKE '%spring%'
    OR title ILIKE '%backend%'
    OR title ILIKE '%back end%'
    OR title ILIKE '%full stack%'
    OR title ILIKE '%fullstack%'
    OR title ILIKE '%software develop%'
    OR title ILIKE '%software engineer%'
    OR title ILIKE '%sde%'
    OR title ILIKE '%node%'
    OR title ILIKE '%react%'
    OR title ILIKE '%microservice%'
    OR title ILIKE '%api develop%'
    OR title ILIKE '%javascript%'
  )`;

  // ── Uniqueness verification ───────────────────────────────
  const totalRows = await query<{ c: string }>(`SELECT COUNT(*)::text c FROM jobs WHERE ${roleFilter}`);
  const distinctUrls = await query<{ c: string }>(`SELECT COUNT(DISTINCT job_url)::text c FROM jobs WHERE ${roleFilter}`);
  const distinctKey = await query<{ c: string }>(
    `SELECT COUNT(*)::text c FROM (SELECT DISTINCT external_job_id, source_platform FROM jobs WHERE ${roleFilter}) t`
  );
  const dupUrls = await query<{ job_url: string; c: string }>(
    `SELECT job_url, COUNT(*)::text c FROM jobs WHERE ${roleFilter} GROUP BY job_url HAVING COUNT(*) > 1`
  );

  console.log('===== UNIQUENESS CHECK (role-matched jobs) =====');
  console.log(`Total role-matched rows:      ${totalRows.rows[0].c}`);
  console.log(`Distinct job_url:             ${distinctUrls.rows[0].c}`);
  console.log(`Distinct (external_id+source):${distinctKey.rows[0].c}`);
  console.log(`Duplicate URLs found:         ${dupUrls.rows.length}`);
  console.log('');

  // ── Pull unique jobs (one row per job_url), ranked ────────
  const res = await query(
    `SELECT DISTINCT ON (job_url)
            source_platform, title, company_name, location, job_url,
            (raw_data->>'priority')      AS priority,
            (raw_data->>'atsScore')      AS ats,
            (raw_data->>'easyApply')     AS easy
     FROM jobs
     WHERE ${roleFilter}
     ORDER BY job_url,
              (raw_data->>'atsScore')::int DESC NULLS LAST`
  );

  // Sort for display: Naukri HIGH/ATS first, then rest; LinkedIn grouped after.
  const rows = res.rows.sort((a: any, b: any) => {
    const pa = a.source_platform === 'naukri' ? 0 : 1;
    const pb = b.source_platform === 'naukri' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return (parseInt(b.ats) || 0) - (parseInt(a.ats) || 0);
  });

  console.log(`===== ${rows.length} UNIQUE ROLE-MATCHED JOBS =====`);
  rows.forEach((j: any, i: number) => {
    const tag = j.source_platform === 'naukri'
      ? `[naukri${j.ats ? ' ATS' + j.ats : ''}${j.priority ? '/' + j.priority : ''}]`
      : `[linkedin${j.easy === 'true' ? '/EasyApply' : ''}]`;
    console.log(`${i + 1}\t${tag}\t${j.title} @ ${j.company_name} | ${j.location}\t${j.job_url}`);
  });

  // ── Clean file outputs (one job per line) ────────────────
  const outDir = path.resolve(process.cwd(), 'results');
  const mdLines: string[] = [
    `# Role-matched jobs (unique) — ${rows.length} total`,
    `Generated ${new Date().toISOString()}`,
    '',
  ];
  const csvLines: string[] = ['num,platform,priority,ats,easyApply,title,company,location,url'];
  rows.forEach((j: any, i: number) => {
    const csvSafe = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    mdLines.push(`${i + 1}. [${j.source_platform}] ${j.title} @ ${j.company_name} — ${j.location}\n   ${j.job_url}`);
    csvLines.push([
      i + 1, j.source_platform, j.priority ?? '', j.ats ?? '', j.easy ?? '',
      csvSafe(j.title), csvSafe(j.company_name), csvSafe(j.location), j.job_url,
    ].join(','));
  });
  fs.writeFileSync(path.join(outDir, 'role-matched-jobs.md'), mdLines.join('\n'), 'utf-8');
  fs.writeFileSync(path.join(outDir, 'role-matched-jobs.csv'), csvLines.join('\n'), 'utf-8');
  console.log(`\nSaved: results/role-matched-jobs.md and results/role-matched-jobs.csv`);

  await closePool();
}
main().catch(async e => { console.error(e.message); await closePool().catch(() => {}); process.exit(1); });
