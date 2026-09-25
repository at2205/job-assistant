const fs=require("fs");
const rows=fs.readFileSync("results/ncr-2yoe-matches.txt","utf-8").split("\n").slice(1).filter(Boolean).map(l=>{const p=l.split("\t");return{city:p[1],title:p[2],company:p[3],platform:p[4],url:p[5]};});
// extra cross-platform dedup by company+normalized-title
const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\b(hybrid|remote|pan india|apply now|immediate joiner|s|h|ic)\b/g," ").replace(/\s+/g," ").trim();
const seen=new Set(); const out=[];
const cityOrder={"Noida":0,"Gurgaon":1,"Delhi NCR":2,"Other NCR":3};
for(const r of rows){const k=r.company.toLowerCase().trim()+"|"+norm(r.title);if(seen.has(k))continue;seen.add(k);out.push(r);}
out.sort((a,b)=>(cityOrder[a.city]??9)-(cityOrder[b.city]??9) || a.company.localeCompare(b.company) || a.title.localeCompare(b.title));
const csvCell=s=>{s=String(s||"").replace(/\*\*/g," ").replace(/\s+/g," ").trim();return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
const header=["S.No","City","Title","Company","Platform","URL","Status","Applied Date","Notes"];
const lines=[header.join(",")];
out.forEach((r,i)=>lines.push([i+1,r.city,r.title,r.company,r.platform,r.url,"Not Applied","",""].map(csvCell).join(",")));
fs.writeFileSync("results/NCR-apply-tracker.csv",lines.join("\n"),"utf-8");
const byC={},byP={};out.forEach(r=>{byC[r.city]=(byC[r.city]||0)+1;byP[r.platform]=(byP[r.platform]||0)+1;});
console.log("Total unique after cross-platform dedup:",out.length);
console.log("by city:",JSON.stringify(byC));
console.log("by platform:",JSON.stringify(byP));
console.log("Saved: results/NCR-apply-tracker.csv");
