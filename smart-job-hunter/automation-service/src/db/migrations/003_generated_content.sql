-- ============================================
-- Phase 4: Generated content storage
-- ============================================

CREATE TABLE IF NOT EXISTS generated_content (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    content_type    VARCHAR(30) NOT NULL CHECK (content_type IN ('resume', 'cover_letter', 'answers')),
    content         TEXT NOT NULL,
    prompt_used     TEXT,               -- store the prompt for debugging/retraining
    provider_used   VARCHAR(30),        -- which AI provider generated this
    model_used      VARCHAR(100),       -- specific model name
    generation_time_ms INTEGER,         -- latency tracking
    quality_score   DECIMAL(5,2),       -- post-processing quality estimate (0-100)
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT uq_user_job_content UNIQUE (user_id, job_id, content_type)
);

-- Lookup: "get all generated content for this user+job"
CREATE INDEX idx_gc_user_job ON generated_content (user_id, job_id);

-- Lookup: "all resumes generated for this user"
CREATE INDEX idx_gc_user_type ON generated_content (user_id, content_type);
