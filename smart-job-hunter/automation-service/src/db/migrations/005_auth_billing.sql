-- =============================================
-- Phase 7: Auth + Billing tables
-- =============================================

-- Extend users table with auth fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) DEFAULT 'free'
    CHECK (plan IN ('free', 'pro', 'enterprise'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ---- Refresh Tokens ----
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(64) NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    revoked         BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_rt_user ON refresh_tokens (user_id) WHERE revoked = FALSE;
CREATE INDEX idx_rt_expires ON refresh_tokens (expires_at) WHERE revoked = FALSE;

-- ---- Usage Tracking (for billing) ----
CREATE TABLE IF NOT EXISTS usage_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action          VARCHAR(30) NOT NULL CHECK (action IN ('scrape', 'score', 'generate', 'apply')),
    count           INTEGER DEFAULT 1,
    period          DATE DEFAULT CURRENT_DATE,

    CONSTRAINT uq_usage_per_day UNIQUE (user_id, action, period)
);

CREATE INDEX idx_usage_user_period ON usage_log (user_id, period);

-- ---- API Keys (for programmatic access) ----
CREATE TABLE IF NOT EXISTS api_keys (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash        VARCHAR(64) NOT NULL UNIQUE,
    name            VARCHAR(50),
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    is_active       BOOLEAN DEFAULT TRUE
);
