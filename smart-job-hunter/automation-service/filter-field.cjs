const fs = require("fs");
const data = JSON.parse(fs.readFileSync("results/indeed-checkpoint.json","utf-8"));
const jobs = data.allJobs || [];
const kw = /(java|spring|backend|micro ?service|node|react|full ?stack|api |sde|software (developer|engineer)|javascript|typescript|developer)/i;
const bad = /(vmc|wordpress|shopify|webflow|firmware|unity|qa |tester|trainer|intern|sales|marketing|hr |recruit|photo|graphic|content|seo)/i;
const seen = new Set();
const picked = [];
for (const j of jobs) {
  const t = (j.title||"");
  if (!kw.test(t) || bad.test(t)) continue;
  const key = j.url.split("&")[0];
  if (seen.has(key)) continue;
  seen.add(key); picked.push(j);
}
const lines = picked.map((j,i)=>`${i+1}\t${j.title}\t${j.company}\t${j.location}\t${j.url}`);
fs.writeFileSync("results/indeed-field-matches.txt",["#\tTitle\tCompany\tLocation\tURL",...lines].join("\n"),"utf-8");
console.log(`Total in checkpoint: ${jobs.length}; field matches: ${picked.length}`);
