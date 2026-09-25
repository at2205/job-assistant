-- =============================================
-- 008: Interview Optimization Layer
-- =============================================

-- ATS Analysis results
CREATE TABLE IF NOT EXISTS ats_analysis (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    ats_score       DECIMAL(5,2) NOT NULL DEFAULT 0,
    keyword_match_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
    matched_keywords JSONB DEFAULT '[]',
    missing_keywords JSONB DEFAULT '[]',
    priority        VARCHAR(20) NOT NULL DEFAULT 'LOW'
                    CHECK (priority IN ('HIGH', 'GOOD', 'LOW', 'SKIP')),
    interview_probability DECIMAL(5,2) DEFAULT 0,
    skip_reason     TEXT,
    analyzed_at     TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_ats_user_job UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_ats_user_priority ON ats_analysis (user_id, priority, ats_score DESC);
CREATE INDEX IF NOT EXISTS idx_ats_user_interview ON ats_analysis (user_id, interview_probability DESC);

-- Job quality flags (spam detection, recruiter activity)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS quality_flags JSONB DEFAULT '{}';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_spam BOOLEAN DEFAULT FALSE;

-- Track which resume variant was used
ALTER TABLE generated_content ADD COLUMN IF NOT EXISTS variant VARCHAR(30) DEFAULT 'standard';

-- Weekly analytics snapshots
CREATE TABLE IF NOT EXISTS weekly_analytics (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start      DATE NOT NULL,
    jobs_scraped    INTEGER DEFAULT 0,
    jobs_scored     INTEGER DEFAULT 0,
    applications_sent INTEGER DEFAULT 0,
    responses_received INTEGER DEFAULT 0,
    avg_ats_score   DECIMAL(5,2) DEFAULT 0,
    top_requested_skills JSONB DEFAULT '[]',
    missing_skills_trend JSONB DEFAULT '[]',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_weekly_user UNIQUE (user_id, week_start)
);
