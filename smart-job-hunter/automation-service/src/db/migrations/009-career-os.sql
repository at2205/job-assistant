-- =============================================
-- Migration 009: Career Operating System
-- Interview pipeline, recruiter management,
-- follow-ups, company intel, calendar, analytics
-- =============================================

-- 1. Interview Pipeline
CREATE TABLE IF NOT EXISTS interview_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  job_id UUID NOT NULL REFERENCES jobs(id),
  application_id UUID REFERENCES job_applications(id),
  stage VARCHAR(30) NOT NULL DEFAULT 'SAVED'
    CHECK (stage IN ('SAVED','APPLIED','VIEWED','HR_SCREENING','TECHNICAL_ROUND','ASSIGNMENT','FINAL_ROUND','OFFER','REJECTED','GHOSTED')),
  notes TEXT,
  feedback TEXT,
  entered_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, job_id)
);

CREATE TABLE IF NOT EXISTS pipeline_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES interview_pipeline(id) ON DELETE CASCADE,
  from_stage VARCHAR(30),
  to_stage VARCHAR(30) NOT NULL,
  notes TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_user ON interview_pipeline(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_history ON pipeline_history(pipeline_id, changed_at);

-- 2. Recruiter Management
CREATE TABLE IF NOT EXISTS recruiters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(200) NOT NULL,
  email VARCHAR(200),
  phone VARCHAR(50),
  company VARCHAR(200),
  linkedin_url VARCHAR(500),
  notes TEXT,
  response_rate NUMERIC(5,2) DEFAULT 0,
  total_interactions INT DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recruiter_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID NOT NULL REFERENCES recruiters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  job_id UUID REFERENCES jobs(id),
  application_id UUID REFERENCES job_applications(id),
  interaction_type VARCHAR(30) NOT NULL
    CHECK (interaction_type IN ('OUTREACH','RESPONSE','FOLLOW_UP','INTERVIEW_SCHEDULE','OFFER','REJECTION','NOTE')),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')),
  content TEXT,
  channel VARCHAR(20) CHECK (channel IN ('EMAIL','LINKEDIN','PHONE','NAUKRI','OTHER')),
  interaction_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recruiters_user ON recruiters(user_id);
CREATE INDEX IF NOT EXISTS idx_recruiter_interactions ON recruiter_interactions(recruiter_id, interaction_at DESC);

-- 3. Follow-up Drafts
CREATE TABLE IF NOT EXISTS follow_up_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  job_id UUID REFERENCES jobs(id),
  recruiter_id UUID REFERENCES recruiters(id),
  application_id UUID REFERENCES job_applications(id),
  follow_up_type VARCHAR(30) NOT NULL
    CHECK (follow_up_type IN ('RECRUITER_FOLLOW_UP','THANK_YOU','APPLICATION_REMINDER','NETWORKING','STATUS_CHECK')),
  subject VARCHAR(300),
  content TEXT NOT NULL,
  tone VARCHAR(20) DEFAULT 'professional',
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','reviewed','sent','skipped')),
  generated_by VARCHAR(30),
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_user ON follow_up_drafts(user_id, status);

-- 4. Company Intelligence
CREATE TABLE IF NOT EXISTS company_intel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  company_name VARCHAR(200) NOT NULL,
  total_applications INT DEFAULT 0,
  responses_received INT DEFAULT 0,
  interviews_given INT DEFAULT 0,
  offers_received INT DEFAULT 0,
  rejections INT DEFAULT 0,
  avg_response_days NUMERIC(5,1),
  avg_hiring_cycle_days NUMERIC(5,1),
  response_rate NUMERIC(5,2) DEFAULT 0,
  notes TEXT,
  last_applied_at TIMESTAMPTZ,
  last_response_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, company_name)
);

CREATE INDEX IF NOT EXISTS idx_company_intel_user ON company_intel(user_id);

-- 5. Interview Prep
CREATE TABLE IF NOT EXISTS interview_prep (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  job_id UUID NOT NULL REFERENCES jobs(id),
  prep_type VARCHAR(30) NOT NULL
    CHECK (prep_type IN ('TECHNICAL','HR','DSA','SYSTEM_DESIGN','COMPANY_SPECIFIC','BEHAVIORAL')),
  questions JSONB NOT NULL DEFAULT '[]',
  suggested_answers JSONB DEFAULT '[]',
  weak_areas JSONB DEFAULT '[]',
  provider_used VARCHAR(30),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, job_id, prep_type)
);

-- 6. Calendar / Reminders
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  job_id UUID REFERENCES jobs(id),
  recruiter_id UUID REFERENCES recruiters(id),
  reminder_type VARCHAR(30) NOT NULL
    CHECK (reminder_type IN ('INTERVIEW','FOLLOW_UP','ASSIGNMENT_DUE','OFFER_DEADLINE','CUSTOM')),
  title VARCHAR(300) NOT NULL,
  description TEXT,
  remind_at TIMESTAMPTZ NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id, remind_at)
  WHERE NOT is_completed;

-- 7. Weekly Career Reports
ALTER TABLE weekly_analytics
  ADD COLUMN IF NOT EXISTS interviews_scheduled INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS responses_received_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejection_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offer_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_response_days NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS top_companies JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS pipeline_summary JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS career_score INT DEFAULT 0;

-- 8. Rejection Analysis
CREATE TABLE IF NOT EXISTS rejection_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  job_id UUID NOT NULL REFERENCES jobs(id),
  application_id UUID REFERENCES job_applications(id),
  likely_reasons JSONB NOT NULL DEFAULT '[]',
  missing_skills JSONB DEFAULT '[]',
  resume_suggestions JSONB DEFAULT '[]',
  ats_gap_analysis JSONB DEFAULT '{}',
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, job_id)
);

-- 9. AI Career Coach
CREATE TABLE IF NOT EXISTS career_coaching (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  coaching_type VARCHAR(30) NOT NULL
    CHECK (coaching_type IN ('PROFILE_REVIEW','SALARY_ADVICE','ROLE_TARGETING','SKILL_ROADMAP','READINESS_SCORE','WEEKLY_SUMMARY')),
  advice JSONB NOT NULL,
  readiness_score INT,
  provider_used VARCHAR(30),
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update job_applications for richer pipeline tracking
ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS recruiter_id UUID REFERENCES recruiters(id),
  ADD COLUMN IF NOT EXISTS last_stage VARCHAR(30),
  ADD COLUMN IF NOT EXISTS response_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interview_count INT DEFAULT 0;
