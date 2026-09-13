-- Réglages génériques versionnés par module -----------------------------------
CREATE TABLE app_settings (
  id                INTEGER PRIMARY KEY,
  module            TEXT NOT NULL,
  created_at        INTEGER NOT NULL,
  settings          TEXT NOT NULL,
  defaults_version  INTEGER NOT NULL,
  is_default        INTEGER NOT NULL DEFAULT 0,
  note              TEXT
);
CREATE INDEX idx_app_settings_module ON app_settings(module, id);

-- Sources suivies ----------------------------------------------------------------
CREATE TABLE watch_sources (
  id                    INTEGER PRIMARY KEY,
  token_id              INTEGER NOT NULL REFERENCES tokens(id),
  kind                  TEXT NOT NULL,
  label                 TEXT NOT NULL,
  url                   TEXT,
  handle                TEXT,
  mode                  TEXT NOT NULL DEFAULT 'html',
  api_url               TEXT,
  api_headers           TEXT,
  json_pointer          TEXT,
  discovered_endpoints  TEXT NOT NULL DEFAULT '[]',
  render_wait_ms        INTEGER,
  enabled               INTEGER NOT NULL DEFAULT 1,
  check_interval_s      INTEGER NOT NULL,
  next_check_at         INTEGER NOT NULL,
  last_checked_at       INTEGER,
  last_status           TEXT,
  last_error            TEXT,
  etag                  TEXT,
  last_modified         TEXT,
  volatile_lines        TEXT NOT NULL DEFAULT '[]',
  meta                  TEXT,
  added_at              INTEGER NOT NULL,
  note                  TEXT
);
CREATE INDEX idx_watch_sources_due ON watch_sources(enabled, next_check_at);
CREATE INDEX idx_watch_sources_token ON watch_sources(token_id);

CREATE TABLE page_checks (
  id            INTEGER PRIMARY KEY,
  source_id     INTEGER NOT NULL REFERENCES watch_sources(id),
  checked_at    INTEGER NOT NULL,
  http_status   INTEGER,
  content_hash  TEXT,
  changed       INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL,
  snapshot_id   INTEGER
);
CREATE INDEX idx_page_checks_source_ts ON page_checks(source_id, checked_at);

CREATE TABLE page_snapshots (
  id              INTEGER PRIMARY KEY,
  source_id       INTEGER NOT NULL REFERENCES watch_sources(id),
  fetched_at      INTEGER NOT NULL,
  mode            TEXT NOT NULL,
  content_hash    TEXT NOT NULL,
  text_lines      TEXT NOT NULL,
  title           TEXT,
  raw_body        BLOB,
  raw_size        INTEGER,
  final_url       TEXT
);
CREATE INDEX idx_page_snapshots_source_ts ON page_snapshots(source_id, fetched_at);

CREATE TABLE page_changes (
  id                        INTEGER PRIMARY KEY,
  source_id                 INTEGER NOT NULL REFERENCES watch_sources(id),
  from_snapshot_id          INTEGER NOT NULL REFERENCES page_snapshots(id),
  to_snapshot_id            INTEGER NOT NULL REFERENCES page_snapshots(id),
  detected_at               INTEGER NOT NULL,
  severity                  TEXT NOT NULL,
  hunks                     TEXT NOT NULL,
  numeric_changes           TEXT NOT NULL DEFAULT '[]',
  announced                 INTEGER,
  announced_claim_id        INTEGER,
  announce_check_due_at     INTEGER,
  unannounced_flag          INTEGER NOT NULL DEFAULT 0,
  alert_sent_at             INTEGER,
  unannounced_alert_sent_at INTEGER,
  reviewed_at               INTEGER,
  review_note               TEXT
);
CREATE INDEX idx_page_changes_source ON page_changes(source_id, detected_at);
CREATE INDEX idx_page_changes_due ON page_changes(announced, announce_check_due_at);

