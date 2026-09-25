# QA Plan + Demo Preparation

## End-to-End Testing Checklist

### Phase 1: Auth & Session
- [ ] Login to Naukri — session saved to disk
- [ ] Validate session — returns "valid"
- [ ] Kill session → re-validate — returns "invalid"
- [ ] Login with wrong password — graceful error
- [ ] OTP flow — waits, user enters manually, proceeds

### Phase 2: Job Scraping
- [ ] Fetch 1 page of "Java Developer" jobs from Naukri
- [ ] Verify 10+ jobs stored in PostgreSQL
- [ ] Verify no duplicate URLs stored
- [ ] Run same fetch again — 0 new jobs (dedup works)
- [ ] Verify skills parsed as array (not raw string)
- [ ] Verify salary normalized (min/max as integers)

### Phase 3: Scoring
- [ ] Score unscored jobs — returns count > 0
- [ ] Top job has score between 70-100 (sanity check)
- [ ] explain-score shows valid breakdown (all 5 dimensions)
- [ ] All scores between 0-100 (no overflow/NaN)
- [ ] Rescore with --rescore — updates existing scores
- [ ] Weights sum to 1.0 (validation catches misconfiguration)

### Phase 4: AI Generation
- [ ] ai-status shows at least 1 provider available
- [ ] Generate resume — returns bullet points with action verbs
- [ ] Generate cover letter — 150-300 words, no AI artifacts
- [ ] Generate answer — relevant to the question asked
- [ ] Cache works — second request returns "cached: true"
- [ ] --force flag regenerates (ignores cache)
- [ ] Post-processing removes "Here is..." preamble

### Phase 5: Auto-Apply
- [ ] --dry-run fills form but does NOT submit
- [ ] Daily limit blocks after N applications
- [ ] Duplicate hash prevents double-apply
- [ ] Manual approval shows job details, waits for y/n
- [ ] 'q' exits approval loop gracefully
- [ ] apply-status shows correct counts
- [ ] Cooldown delay between applications (visible in logs)

### Phase 6: Dashboard
- [ ] Dashboard loads without errors
- [ ] Job list shows scores and badges
- [ ] Score breakdown visible on job detail page
- [ ] Application tracker shows status for each job
- [ ] Settings page saves preferences

---

## Demo Preparation Checklist (Before Any Live Demo)

### Setup (30 min before)
- [ ] Docker containers running: `docker-compose ps` — all healthy
- [ ] Ollama running: `curl localhost:11434/api/tags` — returns models
- [ ] Database seeded: at least 20 jobs in DB
- [ ] Scores pre-computed: `score-jobs` already run
- [ ] AI content pre-cached for top 5 jobs
- [ ] Frontend running: `http://localhost:3000` loads
- [ ] Demo mode active (or use real data)

### Demo Flow (5-minute version)
1. **Dashboard** (30s) — "Here's the overview. 247 jobs found, 18 score above 75."
2. **Job List** (60s) — "Sort by score. Top match: PhonePe, 92/100. Let me show you why."
3. **Score Explanation** (60s) — Click job → "Skill 98, Experience 100, Location 100. Here's the breakdown."
4. **AI Generation** (90s) — "Watch it generate a tailored cover letter in real-time." (Show terminal)
5. **Apply Demo** (60s) — "Dry run mode. It fills the form, shows me what it would submit. I can approve or skip."

### Demo Flow (2-minute version for recruiters)
1. "This finds jobs matching my exact profile" → show score
2. "AI writes a custom cover letter for each job" → show output
3. "It only applies to strong matches, with my approval" → show safety gates
4. "Everything tracked in one dashboard" → show tracker

### Talking Points During Demo
- "This is NOT a mass-apply tool — it's selective by design"
- "The AI runs locally for free using Ollama — zero API cost"
- "I can swap AI providers without changing a line of code"
- "Each application goes through 7 safety checks"

---

## Recruiter Demo Script (Non-Technical Audience)

```
"Let me show you what I built.

[Open dashboard]
This is JobFlow AI — it's an intelligent job application system.

[Point to scores]
It finds jobs, then scores each one against my profile. See this one?
92 out of 100. It matched on skills, experience, location, and salary.

[Click into job]
For each high-scoring job, the AI writes a custom cover letter.
Not a template — it references the specific company and role.

[Show apply flow]
When I'm ready, it applies with human-like behavior — typing at normal
speed, waiting between actions. And I can review every application before
it goes out.

[Show architecture briefly]
Under the hood: Spring Boot backend, PostgreSQL, Next.js dashboard,
Playwright for browser automation, and 3 AI providers that automatically
fall back to each other.

The interesting engineering challenge was making all of these work together
reliably — session management, rate limiting, AI quality control, and
duplicate prevention."
```

---

## Known Issues / Weak Points to Fix

| Issue | Severity | Fix |
|-------|----------|-----|
| Naukri selectors may break on redesign | Medium | Monitor monthly, update selectors |
| LinkedIn detects automation more easily | High | Keep limits very low (8/day), add more randomness |
| AI sometimes generates generic content | Low | Improve prompts, add diversity in temperature |
| No email notifications | Feature gap | Add nodemailer for application status updates |
| No resume PDF generation | Feature gap | Add puppeteer-html-to-pdf for export |
| Dashboard has no real auth guard | Medium | Add middleware check for JWT in Next.js |
| No rate limiting on Spring Boot API | Medium | Add Spring Security rate limiter |

---

## Performance Benchmarks (Document These)

| Operation | Expected Time | Acceptable |
|-----------|---------------|-----------|
| Score 100 jobs | < 2 seconds | Yes (CPU-only) |
| Generate cover letter (Ollama) | 8-15 seconds | Yes (local) |
| Generate cover letter (Groq) | 1-3 seconds | Yes (API) |
| Scrape 1 page of jobs | 5-10 seconds | Yes (with delays) |
| Full apply flow (1 job) | 30-60 seconds | Yes (human-like) |
| Dashboard initial load | < 2 seconds | Yes (SSR) |
