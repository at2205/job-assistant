import dotenv from "dotenv"; import path from "path"; import fs from "fs";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import { query, closePool } from "./db/postgres-client";
(async () => {
  const res = await query(
    `SELECT title, company_name, location, source_platform, job_url,
            salary_min, salary_max, raw_data
     FROM jobs
     WHERE (location ILIKE '%noida%' OR location ILIKE '%delhi%' OR location ILIKE '%gurugram%'
            OR location ILIKE '%gurgaon%' OR location ILIKE '%ncr%' OR location ILIKE '%ghaziabad%'
            OR location ILIKE '%faridabad%')
     ORDER BY source_platform, company_name`);
  const rows = res.rows as any[];
  const clean = (s:any)=>String(s||"").replace(/\*\*/g," ").replace(/\s+/g," ").trim();
  const lines = rows.map((r,i)=>`${i+1}\t${clean(r.title)}\t${clean(r.company_name)}\t${clean(r.location)}\t${r.source_platform}\t${r.job_url}`);
  fs.writeFileSync("results/db-ncr-jobs.txt",["#\tTitle\tCompany\tLocation\tPlatform\tURL",...lines].join("\n"),"utf-8");
  const byP:any={}; rows.forEach(r=>byP[r.source_platform]=(byP[r.source_platform]||0)+1);
  console.log("NCR jobs in DB:", rows.length, JSON.stringify(byP));
  await closePool();
})().catch(async e=>{console.error(e.message); await closePool().catch(()=>{}); process.exit(1);});
