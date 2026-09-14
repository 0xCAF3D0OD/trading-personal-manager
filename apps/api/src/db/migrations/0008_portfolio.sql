-- Portefeuille Kraken (docs/06, C.3) : un relevé conservé par jour et par actif, le dernier de la journée.
CREATE TABLE portfolio_snapshots (
  id                INTEGER PRIMARY KEY,
  ts                INTEGER NOT NULL,
  day               TEXT NOT NULL,
  asset             TEXT NOT NULL,
  kraken_code       TEXT NOT NULL,
  state             TEXT,
  balance           REAL NOT NULL,
  price_eur         REAL,
  price_usd         REAL,
  price_source      TEXT NOT NULL,
  onchain_price_usd REAL,
  value_eur         REAL,
  value_usd         REAL,
  token_id          INTEGER REFERENCES tokens(id),
  UNIQUE(day, kraken_code)
);
CREATE INDEX idx_portfolio_day ON portfolio_snapshots(day, asset);
