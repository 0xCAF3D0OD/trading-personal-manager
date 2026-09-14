-- Correctif : l'encodeur base58 produisait 33 '1' pour une adresse nulle, stockée comme créateur
-- puis envoyée à Helius (HTTP 400). On efface ces créateurs, les wallets auto dérivés et le cache
-- de résolution pour que le créateur soit recalculé proprement.
DELETE FROM team_wallets
 WHERE source = 'auto'
   AND (address = '111111111111111111111111111111111' OR address = '11111111111111111111111111111111');
UPDATE tokens
   SET creator_address = NULL, creator_source = NULL
 WHERE creator_address = '111111111111111111111111111111111'
    OR creator_address = '11111111111111111111111111111111';
DELETE FROM cache_entries WHERE key LIKE 'creator:%' OR key LIKE 'creator-activity:%';
