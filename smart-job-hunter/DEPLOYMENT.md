# =============================================
# PHASE 7: PRODUCTION DEPLOYMENT + SAAS LAUNCH
# Complete Architecture & Strategy Document
# =============================================

## 1. PRODUCTION ARCHITECTURE

```
                         ┌─────────────┐
                         │   Vercel     │
                         │  (Frontend)  │
                         └──────┬───────┘
                                │ HTTPS
                    ┌───────────▼───────────┐
                    │      Cloudflare       │
                    │   (CDN + WAF + DDoS)  │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │       Nginx           │
                    │  (Reverse Proxy)      │
                    │  Rate Limit + TLS     │
                    └──┬────────────────┬───┘
                       │                │
            ┌──────────▼──┐    ┌────────▼──────────┐
            │ Spring Boot │    │  Automation Svc   │
            │  Backend    │    │  (Node+Playwright) │
            │  (API)      │    │  BullMQ Workers    │
            └──────┬──────┘    └────────┬──────────┘
                   │                    │
         ┌────────┼────────┐   ┌───────┼────────┐
         │        │        │   │       │        │
    ┌────▼──┐ ┌───▼──┐ ┌──▼───▼──┐ ┌──▼──┐ ┌──▼──────┐
    │Supa-  │ │Redis │ │Ollama/  │ │Apify│ │Stripe   │
    │base   │ │(Queue│ │Groq/HF  │ │Cloud│ │Billing  │
    │(PG)   │ │Cache)│ │(AI)     │ │Scrp │ │         │
    └───────┘ └──────┘ └─────────┘ └─────┘ └─────────┘
                   │
         ┌────────┼────────┐
         │        │        │
    ┌────▼──┐ ┌───▼───┐ ┌──▼────┐
    │Prome- │ │Grafana│ │Sentry │
    │theus  │ │       │ │       │
    └───────┘ └───────┘ └───────┘
```

### Deployment Targets

| Service           | Free Tier                    | Production          |
|-------------------|------------------------------|---------------------|
| Frontend          | Vercel (free)                | Vercel Pro          |
| Backend API       | Render (free)                | Render Pro / ECS    |
| Automation Worker | Railway ($5/mo)              | EC2 t3.medium       |
| Database          | Supabase (500MB free)        | Supabase Pro / RDS  |
| Redis             | Upstash (10K/day free)       | Upstash Pro         |
| AI                | Groq (free tier)             | Groq + Ollama self  |
| Monitoring        | Grafana Cloud (free)         | Self-hosted         |
| Error Tracking    | Sentry (free 5K events)      | Sentry Team         |

---

## 2. ENVIRONMENT MANAGEMENT

### Secrets Rotation Schedule

| Secret             | Rotation  | Method                          |
|--------------------|-----------|----------------------------------|
| JWT_SECRET         | 90 days   | Generate new → update env → restart |
| ENCRYPTION_KEY     | 90 days   | Re-encrypt all credentials first |
| DB_PASSWORD        | 180 days  | ALTER ROLE → update env          |
| REDIS_PASSWORD     | 180 days  | ACL SETUSER → update env         |
| STRIPE_SECRET_KEY  | On demand | Roll in Stripe dashboard         |
| APIFY_API_TOKEN    | On demand | Regenerate in Apify settings     |
| GROQ_API_KEY       | On demand | Regenerate in Groq console       |

### Playwright Session Security

1. **Credential Encryption**: AES-256-GCM (see `auth/credential-encryption.ts`)
2. **Session files**: Stored in Docker volume, not in code
3. **Browser isolation**: Each user gets a separate browser context
4. **Cookie rotation**: Sessions refreshed every 24h
5. **No credential logging**: Winston filters exclude password fields

---

## 3. SCALING ARCHITECTURE

### Horizontal Scaling Strategy

