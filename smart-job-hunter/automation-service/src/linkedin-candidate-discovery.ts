/**
 * LinkedIn Candidate Discovery Engine (Recruiter / HR mode)
 *
 * Mirror of linkedin-job-discovery.ts, but instead of scraping JOBS for a
 * candidate, it scrapes CANDIDATE PROFILES for a recruiter.
 *
 * Steps:
 *   1. Reuse the persistent LinkedIn session (sessions/li-session)
 *   2. Search LinkedIn People search across a role x location matrix
 *   3. Scrape candidate cards (name, headline, location, profile url)
 *   4. Optionally score each candidate against the required skills
 *   5. Dedupe + rank + save structured results
 *
 * ⚠️  Responsible use: only for legitimate recruiting. Scrape public profile
 *     data, respect LinkedIn's terms and applicable data-privacy laws, keep
 *     candidate data secure, and don't spam people.
 *
 * Run:
 *   npm run login              (once, to save the session)
 *   npm run find-candidates    (runs this script)
 */

import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface CandidateResult {
  name: string;
  headline: string;
  location: string;
  url: string;
  connectionDegree: string;
  matchedSkills: string[];
  score: number;
}

// ── What roles / titles you're hiring for ──────────────────────────
// Edit these to match the job profile you're sourcing candidates for.
const ROLES = [
  'Java Developer',
  'Spring Boot Developer',
  'Backend Developer',
  'Full Stack Developer',
  'Software Engineer',
];

// ── Where you want candidates from ─────────────────────────────────
// geoUrn is optional; keeping location as a keyword works fine.
const LOCATIONS: { label: string; loc: string }[] = [
  { label: 'Noida', loc: 'Noida, Uttar Pradesh, India' },
  { label: 'New Delhi', loc: 'New Delhi, Delhi, India' },
  { label: 'Gurugram', loc: 'Gurugram, Haryana, India' },
];

// ── Skills used to score/shortlist candidates ──────────────────────
const REQUIRED_SKILLS = [
  'java', 'spring boot', 'spring', 'microservices', 'rest api', 'sql',
  'postgresql', 'mysql', 'react', 'node.js', 'javascript', 'typescript',
  'docker', 'kubernetes', 'aws', 'git', 'system design',
];

// How many result pages to page through per search (10 profiles per page).
const MAX_PAGES = 3;

function scoreCandidate(text: string): { score: number; matched: string[] } {
  const lower = text.toLowerCase();
  const matched = REQUIRED_SKILLS.filter(s => lower.includes(s));
  // % of required skills found in the headline (headline is short, so any hit is signal)
  const score = Math.round((matched.length / REQUIRED_SKILLS.length) * 100);
  return { score, matched };
}

