-- =============================================
-- Migration 006: SaaS Billing + Subscriptions
-- =============================================
-- Stripe-integrated billing with usage metering
-- Plans: Free, Pro ($29/mo), Agency ($99/mo)
-- =============================================

-- ---- Subscription Plans ----
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,           -- free, pro, agency
  display_name VARCHAR(100) NOT NULL,
  stripe_price_id VARCHAR(100),               -- price_xxx from Stripe
  price_cents INTEGER NOT NULL DEFAULT 0,     -- monthly price in cents
  -- Limits
  max_applications_per_day INTEGER NOT NULL DEFAULT 5,
  max_ai_generations_per_day INTEGER NOT NULL DEFAULT 10,
  max_scrape_runs_per_day INTEGER NOT NULL DEFAULT 3,
  max_saved_jobs INTEGER NOT NULL DEFAULT 100,
  max_platforms INTEGER NOT NULL DEFAULT 1,   -- 1=single, 2=multi
  features JSONB NOT NULL DEFAULT '[]',       -- feature flags
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- Seed Plans ----
INSERT INTO plans (name, display_name, price_cents, max_applications_per_day, max_ai_generations_per_day, max_scrape_runs_per_day, max_saved_jobs, max_platforms, features)
VALUES
  ('free', 'Free', 0, 5, 10, 3, 100, 1, '["basic_scoring", "manual_apply"]'),
  ('pro', 'Pro', 2900, 25, 100, 10, 1000, 2, '["auto_apply", "ai_resume", "ai_cover_letter", "priority_scoring", "export_csv"]'),
  ('agency', 'Agency', 9900, 100, 500, 50, 10000, 2, '["auto_apply", "ai_resume", "ai_cover_letter", "priority_scoring", "export_csv", "api_access", "team_management", "white_label"]')
ON CONFLICT (name) DO NOTHING;

-- ---- Subscriptions ----
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  stripe_customer_id VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  status VARCHAR(30) NOT NULL DEFAULT 'active',  -- active, past_due, cancelled, trialing
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ---- Usage Tracking (Daily Metering) ----
CREATE TABLE IF NOT EXISTS daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  applications_count INTEGER NOT NULL DEFAULT 0,
  ai_generations_count INTEGER NOT NULL DEFAULT 0,
  scrape_runs_count INTEGER NOT NULL DEFAULT 0,
  -- Unique per user per day
  UNIQUE(user_id, usage_date)
);

-- ---- Payment History ----
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_payment_id VARCHAR(100) NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  status VARCHAR(30) NOT NULL,   -- succeeded, failed, refunded
  plan_name VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- Indexes ----
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe ON payments(stripe_payment_id);

-- ---- Auto-create free subscription on user signup (trigger) ----
CREATE OR REPLACE FUNCTION auto_create_free_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO subscriptions (user_id, plan_id, status)
  SELECT NEW.id, p.id, 'active'
  FROM plans p WHERE p.name = 'free'
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_free_subscription ON users;
CREATE TRIGGER trg_auto_free_subscription
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_free_subscription();
