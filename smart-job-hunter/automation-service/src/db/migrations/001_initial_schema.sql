-- ============================================
-- Smart Job Hunter — PostgreSQL Schema v1.0
-- Phase 2: Jobs + Users + Sources
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For trigram-based text search

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    full_name       VARCHAR(255) NOT NULL,
    target_roles    TEXT[] DEFAULT '{}',          -- e.g. {'Java Developer', 'Spring Boot Developer'}
    target_locations TEXT[] DEFAULT '{}',         -- e.g. {'Delhi', 'Bangalore', 'Remote'}
    min_experience  INTEGER DEFAULT 0,
    max_experience  INTEGER DEFAULT 50,
    min_salary      INTEGER DEFAULT 0,            -- in LPA (lakhs per annum)
    skills          JSONB DEFAULT '[]',           -- user's skill set for matching
    preferences     JSONB DEFAULT '{}',           -- extensible user preferences
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- JOBS TABLE — Core entity
-- ============================================
CREATE TABLE jobs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- External identification (dedup key)
    external_job_id     VARCHAR(255) NOT NULL,
    source_platform     VARCHAR(50) NOT NULL,      -- 'naukri', 'linkedin', etc.

    -- Core job data
    title               VARCHAR(500) NOT NULL,
    company_name        VARCHAR(500),
    location            VARCHAR(500),
    experience_min      INTEGER,                   -- years
    experience_max      INTEGER,                   -- years
    salary_min          INTEGER,                   -- in LPA
    salary_max          INTEGER,                   -- in LPA
    salary_currency     VARCHAR(10) DEFAULT 'INR',
    job_description     TEXT,
    job_url             VARCHAR(2000) NOT NULL,

    -- Structured skills
    skills              JSONB DEFAULT '[]',        -- ['java', 'spring boot', 'react']

    -- Metadata
    company_rating      DECIMAL(3,1),
    job_type            VARCHAR(50),                -- 'Full Time', 'Contract', 'Part Time'
    posted_date         DATE,
    scraped_at          TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at        TIMESTAMPTZ DEFAULT NOW(),
    is_active           BOOLEAN DEFAULT TRUE,

    -- Raw data for debugging/reprocessing
    raw_data            JSONB DEFAULT '{}',

    -- Deduplication constraint
    CONSTRAINT uq_job_external UNIQUE (external_job_id, source_platform)
);

-- ============================================
-- JOB SCORES TABLE (Phase 3 — pre-created)
-- ============================================
CREATE TABLE job_scores (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_score     DECIMAL(5,2) DEFAULT 0,       -- 0-100
    experience_score DECIMAL(5,2) DEFAULT 0,      -- 0-100
    salary_score    DECIMAL(5,2) DEFAULT 0,       -- 0-100
    total_score     DECIMAL(5,2) DEFAULT 0,       -- weighted composite
    scored_at       TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_job_user_score UNIQUE (job_id, user_id)
);

-- ============================================
-- JOB APPLICATIONS TABLE (Phase 5 — pre-created)
-- ============================================
CREATE TABLE job_applications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          VARCHAR(50) DEFAULT 'pending', -- pending, applied, rejected, interview, offer
    applied_at      TIMESTAMPTZ,
    resume_used     TEXT,                          -- path or identifier of resume version
    cover_letter    TEXT,
    platform_response JSONB DEFAULT '{}',         -- any response from the platform
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_job_user_application UNIQUE (job_id, user_id)
);

-- ============================================
-- SCRAPING RUNS TABLE — Audit trail
-- ============================================
CREATE TABLE scrape_runs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id),
    platform        VARCHAR(50) NOT NULL,
    search_params   JSONB NOT NULL,               -- filters used
    jobs_found      INTEGER DEFAULT 0,
    jobs_new        INTEGER DEFAULT 0,
    jobs_updated    INTEGER DEFAULT 0,
    jobs_skipped    INTEGER DEFAULT 0,
    status          VARCHAR(50) DEFAULT 'running', -- running, completed, failed
    error_message   TEXT,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

-- ============================================
-- INDEXES — Performance critical
-- ============================================

-- Jobs: search by title (trigram for fuzzy search)
CREATE INDEX idx_jobs_title_trgm ON jobs USING gin (title gin_trgm_ops);

-- Jobs: filter by location
CREATE INDEX idx_jobs_location ON jobs (location);

-- Jobs: filter by platform + active status
CREATE INDEX idx_jobs_platform_active ON jobs (source_platform, is_active);

-- Jobs: filter by experience range
CREATE INDEX idx_jobs_experience ON jobs (experience_min, experience_max);

-- Jobs: search within skills JSONB array
CREATE INDEX idx_jobs_skills ON jobs USING gin (skills);

-- Jobs: sort by recency
CREATE INDEX idx_jobs_scraped_at ON jobs (scraped_at DESC);
CREATE INDEX idx_jobs_posted_date ON jobs (posted_date DESC);

-- Job scores: lookup by user
CREATE INDEX idx_scores_user_total ON job_scores (user_id, total_score DESC);

-- Applications: lookup by user + status
CREATE INDEX idx_applications_user_status ON job_applications (user_id, status);

-- Scrape runs: recent runs per user
CREATE INDEX idx_scrape_runs_user ON scrape_runs (user_id, started_at DESC);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_applications_updated_at
    BEFORE UPDATE ON job_applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