```
Phase 1 (0-100 users):     Single instance each service
Phase 2 (100-1K users):    2x backend, 3x workers, read replica
Phase 3 (1K-10K users):    K8s auto-scale, partitioned DB, CDN
Phase 4 (10K+ users):      Multi-region, dedicated DB per tenant tier
```

### Queue Architecture (BullMQ)

```
Scrape Queue ──► Scrape Worker (1 concurrent)
                    │
                    ▼
Score Queue  ──► Score Worker  (3 concurrent)
                    │
                    ▼
Generate Queue ─► Gen Worker   (2 concurrent)
                    │
                    ▼
Apply Queue  ──► Apply Worker  (1 concurrent, rate-limited)
                    │
                    ▼
Notify Queue ──► Notify Worker (5 concurrent)

Dead Letter ◄── All failed jobs after 3 retries
```

### Rate Limiting (3 layers)

1. **Nginx**: IP-based (30 req/min API, 5 req/min auth)
2. **Application**: User-based (via `rate-limiter.ts`)
3. **Queue**: Job-based (BullMQ limiter: 10 jobs/min)

---

## 4. BILLING ARCHITECTURE

### Plans

| Feature                    | Free   | Pro ($29/mo) | Agency ($99/mo) |
|---------------------------|--------|--------------|-----------------|
| Applications/day          | 5      | 25           | 100             |
| AI Generations/day        | 10     | 100          | 500             |
| Scrape runs/day           | 3      | 10           | 50              |
| Saved jobs                | 100    | 1,000        | 10,000          |
| Platforms                 | 1      | 2            | 2               |
| Auto-apply                | ✗      | ✓            | ✓               |
| AI Resume/Cover Letter    | ✗      | ✓            | ✓               |
| CSV Export                | ✗      | ✓            | ✓               |
| API Access                | ✗      | ✗            | ✓               |
| Team Management           | ✗      | ✗            | ✓               |

### Stripe Integration Flow

```
User ──► Pricing Page ──► Stripe Checkout ──► Webhook ──► Activate Plan
                                                │
                                                ▼
                                         Record Payment
                                         Update Limits
```

---

## 5. SECURITY HARDENING

### Architecture

| Layer         | Protection                                  |
|---------------|---------------------------------------------|
| Network       | Cloudflare WAF, DDoS protection             |
| Transport     | TLS 1.2+, HSTS, certificate pinning         |
| Proxy         | Nginx rate limits, security headers          |
| Application   | JWT + refresh tokens, RBAC, CSRF tokens     |
| Data          | AES-256-GCM encryption, parameterized SQL   |
| Browser       | Playwright stealth, fingerprint rotation     |
| Audit         | All actions logged with IP + user agent      |

### Anti-Detection Measures

1. Randomized delays (2-8s between actions)
2. Human-like mouse movements
3. Viewport/UA rotation
4. Proxy rotation (for scale)
5. Session cookie persistence
6. Max 15 applies/day (mimics human)

### RBAC Roles

| Role    | Permissions                                   |
|---------|-----------------------------------------------|
| user    | Own jobs, own applications, own profile        |
| admin   | All users, system config, billing admin        |
| api     | Scoped API access (agency plan only)           |

---

## 6. MULTI-TENANCY

### Isolation Model: Shared DB, Row-Level Security

```sql
-- Every query filters by user_id
-- Enforced at application layer + DB policies
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_jobs ON jobs
  USING (user_id = current_setting('app.user_id')::uuid);
```

### What's Isolated Per User

- Browser sessions (separate Playwright context)
- Scraped job results (user_id FK on jobs table)
- AI generated content (user_id FK)
- Applications (user_id FK)
- Credentials (encrypted per user)
- Usage counters (daily_usage table)
- Queue jobs (userId in job data)

---

## 7. MONITORING + ALERTING

### Stack

```
Application ──► Winston Logs ──► stdout ──► Docker logs ──► Log aggregator
     │
     └──► Prometheus metrics ──► Grafana dashboards ──► Alert rules
     │
     └──► Sentry ──► Error tracking + performance
```