async function main() {
  console.log('============================================================');
  console.log('  LINKEDIN CANDIDATE DISCOVERY ENGINE (Recruiter mode)');
  console.log('============================================================\n');

  const userDataDir = path.resolve(process.cwd(), 'sessions', 'li-session');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1366, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--no-sandbox',
    ],
  });

  const page = context.pages()[0] || await context.newPage();

  const allCandidates: CandidateResult[] = [];
  const seenUrls = new Set<string>();

  // Extract all people-search cards currently rendered on the page.
  async function extractCards() {
    return page.evaluate(() => {
      const cards = document.querySelectorAll(
        'li.reusable-search__result-container, div.entity-result, li.reusable-search__result-container div.linked-area'
      );
      const results: any[] = [];
      cards.forEach(card => {
        const nameEl = card.querySelector(
          '.entity-result__title-text a span[aria-hidden="true"], .entity-result__title-line a span[aria-hidden="true"], span.entity-result__title-text span[dir="ltr"]'
        );
        const headlineEl = card.querySelector('.entity-result__primary-subtitle');
        const locationEl = card.querySelector('.entity-result__secondary-subtitle');
        const degreeEl = card.querySelector('.entity-result__badge-text span[aria-hidden="true"], .dist-value');
        const linkEl = card.querySelector(
          '.entity-result__title-text a, .app-aware-link[href*="/in/"]'
        ) as HTMLAnchorElement | null;

        const name = nameEl?.textContent?.trim() || '';
        const headline = headlineEl?.textContent?.trim() || '';
        const location = locationEl?.textContent?.trim() || '';
        const connectionDegree = degreeEl?.textContent?.trim() || '';
        const url = linkEl?.href || '';

        if (name && url && url.includes('/in/')) {
          results.push({ name, headline, location, connectionDegree, url });
        }
      });
      return results;
    });
  }

  let loginChecked = false;

  for (const { label, loc } of LOCATIONS) {
    for (const role of ROLES) {
      let addedForQuery = 0;

      for (let pageIdx = 1; pageIdx <= MAX_PAGES; pageIdx++) {
        // People-search combines the role and location into the keyword query,
        // which is the most reliable way to filter without paid Recruiter access.
        const keywords = `${role} ${loc}`;
        const searchUrl =
          `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}` +
          `&origin=GLOBAL_SEARCH_HEADER` +
          (pageIdx > 1 ? `&page=${pageIdx}` : '');

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(3000 + Math.random() * 2000);

        // Check login state once at the very start.
        if (!loginChecked) {
          loginChecked = true;
          const isLoggedIn =
            (await page.$('nav.global-nav')) || (await page.$('.search-results-container'));
          if (!isLoggedIn) {
            console.log('⚠️  Not logged in to LinkedIn. Please login manually...');
            console.log('   (Tip: run `npm run login` first to save the session.)');
            await sleep(30000);
          }
        }

        // Scroll to lazy-load all cards on this page.
        for (let scroll = 0; scroll < 6; scroll++) {
          await page.evaluate(() => window.scrollBy(0, 900));
          await sleep(900);
        }

        const candidates = await extractCards();

        for (const c of candidates) {
          const cleanUrl = c.url.split('?')[0];
          if (!seenUrls.has(cleanUrl)) {
            seenUrls.add(cleanUrl);
            const { score, matched } = scoreCandidate(`${c.headline} ${role}`);
            allCandidates.push({
              name: c.name,
              headline: c.headline,
              location: c.location,
              url: cleanUrl,
              connectionDegree: c.connectionDegree,
              matchedSkills: matched,
              score,
            });
            addedForQuery++;
          }
        }

        // If a page returns no cards at all, later pages won't either — stop paging.
        if (candidates.length === 0) break;

        await sleep(1500 + Math.random() * 2500);
      }

      console.log(`🔎 ${label} / "${role}" → +${addedForQuery} new (total ${allCandidates.length})`);
      await sleep(1500 + Math.random() * 2000);
    }
  }

  // Rank by skill match score (best candidates first).
  allCandidates.sort((a, b) => b.score - a.score);

  console.log(`\n============================================================`);
  console.log(`  TOTAL UNIQUE CANDIDATES FOUND: ${allCandidates.length}`);
  console.log(`============================================================\n`);

  const strong = allCandidates.filter(c => c.score >= 15);
  console.log(`⭐ Strong matches (skill signal in headline): ${strong.length}`);
  console.log(`👥 Others: ${allCandidates.length - strong.length}\n`);

  console.log('--- TOP CANDIDATES (sorted by skill match) ---\n');
  allCandidates.slice(0, 50).forEach((c, i) => {
    console.log(`${i + 1}. ${c.score >= 15 ? '⭐' : '•'} ${c.name}  (${c.score}% skill match)`);
    console.log(`   ${c.headline}`);
    console.log(`   📍 ${c.location}${c.connectionDegree ? `  •  ${c.connectionDegree}` : ''}`);
    if (c.matchedSkills.length) console.log(`   🧩 ${c.matchedSkills.join(', ')}`);
    console.log(`   ${c.url}\n`);
  });

  // Save results
  const resultsDir = path.resolve(process.cwd(), 'results');
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

  const filename = `linkedin-candidates-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(resultsDir, filename),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        total: allCandidates.length,
        strongMatches: strong.length,
        roles: ROLES,
        locations: LOCATIONS.map(l => l.label),
        candidates: allCandidates,
      },
      null,
      2
    )
  );
  console.log(`💾 Saved to results/${filename}`);

  // Also write a quick CSV your HR friend can open in Excel/Sheets.
  const csvPath = path.join(resultsDir, `linkedin-candidates-${Date.now()}.csv`);
  const esc = (v: string) => `"${(v || '').replace(/"/g, '""')}"`;
  const csv = [
    'Name,Headline,Location,Connection,Score,Matched Skills,Profile URL',
    ...allCandidates.map(c =>
      [
        esc(c.name),
        esc(c.headline),
        esc(c.location),
        esc(c.connectionDegree),
        c.score,
        esc(c.matchedSkills.join('; ')),
        esc(c.url),
      ].join(',')
    ),
  ].join('\n');
  fs.writeFileSync(csvPath, csv);
  console.log(`📄 CSV saved to ${path.relative(process.cwd(), csvPath)}`);

  await context.close();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
