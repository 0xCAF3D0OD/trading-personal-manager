-- Watchlist -----------------------------------------------------------------
CREATE TABLE tokens (
  id              INTEGER PRIMARY KEY,
  address         TEXT NOT NULL UNIQUE,
  symbol          TEXT,
  name            TEXT,
  decimals        INTEGER NOT NULL,
  program         TEXT NOT NULL CHECK (program IN ('spl-token', 'token-2022')),
  created_at      INTEGER,
  created_at_source TEXT,
  creator_address TEXT,
  creator_source  TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  added_at        INTEGER NOT NULL,
  archived_at     INTEGER
);

-- Santé structurelle --------------------------------------------------------
CREATE TABLE token_health (
  token_id              INTEGER PRIMARY KEY REFERENCES tokens(id),
  mint_authority        TEXT,
  freeze_authority      TEXT,
  token2022_extensions  TEXT NOT NULL DEFAULT '[]',
  lp_locked             INTEGER,
  lp_locked_pct         REAL,
  lp_lock_protocol      TEXT,
  lp_lock_source        TEXT NOT NULL DEFAULT 'unavailable',
  checked_at            INTEGER NOT NULL
);

-- Séries rapides (15 min), sources gratuites --------------------------------
CREATE TABLE market_snapshots (
  id                INTEGER PRIMARY KEY,
  token_id          INTEGER NOT NULL REFERENCES tokens(id),
  ts                INTEGER NOT NULL,
  price_usd         REAL,
  price_source      TEXT NOT NULL,
  price_alt_usd     REAL,
  price_alt_source  TEXT,
  market_cap_usd    REAL,
  fdv_usd           REAL,
  volume_24h_usd    REAL,
  liquidity_usd     REAL,
  supply_circ       REAL,
  supply_total      REAL,
  supply_source     TEXT NOT NULL
);
CREATE INDEX idx_market_token_ts ON market_snapshots(token_id, ts);

-- Séries lentes (1 × / jour) ------------------------------------------------
CREATE TABLE holder_snapshots (
  id                INTEGER PRIMARY KEY,
  token_id          INTEGER NOT NULL REFERENCES tokens(id),
  ts                INTEGER NOT NULL,
  day               TEXT NOT NULL,
  holder_count      INTEGER,
  top5_pct          REAL,
  top10_pct         REAL,
  top20_pct         REAL,
  top50_pct         REAL,
  top100_pct        REAL,
  buckets           TEXT,
  excluded_accounts TEXT,
  top_holders       TEXT,
  source            TEXT NOT NULL,
  truncated         INTEGER NOT NULL DEFAULT 0,
  cu_spent          INTEGER NOT NULL DEFAULT 0,
  UNIQUE(token_id, day)
);

-- Activités du créateur -----------------------------------------------------
CREATE TABLE creator_activities (
  id            INTEGER PRIMARY KEY,
  token_id      INTEGER NOT NULL REFERENCES tokens(id),
  tx_signature  TEXT NOT NULL,
  ts            INTEGER NOT NULL,
  kind          TEXT NOT NULL,
  description   TEXT,
  amount        REAL,
  amount_usd    REAL,
  source        TEXT NOT NULL,
  raw           TEXT,
  UNIQUE(token_id, tx_signature)
);
CREATE INDEX idx_creator_token_ts ON creator_activities(token_id, ts);

-- Journal de discipline : append-only ---------------------------------------
CREATE TABLE plans (
  id                  INTEGER PRIMARY KEY,
  token_id            INTEGER NOT NULL REFERENCES tokens(id),
  version             INTEGER NOT NULL,
  supersedes_plan_id  INTEGER REFERENCES plans(id),
  created_at          INTEGER NOT NULL,
  entry_price         REAL NOT NULL,
  take_profit_price   REAL NOT NULL,
  stop_loss_price     REAL NOT NULL,
  amount_usd          REAL NOT NULL,
  accepts_total_loss  INTEGER NOT NULL CHECK (accepts_total_loss = 1),
  note                TEXT,
  UNIQUE(token_id, version)
);
CREATE TRIGGER plans_no_update BEFORE UPDATE ON plans
BEGIN
  SELECT RAISE(ABORT, 'Les plans sont immuables : créez une nouvelle version.');
END;
CREATE TRIGGER plans_no_delete BEFORE DELETE ON plans
BEGIN
  SELECT RAISE(ABORT, 'Les plans sont immuables : ils ne peuvent pas être supprimés.');
END;

-- Alertes -------------------------------------------------------------------
CREATE TABLE alerts (
  id              INTEGER PRIMARY KEY,
  token_id        INTEGER NOT NULL REFERENCES tokens(id),
  type            TEXT NOT NULL,
  threshold       REAL,
  plan_id         INTEGER REFERENCES plans(id),
  enabled         INTEGER NOT NULL DEFAULT 1,
  cooldown_s      INTEGER NOT NULL DEFAULT 21600,
  last_fired_at   INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_alerts_token ON alerts(token_id, enabled);

CREATE TABLE alert_events (
  id              INTEGER PRIMARY KEY,
  alert_id        INTEGER NOT NULL REFERENCES alerts(id),
  fired_at        INTEGER NOT NULL,
  observed        REAL,
  threshold       REAL,
  rule_text       TEXT NOT NULL,
  payload         TEXT,
  delivered_to    TEXT NOT NULL DEFAULT '[]',
  acknowledged_at INTEGER
);
CREATE INDEX idx_alert_events_fired ON alert_events(fired_at);

-- Consommation des API externes --------------------------------------------
CREATE TABLE api_usage (
  id          INTEGER PRIMARY KEY,
  ts          INTEGER NOT NULL,
  provider    TEXT NOT NULL,
  endpoint    TEXT NOT NULL,
  cu          INTEGER NOT NULL DEFAULT 0,
  status      INTEGER,
  cache_hit   INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER
);
CREATE INDEX idx_usage_ts ON api_usage(ts);
CREATE INDEX idx_usage_provider_ts ON api_usage(provider, ts);

-- Cache persistant ----------------------------------------------------------
CREATE TABLE cache_entries (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  source      TEXT NOT NULL,
  fetched_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX idx_cache_expires ON cache_entries(expires_at);

-- Journal des jobs ----------------------------------------------------------
CREATE TABLE job_runs (
  name        TEXT PRIMARY KEY,
  last_run_at INTEGER,
  last_status TEXT,
  last_error  TEXT
);