-- Engagements --------------------------------------------------------------------
CREATE TABLE claims (
  id                  INTEGER PRIMARY KEY,
  token_id            INTEGER NOT NULL REFERENCES tokens(id),
  source_id           INTEGER REFERENCES watch_sources(id),
  origin              TEXT NOT NULL,
  published_at        INTEGER NOT NULL,
  captured_at         INTEGER NOT NULL,
  url                 TEXT,
  author              TEXT,
  text                TEXT NOT NULL,
  type                TEXT NOT NULL,
  subtype             TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  due_at              INTEGER,
  extracted_numbers   TEXT NOT NULL DEFAULT '[]',
  verification_kind   TEXT,
  verification_ref    TEXT,
  verification_note   TEXT,
  resolved_at         INTEGER,
  resolved_by         TEXT,
  linked_change_id    INTEGER REFERENCES page_changes(id)
);
CREATE INDEX idx_claims_token_ts ON claims(token_id, published_at);
CREATE INDEX idx_claims_status ON claims(token_id, status, due_at);
CREATE UNIQUE INDEX idx_claims_url_unique ON claims(token_id, url) WHERE url IS NOT NULL AND origin IN ('github_release', 'x_oembed');
-- Un engagement ne se supprime jamais ; son texte ne se modifie jamais.
CREATE TRIGGER claims_no_delete BEFORE DELETE ON claims
BEGIN SELECT RAISE(ABORT, 'Les engagements ne se suppriment pas : marquez-les expirés avec une note.'); END;
CREATE TRIGGER claims_text_immutable BEFORE UPDATE OF text, published_at, origin, url ON claims
BEGIN SELECT RAISE(ABORT, 'Le texte d’un engagement est immuable.'); END;

-- Actualités tierces --------------------------------------------------------------
CREATE TABLE news_items (
  id            INTEGER PRIMARY KEY,
  token_id      INTEGER NOT NULL REFERENCES tokens(id),
  provider      TEXT NOT NULL,
  external_id   TEXT,
  published_at  INTEGER NOT NULL,
  fetched_at    INTEGER NOT NULL,
  title         TEXT NOT NULL,
  url           TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  domain        TEXT NOT NULL,
  dedup_key     TEXT NOT NULL,
  kind          TEXT NOT NULL,
  promo_flags   TEXT NOT NULL DEFAULT '[]',
  UNIQUE(token_id, dedup_key)
);
CREATE INDEX idx_news_token_ts ON news_items(token_id, published_at);
CREATE INDEX idx_news_domain ON news_items(domain, fetched_at);

-- Équipe et on-chain ----------------------------------------------------------------
CREATE TABLE team_wallets (
  id          INTEGER PRIMARY KEY,
  token_id    INTEGER NOT NULL REFERENCES tokens(id),
  address     TEXT NOT NULL,
  label       TEXT NOT NULL,
  source      TEXT NOT NULL,
  added_at    INTEGER NOT NULL,
  note        TEXT,
  UNIQUE(token_id, address)
);

CREATE TABLE onchain_actions (
  id                  INTEGER PRIMARY KEY,
  token_id            INTEGER NOT NULL REFERENCES tokens(id),
  wallet_address      TEXT NOT NULL,
  tx_signature        TEXT NOT NULL,
  ts                  INTEGER NOT NULL,
  kind                TEXT NOT NULL,
  amount              REAL,
  amount_usd          REAL,
  counterparty        TEXT,
  counterparty_label  TEXT,
  source              TEXT NOT NULL,
  raw                 TEXT,
  UNIQUE(token_id, tx_signature, wallet_address)
);
CREATE INDEX idx_onchain_token_ts ON onchain_actions(token_id, ts);

CREATE TABLE supply_events (
  id            INTEGER PRIMARY KEY,
  token_id      INTEGER NOT NULL REFERENCES tokens(id),
  ts_from       INTEGER NOT NULL,
  ts_to         INTEGER NOT NULL,
  supply_before REAL NOT NULL,
  supply_after  REAL NOT NULL,
  delta         REAL NOT NULL,
  delta_pct     REAL NOT NULL,
  kind          TEXT NOT NULL
);
CREATE INDEX idx_supply_events_token ON supply_events(token_id, ts_to);

CREATE TABLE address_labels (
  address     TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  source      TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
