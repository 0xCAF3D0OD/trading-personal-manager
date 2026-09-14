-- Métriques affinées : la série à 15 min est enrichie, pas dupliquée.
ALTER TABLE market_snapshots ADD COLUMN pct_m5 REAL;
ALTER TABLE market_snapshots ADD COLUMN pct_h1 REAL;
ALTER TABLE market_snapshots ADD COLUMN pct_h6 REAL;
ALTER TABLE market_snapshots ADD COLUMN pct_h24 REAL;
ALTER TABLE market_snapshots ADD COLUMN momentum_state TEXT;
ALTER TABLE market_snapshots ADD COLUMN price_spread_pct REAL;
ALTER TABLE market_snapshots ADD COLUMN mcap_source_name TEXT;
ALTER TABLE market_snapshots ADD COLUMN mcap_source_is_fdv INTEGER;
ALTER TABLE market_snapshots ADD COLUMN mcap_local_usd REAL;
ALTER TABLE market_snapshots ADD COLUMN fdv_local_usd REAL;
ALTER TABLE market_snapshots ADD COLUMN mcap_gap_pct REAL;
ALTER TABLE market_snapshots ADD COLUMN volume_source TEXT;
ALTER TABLE market_snapshots ADD COLUMN liquidity_source TEXT;
ALTER TABLE market_snapshots ADD COLUMN liquidity_to_mcap_pct REAL;
ALTER TABLE market_snapshots ADD COLUMN volume_to_mcap REAL;
ALTER TABLE market_snapshots ADD COLUMN pools TEXT;
ALTER TABLE market_snapshots ADD COLUMN pools_count INTEGER;
ALTER TABLE market_snapshots ADD COLUMN liquidity_total_usd REAL;
ALTER TABLE market_snapshots ADD COLUMN supply_minted REAL;
ALTER TABLE market_snapshots ADD COLUMN supply_incinerated REAL;
ALTER TABLE market_snapshots ADD COLUMN supply_net REAL;
ALTER TABLE market_snapshots ADD COLUMN supply_incinerator_addresses TEXT;

-- Slippage : calculé à la demande (cache mémoire) et une fois par jour pour l'historique.
CREATE TABLE slippage_snapshots (
  id            INTEGER PRIMARY KEY,
  token_id      INTEGER NOT NULL REFERENCES tokens(id),
  ts            INTEGER NOT NULL,
  order_usd     REAL NOT NULL,
  side          TEXT NOT NULL DEFAULT 'sell',
  impact_pct    REAL,
  method        TEXT NOT NULL,
  route         TEXT,
  pool_address  TEXT,
  UNIQUE(token_id, ts, order_usd, side)
);
CREATE INDEX idx_slippage_token_ts ON slippage_snapshots(token_id, ts);
