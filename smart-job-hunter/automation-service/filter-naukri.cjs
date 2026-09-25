const fs=require("fs");
const d=JSON.parse(fs.readFileSync("results/naukri-checkpoint.json","utf-8"));
const jobs=d.allJobs||[];
const seen=new Set(); const out=[];
for(const j of jobs){const k=(j.url||"").split("?")[0];if(!j.url||seen.has(k))continue;seen.add(k);out.push(j);}
// sort by priority then ATS score if present
const rank={HIGH:0,GOOD:1,LOW:2,SKIP:3};
out.sort((a,b)=>(rank[a.priority]??9)-(rank[b.priority]??9) || (b.atsScore||0)-(a.atsScore||0));
const clean=s=>String(s||"").replace(/\*\*/g," ").replace(/\s+/g," ").trim();
const lines=out.map((j,i)=>`${i+1}\t${clean(j.title)}\t${clean(j.company)}\t${clean(j.location)}\t${j.experience||""}\t${j.priority||""}\t${j.atsScore??""}\t${j.url}`);
fs.writeFileSync("results/naukri-field-matches.txt",["#\tTitle\tCompany\tLocation\tExp\tPriority\tATS\tURL",...lines].join("\n"),"utf-8");
console.log(`checkpoint jobs: ${jobs.length}; unique: ${out.length}`);