### Key Dashboards

1. **System Overview**: CPU, memory, uptime per service
2. **Queue Health**: Waiting, active, failed counts per queue
3. **Application Pipeline**: Scrape → Score → Apply funnel
4. **AI Provider**: Latency, failure rates, fallback usage
5. **Billing**: Active subscriptions, MRR, churn

### Alert Channels

- Critical (PagerDuty/SMS): Service down, DB connection exhausted
- Warning (Slack): High error rate, queue backlog, DLQ growing
- Info (Email): Daily usage summary, weekly report

---

## 8. DISASTER RECOVERY

### Backup Strategy

| Data            | Frequency | Retention | Storage         |
|-----------------|-----------|-----------|-----------------|
| PostgreSQL      | Daily     | 7 days    | Local + S3      |
| PostgreSQL      | Weekly    | 4 weeks   | S3              |
| Redis (AOF)     | Realtime  | 24h       | Volume          |
| Sessions        | Per-login | 7 days    | Volume          |
| Audit logs      | Realtime  | 90 days   | S3              |

### Recovery Procedures

1. **DB corruption**: Restore from latest pg_dump (RTO: 15min)
2. **Service crash**: Docker auto-restart + health checks
3. **Bad deploy**: Git revert → CI/CD auto-deploys previous version
4. **Redis loss**: Queues recreated on startup, retry from DB state
5. **Full outage**: DNS failover to standby region (Phase 3+)

### Rollback Strategy

```
1. git revert HEAD          # Revert bad commit
2. git push                 # Triggers CI/CD
3. Render/Railway auto-deploys previous container
4. Verify via health checks
5. Post-mortem within 24h
```

---

## 9. PERFORMANCE OPTIMIZATION

### Caching Strategy

| Data              | Cache Layer     | TTL    |
|-------------------|-----------------|--------|
| Job search results| Redis           | 5 min  |
| User plan limits  | Redis           | 1 hour |
| AI generated text | PostgreSQL      | 7 days |
| Scoring weights   | In-memory       | ∞      |
| Session tokens    | Redis           | 24h    |

### Database Optimization

- **Connection pooling**: PgBouncer or Supabase pooler (100 max)
- **Indexes**: B-tree on FKs, GIN on JSONB skills, full-text on title/description
- **Query optimization**: `EXPLAIN ANALYZE` on slow queries (>500ms logged)
- **Partitioning**: Audit log by month (when >10M rows)

---

## 10. RISK MANAGEMENT

| Risk                 | Probability | Impact   | Mitigation                          |
|----------------------|-------------|----------|-------------------------------------|
| Scraper banned       | High        | Medium   | Apify cloud, proxy rotation, delays |
| AI provider outage   | Medium      | Low      | 3-provider fallback chain           |
| DB bottleneck        | Low         | High     | Connection pool, read replicas      |
| Queue overload       | Low         | Medium   | BullMQ rate limiter, DLQ            |
| Deployment failure   | Medium      | Medium   | Health checks, auto-rollback        |
| Credential leak      | Low         | Critical | AES encryption, audit logs          |
| Abuse (mass apply)   | Medium      | High     | Plan limits, rate limiting, CAPTCHA  |

---

## 11. LAUNCH STRATEGY

### Pre-Launch Checklist

- [ ] All migrations run on production DB
- [ ] Environment variables set in Render/Railway/Vercel
- [ ] SSL certificates configured
- [ ] Stripe products/prices created
- [ ] Sentry projects created
- [ ] Grafana dashboards imported
- [ ] Backup cron job scheduled
- [ ] Domain DNS configured
- [ ] Rate limits tested
- [ ] Health checks verified

### Beta Rollout Plan

```
Week 1-2:  Internal testing (you + 5 friends)
Week 3-4:  Closed beta (invite 20 users from LinkedIn)
Week 5-6:  Open beta (50 users, free tier only)
Week 7-8:  Paid launch (Pro + Agency plans enabled)
```

