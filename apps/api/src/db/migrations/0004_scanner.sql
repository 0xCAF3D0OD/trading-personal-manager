-- Étage 1 : chaque pool jamais vu, avec son palier de re-vérification.
CREATE TABLE scan_pools (
  pool_address        TEXT PRIMARY KEY,
  dex_id              TEXT,
  token_address       TEXT NOT NULL,
  quote_address       TEXT,
  token_symbol        TEXT,
  token_name          TEXT,
  pool_created_at     INTEGER,
  first_seen_at       INTEGER NOT NULL,
  discovery_source    TEXT NOT NULL,
  tier                TEXT NOT NULL DEFAULT 'hot',
  next_check_at       INTEGER NOT NULL,
  last_checked_at     INTEGER,
  last_liquidity_usd  REAL,
  last_volume_h24_usd REAL,
  last_pct_h24        REAL,
  consecutive_below   INTEGER NOT NULL DEFAULT 0,
  missing_count       INTEGER NOT NULL DEFAULT 0,
  retired_at          INTEGER,
  retired_reason      TEXT
);
CREATE INDEX idx_scan_pools_due ON scan_pools(tier, next_check_at);
CREATE INDEX idx_scan_pools_token ON scan_pools(token_address);

-- Relevés successifs (pools chauds), purge 7 jours.
CREATE TABLE scan_pool_checks (
  id              INTEGER PRIMARY KEY,
  pool_address    TEXT NOT NULL REFERENCES scan_pools(pool_address),
  ts              INTEGER NOT NULL,
  price_usd       REAL,
  fdv_usd         REAL,
  market_cap_usd  REAL,
  reserve_usd     REAL,
  volume_h1_usd   REAL,
  volume_h24_usd  REAL,
  pct_h1          REAL,
  pct_h24         REAL,
  buys_h1 INTEGER, sells_h1 INTEGER, buyers_h1 INTEGER, sellers_h1 INTEGER,
  buys_h24 INTEGER, sells_h24 INTEGER, buyers_h24 INTEGER, sellers_h24 INTEGER
);
CREATE INDEX idx_scan_checks_pool_ts ON scan_pool_checks(pool_address, ts);

-- Enrichissement par token (étages 3 et 4), TTL par groupe de colonnes.
CREATE TABLE scan_token_facts (
  token_address         TEXT PRIMARY KEY,
  program               TEXT,
  mint_authority        TEXT,
  freeze_authority      TEXT,
  transfer_fee_bps      INTEGER,
  extensions            TEXT,
  supply                REAL,
  decimals              INTEGER,
  rpc_checked_at        INTEGER,
  holders_count         INTEGER,
  top10_pct             REAL,
  developer_address     TEXT,
  developer_holding_pct REAL,
  has_website           INTEGER,
  has_socials           INTEGER,
  has_description       INTEGER,
  gt_is_honeypot        TEXT,
  gt_mint_authority     TEXT,
  gt_freeze_authority   TEXT,
  gt_checked_at         INTEGER,
  creator_address       TEXT,
  creator_token_count   INTEGER,
  creator_checked_at    INTEGER
);

CREATE TABLE scan_runs (
  id                INTEGER PRIMARY KEY,
  started_at        INTEGER NOT NULL,
  finished_at       INTEGER,
  status            TEXT NOT NULL,
  settings_id       INTEGER NOT NULL,
  pools_checked     INTEGER NOT NULL DEFAULT 0,
  passed_stage2     INTEGER NOT NULL DEFAULT 0,
  passed_stage3     INTEGER NOT NULL DEFAULT 0,
  kept_count        INTEGER NOT NULL DEFAULT 0,
  api_calls         INTEGER NOT NULL DEFAULT 0,
  stage2_reasons    TEXT NOT NULL DEFAULT '{}',
  error             TEXT
);

CREATE TABLE scan_results (
  id                  INTEGER PRIMARY KEY,
  run_id              INTEGER NOT NULL REFERENCES scan_runs(id),
  pool_address        TEXT NOT NULL,
  token_address       TEXT NOT NULL,
  token_symbol        TEXT,
  token_name          TEXT,
  status              TEXT NOT NULL,
  excluded_stage      INTEGER,
  exclusion_reasons   TEXT NOT NULL DEFAULT '[]',
  structural          TEXT NOT NULL DEFAULT '[]',
  structural_passed   INTEGER,
  structural_total    INTEGER,
  flags               TEXT NOT NULL DEFAULT '[]',
  flag_count          INTEGER NOT NULL DEFAULT 0,
  unverified_count    INTEGER NOT NULL DEFAULT 0,
  metrics             TEXT NOT NULL,
  observed_at         INTEGER NOT NULL
);
CREATE INDEX idx_scan_results_run ON scan_results(run_id, status, flag_count);
CREATE INDEX idx_scan_results_token ON scan_results(token_address, observed_at);

-- Suivi rétrospectif : une ligne par token la première fois qu'il est gardé.
CREATE TABLE scan_retro (
  token_address     TEXT PRIMARY KEY,
  token_symbol      TEXT,
  first_kept_at     INTEGER NOT NULL,
  first_run_id      INTEGER NOT NULL,
  ref_price_usd     REAL NOT NULL,
  ref_mcap_usd      REAL,
  ref_mcap_is_fdv   INTEGER NOT NULL,
  ref_flag_count    INTEGER NOT NULL,
  ref_structural    TEXT,
  ref_flags         TEXT NOT NULL DEFAULT '[]',
  price_d1 REAL, price_d1_at INTEGER, status_d1 TEXT NOT NULL DEFAULT 'pending',
  price_d7 REAL, price_d7_at INTEGER, status_d7 TEXT NOT NULL DEFAULT 'pending',
  price_d30 REAL, price_d30_at INTEGER, status_d30 TEXT NOT NULL DEFAULT 'pending',
  alerted_at        INTEGER
);
CREATE INDEX idx_scan_retro_due ON scan_retro(first_kept_at);
