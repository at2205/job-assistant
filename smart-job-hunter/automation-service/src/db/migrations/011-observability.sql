-- Observability: ingestion logs, selector failures, scraping metrics

CREATE TABLE IF NOT EXISTS ingestion_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scrape_run_id UUID REFERENCES scrape_runs(id),
  platform VARCHAR(50) NOT NULL,
  event_type VARCHAR(50) NOT NULL,  -- 'job_scraped', 'job_persisted', 'selector_failure', 'retry', 'error'
  message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS selector_failures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform VARCHAR(50) NOT NULL,
  page_url TEXT,
  selector TEXT NOT NULL,
  expected_action VARCHAR(100),  -- 'click_edit', 'fill_input', 'find_element'
  error_message TEXT,
  screenshot_path TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scraping_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scrape_run_id UUID REFERENCES scrape_runs(id),
  platform VARCHAR(50) NOT NULL,
  metric_name VARCHAR(100) NOT NULL,  -- 'pages_scraped', 'jobs_found', 'db_writes', 'duration_ms', 'retries'
  metric_value NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_logs_platform ON ingestion_logs(platform);
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_event ON ingestion_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_created ON ingestion_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_selector_failures_platform ON selector_failures(platform);
CREATE INDEX IF NOT EXISTS idx_scraping_metrics_run ON scraping_metrics(scrape_run_id);
