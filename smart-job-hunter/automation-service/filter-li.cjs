const fs=require("fs");
const d=JSON.parse(fs.readFileSync("results/linkedin-checkpoint.json","utf-8"));
const jobs=d.allJobs||[];
const field=/(java|spring|backend|micro ?service|node\.?js|react|full ?stack|api\b|\bsde\b|software (developer|engineer)|javascript|typescript|\bdeveloper\b)/i;
const senior=/(senior|sr\.?\b|lead\b|principal|staff|architect|manager|head\b|director|vp\b)/i;
const junk=/(intern|trainee|fresher|\bqa\b|tester|sales|marketing|\bhr\b|recruit)/i;
const seen=new Set(); const out=[];
for(const j of jobs){const t=j.title||"";if(!field.test(t)||senior.test(t)||junk.test(t))continue;const k=(j.url||"").split("?")[0];if(seen.has(k))continue;seen.add(k);out.push(j);}
const lines=out.map((j,i)=>`${i+1}\t${j.title}\t${j.company}\t${j.location}\t${j.url}`);
fs.writeFileSync("results/linkedin-2yoe-matches.txt",["#\tTitle\tCompany\tLocation\tURL",...lines].join("\n"),"utf-8");
console.log(`checkpoint jobs: ${jobs.length}; 2-YOE field matches: ${out.length}`);
