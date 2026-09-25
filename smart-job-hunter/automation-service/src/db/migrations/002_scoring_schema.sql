-- ============================================
-- Phase 3: Enhance job_scores with breakdown columns
-- ============================================

-- Drop the basic table from Phase 2 and recreate with full breakdown
DROP TABLE IF EXISTS job_scores CASCADE;

CREATE TABLE job_scores (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id            UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

    -- Individual dimension scores (0-100)
    skill_score       DECIMAL(5,2) NOT NULL DEFAULT 0,
    experience_score  DECIMAL(5,2) NOT NULL DEFAULT 0,
    location_score    DECIMAL(5,2) NOT NULL DEFAULT 0,
    salary_score      DECIMAL(5,2) NOT NULL DEFAULT 0,
    recency_score     DECIMAL(5,2) NOT NULL DEFAULT 0,

    -- Weighted total (0-100)
    total_score       DECIMAL(5,2) NOT NULL DEFAULT 0,

    -- Explainability: human-readable reasons
    score_breakdown   JSONB DEFAULT '{}',

    -- Metadata
    scoring_version   VARCHAR(20) DEFAULT 'v1',
    scored_at         TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_user_job_score UNIQUE (user_id, job_id),
    CONSTRAINT chk_total_range CHECK (total_score >= 0 AND total_score <= 100),
    CONSTRAINT chk_skill_range CHECK (skill_score >= 0 AND skill_score <= 100),
    CONSTRAINT chk_exp_range CHECK (experience_score >= 0 AND experience_score <= 100),
    CONSTRAINT chk_loc_range CHECK (location_score >= 0 AND location_score <= 100),
    CONSTRAINT chk_sal_range CHECK (salary_score >= 0 AND salary_score <= 100),
    CONSTRAINT chk_rec_range CHECK (recency_score >= 0 AND recency_score <= 100)
);

-- Primary lookup: "show me top jobs for this user"
CREATE INDEX idx_scores_user_total ON job_scores (user_id, total_score DESC);

-- Filter by threshold: "jobs scoring above 75 for this user"
CREATE INDEX idx_scores_user_threshold ON job_scores (user_id, total_score DESC) WHERE total_score >= 75;

-- Join optimization
CREATE INDEX idx_scores_job_id ON job_scores (job_id);

-- Add user profile fields needed for scoring (if not already present from Phase 2)
ALTER TABLE users ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS expected_salary_min INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS expected_salary_max INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_locations TEXT[] DEFAULT '{}';
