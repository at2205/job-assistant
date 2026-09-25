const fs=require("fs");
const rows=fs.readFileSync("results/db-ncr-jobs.txt","utf-8").split("\n").slice(1).filter(Boolean).map(l=>{const p=l.split("\t");return{title:p[1],company:p[2],location:p[3],platform:p[4],url:p[5]};});
const field=/(java|spring|backend|micro ?service|node\.?js|react|full ?stack|\bapi\b|\bsde\b|software (developer|engineer)|javascript|typescript|\bdeveloper\b)/i;
const senior=/(senior|sr\.?\b|lead\b|principal|staff|architect|manager|head\b|director|vp\b|iv\b|\bv\b|9\+|10\+)/i;
const junk=/(intern|trainee|fresher|\bqa\b|tester|sales|marketing|\bhr\b|recruit|wordpress|php|\.net|dotnet|salesforce|sap|devops|data scientist|ml |android|ios|flutter|ui\/ux|designer|support|analyst)/i;
// dedup key: for indeed keep jk param; else strip query string
const key=u=>{u=u||"";if(/indeed\.com/.test(u)){const m=u.match(/jk=([a-z0-9]+)/i);return m?"jk:"+m[1]:u;}return u.split("?")[0];};
const seen=new Set(); const out=[];
for(const r of rows){const t=r.title||"";if(!field.test(t)||senior.test(t)||junk.test(t))continue;const k=key(r.url);if(seen.has(k))continue;seen.add(k);out.push(r);}
const city=r=>{const l=(r.location||"").toLowerCase();if(l.includes("noida"))return"Noida";if(l.includes("gurugram")||l.includes("gurgaon"))return"Gurgaon";if(l.includes("delhi")||l.includes("ncr"))return"Delhi NCR";return"Other NCR";};
out.sort((a,b)=>city(a).localeCompare(city(b)) || a.company.localeCompare(b.company));
const lines=out.map((r,i)=>`${i+1}\t${city(r)}\t${r.title}\t${r.company}\t${r.platform}\t${r.url}`);
fs.writeFileSync("results/ncr-2yoe-matches.txt",["#\tCity\tTitle\tCompany\tPlatform\tURL",...lines].join("\n"),"utf-8");
const byC={},byP={}; out.forEach(r=>{byC[city(r)]=(byC[city(r)]||0)+1;byP[r.platform]=(byP[r.platform]||0)+1;});
console.log("field 2-YOE NCR matches:",out.length);
console.log("by city:",JSON.stringify(byC));
console.log("by platform:",JSON.stringify(byP));
