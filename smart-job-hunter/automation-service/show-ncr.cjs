const fs=require("fs");
const rows=fs.readFileSync("results/ncr-2yoe-matches.txt","utf-8").split("\n").slice(1).filter(Boolean).map(l=>{const p=l.split("\t");return{city:p[1],title:p[2],company:p[3],platform:p[4],url:p[5]};});
// prefer single-city NCR listings (not pan-india spam) and dedupe by company+title
const single = rows.filter(r=>!/kolkata|mumbai|chennai|bengaluru|pune|hyderabad/i.test(r.city==="")); 
const show=(c)=>{const it=rows.filter(r=>r.city===c).slice(0,18);console.log("\n=== "+c+" ("+rows.filter(r=>r.city===c).length+") ===");it.forEach(r=>console.log(`${r.title} | ${r.company} | ${r.platform} | ${r.url}`));};
show("Noida"); show("Gurgaon"); show("Delhi NCR");
