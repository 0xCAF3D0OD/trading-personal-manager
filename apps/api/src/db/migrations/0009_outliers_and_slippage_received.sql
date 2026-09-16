-- Correction du 16 septembre 2026 (docs/05, A.2).
-- 1. Relevés de marché aberrants : un pool DexScreener au prix faux (×4 000) avait servi de pool principal ;
--    tout relevé dont le prix s'écarte d'un facteur 20 de la médiane du token est supprimé.
CREATE TEMP TABLE med AS
  SELECT token_id, price_usd AS median FROM (
    SELECT token_id, price_usd,
           ROW_NUMBER() OVER (PARTITION BY token_id ORDER BY price_usd) AS rn,
           COUNT(*) OVER (PARTITION BY token_id) AS cnt
    FROM market_snapshots WHERE price_usd IS NOT NULL AND price_usd > 0
  ) WHERE rn = (cnt + 1) / 2;
DELETE FROM market_snapshots WHERE id IN (
  SELECT m.id FROM market_snapshots m JOIN med ON med.token_id = m.token_id
  WHERE m.price_usd > 20 * med.median OR m.price_usd * 20 < med.median
);
DROP TABLE med;

-- 2. Slippage : conserver ce que la cotation rend, pour distinguer « perte nulle » d'une cotation incohérente.
ALTER TABLE slippage_snapshots ADD COLUMN received_usd REAL;

-- 3. Résolutions de créateur vides mises en cache pour un an par erreur : on les efface pour que le repli
--    « première transaction du mint » puisse s'exécuter.
DELETE FROM cache_entries WHERE key LIKE 'creator:%' AND value LIKE '%"creator":null%';
