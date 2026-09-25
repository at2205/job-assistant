const fs = require("fs");
const rows = fs.readFileSync("results/indeed-2yoe-matches.txt","utf-8").split("\n").slice(1).filter(Boolean).map(l=>{const p=l.split("\t");return{title:p[1],company:p[2],location:p[3],url:p[5]};});
const core = /(java|spring|backend|micro ?service|node\.?js|full ?stack|\bsde\b|software (developer|engineer))/i;
const group = (name, re) => {
  const items = rows.filter(r=>re.test(r.location) && core.test(r.title));
  console.log(`\n### ${name} (${items.length})`);
  items.slice(0,20).forEach(r=>console.log(`${r.title} | ${r.company} | ${r.url}`));
};
group("HYDERABAD", /Hyderabad|Telangana|HITEC|Gachibowli|Ameerpet|Malkajgiri/i);
group("PUNE", /Pune|Kharadi|Baner|Hinjawadi|Viman|Hadapsar|Bavdhan|Lohegaon/i);
group("BENGALURU", /Bengaluru|Bangalore|Whitefield|HSR|Hennur|Hoskote|Kengeri|Bommanahalli/i);
group("REMOTE", /^Remote|Remote in India|Remote$/i);
