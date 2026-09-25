const fs = require("fs");
const data = JSON.parse(fs.readFileSync("results/indeed-checkpoint.json","utf-8"));
const jobs = data.allJobs || [];
const field = /(java|spring|backend|micro ?service|node\.?js|react|full ?stack|api\b|\bsde\b|software (developer|engineer)|javascript|typescript|web developer|mern|mean|\bdeveloper\b)/i;
// too senior for 2 YOE
const senior = /(senior|sr\.?\b|lead\b|principal|staff|architect|manager|head\b|director|specialist|consultant|iv\b|iii\b|level 4|l4|l3|expert|vp\b)/i;
// too junior / not dev
const junk = /(intern|trainee|fresher|vmc|wordpress|shopify|webflow|firmware|unity|\bqa\b|tester|testing|trainer|sales|marketing|\bhr\b|recruit|photo|graphic|content|seo|sap |oracle apex|palantir|kofax|cofax|digital security|aosp)/i;
const seen = new Set();
const picked = [];
for (const j of jobs) {
  const t = j.title || "";
  if (!field.test(t) || senior.test(t) || junk.test(t)) continue;
  const key = j.url.split("&")[0];
  if (seen.has(key)) continue;
  seen.add(key); picked.push(j);
}
const lines = picked.map((j,i)=>`${i+1}\t${j.title}\t${j.company}\t${j.location}\t${j.salary}\t${j.url}`);
fs.writeFileSync("results/indeed-2yoe-matches.txt",["#\tTitle\tCompany\tLocation\tSalary\tURL",...lines].join("\n"),"utf-8");
const byCity = {};
picked.forEach(j=>{const c=(j.location||"").split(",")[0].trim()||"?"; byCity[c]=(byCity[c]||0)+1;});
console.log(`Total scraped: ${jobs.length}; 2-YOE field matches: ${picked.length}`);
console.log("By location:", JSON.stringify(byCity));
