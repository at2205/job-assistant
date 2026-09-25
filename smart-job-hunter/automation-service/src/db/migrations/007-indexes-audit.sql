-- =============================================
-- Migration 007: Performance Indexes + Audit Log
-- =============================================

-- ---- Audit Log Table ----
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,       -- login, apply, scrape, generate, setting_change, etc.
  resource_type VARCHAR(50),          -- job, application, subscription
  resource_id UUID,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- Performance Indexes ----

-- Jobs: search by platform + recency
CREATE INDEX IF NOT EXISTS idx_jobs_platform_date ON jobs(source_platform, posted_date DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_name);
CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs(location);
CREATE INDEX IF NOT EXISTS idx_jobs_scraped ON jobs(scraped_at DESC);

-- Job Scores: ranked queries
CREATE INDEX IF NOT EXISTS idx_scores_user_total ON job_scores(user_id, total_score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_job ON job_scores(job_id);

-- Applications: status queries
CREATE INDEX IF NOT EXISTS idx_applications_user_status ON job_applications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_created ON job_applications(created_at DESC);

-- Generated Content: cache lookup
CREATE INDEX IF NOT EXISTS idx_content_user_job ON generated_content(user_id, job_id);

-- Audit: compliance queries
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, created_at DESC);

-- ---- Full Text Search on Jobs ----
CREATE INDEX IF NOT EXISTS idx_jobs_title_fts ON jobs USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_jobs_desc_fts ON jobs USING gin(to_tsvector('english', COALESCE(job_description, '')));

-- ---- Partitioning prep: audit log by month ----
-- For future: partition audit_log by created_at range
-- CREATE TABLE audit_log_2024_01 PARTITION OF audit_log
--   FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
