import dotenv from "dotenv"; import path from "path"; import fs from "fs";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import { query, closePool } from "./db/postgres-client";
(async () => {
  const platform = process.env.LISTP || "indeed";
  const res = await query(
    `SELECT title, company_name, location, salary_min, salary_max, job_type, job_url
     FROM jobs WHERE source_platform = $1
     ORDER BY (job_type='remote') ASC, company_name ASC`, [platform]);
  const rows = res.rows as any[];
  const lines = rows.map((r, i) => {
    const sal = r.salary_min ? `${r.salary_min}-${r.salary_max} LPA` : "N/A";
    return `${i+1}\t${r.title}\t${r.company_name}\t${r.location||"N/A"}\t${sal}\t${r.job_url}`;
  });
  const header = "#\tTitle\tCompany\tLocation\tSalary\tURL";
  const out = path.resolve(process.cwd(), "results", `db-${platform}-apply-list.txt`);
  fs.writeFileSync(out, [header, ...lines].join("\n"), "utf-8");
  console.log(`Total ${platform} jobs in DB: ${rows.length}`);
  console.log(`Saved: results/db-${platform}-apply-list.txt`);
  await closePool();
})().catch(async e => { console.error(e.message); await closePool().catch(()=>{}); process.exit(1); });
