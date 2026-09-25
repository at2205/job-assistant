-- Migration 010: Add apply_hash for duplicate detection
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS apply_hash VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS idx_apply_hash ON job_applications(apply_hash) WHERE apply_hash IS NOT NULL;