### First 100 Users Strategy

1. **LinkedIn posts**: Share your building journey (3x/week)
2. **Reddit**: Post in r/cscareerquestions, r/developersIndia
3. **Product Hunt**: Launch with demo video
4. **Twitter/X**: Thread about building with AI agents
5. **Direct outreach**: DM 50 job seekers on LinkedIn
6. **Free tier**: Generous limits to drive signups
7. **Referral**: "Invite 3 friends → 1 week Pro free"

### Analytics Events to Track

```
user_signup           # New registration
job_scraped           # Scrape completed
job_scored            # Scoring completed
ai_generated          # AI content created
application_sent      # Auto-apply completed
application_success   # Got response/interview
plan_upgraded         # Free → Pro/Agency
plan_downgraded       # Pro/Agency → Free
churn_risk            # No login for 7 days
```

### Pricing Strategy

- **Free tier**: Hook users with limited but useful features
- **Pro ($29/mo)**: Target individual job seekers
- **Agency ($99/mo)**: Target recruiters, career coaches
- **Annual discount**: 20% off (2 months free)
- **First 100 users**: Lifetime 50% discount on Pro

---

## 12. FILE STRUCTURE (FINAL)

```
smart-job-hunter/
├── .github/
│   └── workflows/
│       ├── backend.yml              # Backend CI/CD
│       ├── automation.yml           # Automation CI/CD
│       └── frontend.yml             # Frontend CI/CD
├── frontend/
│   ├── Dockerfile                   # Production build
│   ├── src/                         # Next.js app
│   └── vercel.json
├── backend/
│   ├── Dockerfile                   # Multi-stage Spring Boot
│   └── src/                         # Java API
├── automation-service/
│   ├── Dockerfile                   # Multi-stage Node+Playwright
│   └── src/
│       ├── index.ts                 # CLI + server entrypoint
│       ├── queue/
│       │   ├── job-queue.ts         # BullMQ queues + producers
│       │   └── workers.ts          # Queue consumers
│       ├── billing/
│       │   ├── subscription-middleware.ts  # Usage gating
│       │   └── stripe-webhook.ts   # Stripe event handlers
│       ├── auth/
│       │   ├── auth-utils.ts        # JWT, password hashing
│       │   ├── credential-encryption.ts  # AES-256-GCM
│       │   └── rate-limiter.ts     # Request rate limiting
│       ├── ai/                      # AI provider chain
│       ├── matching/                # Scoring engine
│       ├── apply/                   # Auto-apply engine
│       ├── platforms/               # Naukri + LinkedIn adapters
│       ├── db/
│       │   ├── postgres-client.ts
│       │   └── migrations/
│       │       ├── 001-005          # Core schema
│       │       ├── 006-billing.sql  # Billing tables
│       │       └── 007-indexes.sql  # Performance + audit
│       └── utils/
│           ├── logging.ts           # Winston logger
│           ├── health-server.ts     # HTTP health + metrics
│           └── monitoring.ts        # Existing health checks
├── nginx/
│   └── nginx.conf                   # Reverse proxy + security
├── infra/
│   ├── postgres/
│   │   └── postgresql.conf         # Tuned PG config
│   └── scripts/
│       ├── backup-db.sh            # Automated backups
│       └── restore-db.sh           # Disaster recovery
├── monitoring/
│   ├── prometheus.yml              # Scrape config
│   ├── alerts.yml                  # Alert rules
│   └── grafana/
│       ├── dashboards/             # JSON dashboard defs
│       └── provisioning/           # Auto-provision datasources
├── docker-compose.yml              # Development stack
├── docker-compose.prod.yml         # Production stack
├── .env.example                    # Full env reference
├── render.yaml                     # Render deploy config
├── README.md
└── DEPLOYMENT.md                   # ← This file
```
