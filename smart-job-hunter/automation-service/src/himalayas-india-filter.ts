/**
 * Classify each scraped Himalayas job by India eligibility using the page's
 * schema.org JobPosting JSON-LD (applicantLocationRequirements = full, untruncated
 * country list). Reuses the saved Google session.
 *
 * Rules (India-eligible if ANY):
 *   - applicantLocationRequirements contains a country named "India"
 *   - no applicantLocationRequirements AND the page says Worldwide/Anywhere
 *     (remote with no country restriction ⇒ open to India)
 *
 * Reads:  results/himalayas-urls-clean.txt (one URL per line)
 * Writes: results/himalayas-india-eligible.txt   (URLs open to India)
 *         results/himalayas-not-eligible.txt      (URL <tab> reason)
 *         results/himalayas-eligibility.json      (full per-job detail)
 *
 * Usage: npx tsx src/himalayas-india-filter.ts
 */
import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface JobEligibility {
  url: string;
  title: string;
  countries: string[];
  worldwide: boolean;
  indiaEligible: boolean;
  reason: string;
  error?: string;
}

async function classify(page: import('playwright').Page, url: string): Promise<JobEligibility> {
  // Load with a couple of retries — Himalayas occasionally serves a Cloudflare
  // "Just a moment..." interstitial that clears itself in a real browser.
  let data: { countries: string[]; worldwide: boolean; title: string; pill: string; challenged: boolean } | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt === 0) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } else {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    }
    // Wait for the real job page (JSON-LD present) or give Cloudflare time to clear.
    await page.waitForSelector('script[type="application/ld+json"]', { timeout: 8000 }).catch(() => {});
    await sleep(attempt === 0 ? 700 : 3500);

    data = await page.evaluate(() => {
      const challenged = /just a moment|checking your browser|cf-browser-verification|enable javascript and cookies/i
        .test(document.title + ' ' + document.body.innerText.slice(0, 500));
      let ld: any = null;
      for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
        try {
          const j = JSON.parse(s.textContent || '');
          const post = j['@type'] === 'JobPosting' ? j
            : (Array.isArray(j) ? j.find((x: any) => x['@type'] === 'JobPosting') : null);
          if (post) { ld = post; break; }
        } catch { /* ignore */ }
      }
      let countries: string[] = [];
      const alr = ld?.applicantLocationRequirements;
      if (Array.isArray(alr)) countries = alr.map((c: any) => c?.name).filter(Boolean);
      else if (alr && alr.name) countries = [alr.name];

      const bodyText = (document.querySelector('main') as HTMLElement)?.innerText || document.body.innerText;
      const m = bodyText.match(/Employee count:\s*[\d,\-+]+\s*\n+([^\n]+)/);
      const pill = m?.[1]?.trim() || '';
      const worldwide = /worldwide|anywhere/i.test(pill) || /100%\s*remote\s*worldwide/i.test(bodyText);
      const title = (ld?.title as string) || document.title.replace(/\s*[|\-].*$/, '').trim();
      return { countries, worldwide, title, pill, challenged, hasLd: !!ld } as any;
    });

    // Good read = we got a JobPosting (has countries or explicit worldwide) and not challenged.
    if (data && !data.challenged && ((data as any).hasLd || data.worldwide)) break;
  }

  if (!data) {
    return { url, title: '', countries: [], worldwide: false, indiaEligible: false, reason: 'error', error: 'no data' };
  }
  if ((data as any).challenged || (!(data as any).hasLd && !data.worldwide)) {
    // Couldn't read reliably (Cloudflare / no JSON-LD). Don't guess.
    return { url, title: data.title, countries: [], worldwide: false, indiaEligible: false, reason: 'uncertain (blocked/no data — check manually)', error: 'challenged' };
  }

  // Treat special "country" names Anywhere/Worldwide as worldwide.
  const worldwideNames = data.countries.some(c => /^(anywhere|worldwide)$/i.test(c.trim()));
  const realCountries = data.countries.filter(c => !/^(anywhere|worldwide)$/i.test(c.trim()));
  const hasIndia = realCountries.some(c => /^india$/i.test(c.trim()));
  const noRestriction = realCountries.length === 0;

  let indiaEligible = false;
  let reason = '';
  if (hasIndia) { indiaEligible = true; reason = 'India explicitly listed'; }
  else if (data.worldwide || worldwideNames) { indiaEligible = true; reason = 'Worldwide / anywhere'; }
  else if (noRestriction) { indiaEligible = true; reason = 'No country restriction (remote)'; }
  else { indiaEligible = false; reason = `Restricted to: ${realCountries.join(', ')}`; }

  return {
    url, title: data.title, countries: data.countries,
    worldwide: data.worldwide || worldwideNames, indiaEligible, reason,
  };
}

async function main() {
  const urlsFile = process.env.HIMALAYAS_URLS_FILE
    ? path.resolve(process.cwd(), process.env.HIMALAYAS_URLS_FILE)
    : path.resolve(process.cwd(), 'results', 'himalayas-urls-clean.txt');
  const suffix = process.env.HIMALAYAS_OUT_SUFFIX || '';
  const urls = fs.readFileSync(urlsFile, 'utf-8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  console.log(`Classifying ${urls.length} jobs by India eligibility...\n`);

  const userDataDir = path.resolve(process.cwd(), 'sessions', 'himalayas-session');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false, viewport: { width: 1366, height: 900 },
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars', '--no-sandbox'],
  });
  const page = context.pages()[0] || await context.newPage();

  const results: JobEligibility[] = [];
  try {
    for (let i = 0; i < urls.length; i++) {
      const u = urls[i];
      try {
        const r = await classify(page, u);
        results.push(r);
        console.log(`${(i + 1).toString().padStart(3)}/${urls.length}  ${r.indiaEligible ? '✅' : '❌'}  ${r.title.slice(0, 55).padEnd(55)}  ${r.indiaEligible ? '' : r.reason}`);
      } catch (e: any) {
        results.push({ url: u, title: '', countries: [], worldwide: false, indiaEligible: false, reason: 'error', error: e.message });
        console.log(`${(i + 1).toString().padStart(3)}/${urls.length}  ⚠️  ERROR  ${u}  ${e.message}`);
      }
      await sleep(900 + Math.random() * 900);
    }
  } finally {
    await context.close().catch(() => {});
  }

  const eligible = results.filter(r => r.indiaEligible);
  const notEligible = results.filter(r => !r.indiaEligible);

  const resultsDir = path.resolve(process.cwd(), 'results');
  fs.writeFileSync(path.join(resultsDir, `himalayas-india-eligible${suffix}.txt`),
    eligible.map(r => r.url).join('\n'), 'utf-8');
  fs.writeFileSync(path.join(resultsDir, `himalayas-not-eligible${suffix}.txt`),
    notEligible.map(r => `${r.url}\t${r.reason}`).join('\n'), 'utf-8');
  fs.writeFileSync(path.join(resultsDir, `himalayas-eligibility${suffix}.json`),
    JSON.stringify(results, null, 2), 'utf-8');

  console.log(`\n============================================================`);
  console.log(`  India-eligible: ${eligible.length}`);
  console.log(`  Not eligible:   ${notEligible.length}`);
  console.log(`  Errors:         ${results.filter(r => r.error).length}`);
  console.log(`============================================================`);
  console.log(`  Saved: results/himalayas-india-eligible.txt`);
  console.log(`  Saved: results/himalayas-not-eligible.txt`);
  console.log(`  Saved: results/himalayas-eligibility.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
