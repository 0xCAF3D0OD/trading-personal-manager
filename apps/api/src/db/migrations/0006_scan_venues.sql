-- Plateformes d'échange par token du scanner (docs/05, demande du 14/09).
-- DEX : connus par adresse de pool (déjà dans les métriques). CEX : uniquement via la fiche CoinGecko
-- du token, identifiée par GeckoTerminal (coingecko_coin_id), jamais par simple correspondance de symbole.
ALTER TABLE scan_token_facts ADD COLUMN coingecko_id TEXT;
ALTER TABLE scan_token_facts ADD COLUMN cex_venues TEXT;
ALTER TABLE scan_token_facts ADD COLUMN cex_checked_at INTEGER;
