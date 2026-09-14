# Scanner de nouveaux tokens — schéma de données et pipeline de filtrage

> Document de cadrage. Version 0.2 — 2026-09-14. **Implémenté** avec les six propositions par défaut du § 11 (aucun avis contraire reçu). Écarts : les exclusions d'étage 3 gardent la même rétention que les cas proches (7 jours) ; l'alerte zéro drapeau est rattachée à un token technique « SCANNER » archivé quand le token n'est pas encore surveillé.
> Le scanner élimine, il ne promeut pas. Aucun classement par performance, aucun objectif de prix, aucun lien d'achat.

---

## 1. Ce que la documentation à jour change dans le design

Vérifié le 2026-09-13 sur docs.coingecko.com et geckoterminal.com.

| Point vérifié | Constat | Conséquence |
|---|---|---|
| `GET /onchain/networks/solana/new_pools` | 20 pools par page, **10 pages max** en démo, **ne contient que les pools créés depuis moins de 48 h**, cache 60 s | La découverte ne suffit pas : un token âgé de 6 h à 30 j doit être **re-vérifié depuis notre base**, pas depuis ce flux. |
| `GET /onchain/networks/solana/pools/multi/{addresses}` | Jusqu'à **30 adresses par appel** en démo (50 en plan payant), mêmes attributs qu'un pool unique | C'est l'endpoint central de l'étage 2 : un appel re-évalue 30 pools stockés. |
| `GET /onchain/networks/solana/tokens/{address}/info` | Renvoie `mint_authority` et `freeze_authority` (yes/no), `holders.count` et `holders.distribution_percentage.top_10`, `developer_address`, `developer_holding_percentage`, `websites`, `twitter_handle`, `telegram_handle`, `discord_url`, `description`, `is_honeypot` | **Un seul appel** couvre l'essentiel des étages 3 et 4. Le RPC reste l'autorité pour l'exclusion (mint / freeze / frais Token-2022), l'info token sert aux drapeaux. |
| `GET /onchain/networks/solana/tokens/multi/{addresses}` | 30 adresses, prix, FDV, capitalisation, volume 24 h, pool le plus liquide | Sert au **suivi rétrospectif** J+1 / J+7 / J+30 : 30 tokens par appel. |
| `GET /onchain/networks/solana/trending_pools?duration=1h\|6h\|24h` | 20 par page, 10 pages max | Second canal de découverte : un token à +100 % avec 100 k$ de volume y figure presque toujours. |
| `market_cap_usd` | `null` pour les tokens non vérifiés | Traité explicitement, voir § 4.2. |
| Plan démo CoinGecko | **10 000 crédits par mois**, 1 crédit par réponse 200, header `x-cg-demo-api-key` | 10 000 / 30 j ≈ **330 appels par jour**. Un polling toutes les 5 min de 5 pages consomme à lui seul 1 440 appels par jour. **Le plan démo ne peut pas porter la découverte.** |
| API publique GeckoTerminal `https://api.geckoterminal.com/api/v2` | Mêmes chemins (sans le préfixe `/onchain`), **sans clé**, limite annoncée de 10 appels par minute, aucun plafond mensuel documenté | 10 / min = 14 400 / jour, soit 40 fois le budget démo. |

### Décision proposée : deux voies, même schéma de réponse

- **Voie principale : GeckoTerminal public** (`api.geckoterminal.com/api/v2`), sans clé, pour la découverte, la re-vérification et l'enrichissement. Cadencé par une file d'attente interne à **8 appels par minute** pour rester sous la limite avec marge.
- **Voie secondaire : CoinGecko démo** (`api.coingecko.com/api/v3/onchain`, header `x-cg-demo-api-key`), utilisée uniquement si la clé est configurée, et uniquement quand la voie publique renvoie 429 de façon répétée ou pour le suivi rétrospectif (quelques appels par jour). Budget mensuel suivi dans `api_usage` comme pour Solscan.

Les deux voies partagent le même adaptateur `GeckoTerminalSource` : seuls la base URL, le header et le compteur de crédits diffèrent. **À valider** : si tu préfères la clé démo comme voie principale, il faudra descendre la découverte à un passage toutes les 30 minutes sur 2 pages, ce qui manque des tokens.

---

## 2. Vue d'ensemble du pipeline

```
                 toutes les 5 min                       toutes les 5 min (même tick, après la découverte)
 ┌──────────────────────────────┐        ┌──────────────────────────────────────────────────────────────┐
 │ Étage 1 · Découverte         │        │ Étage 2 · Filtres de performance                             │
 │ new_pools p.1–5              │──────▶ │ re-vérification des pools stockés par lots de 30             │
 │ trending 1h/6h/24h p.1–2     │  base  │ (paliers de fraîcheur : chaud 15 min, tiède 2 h, froid 24 h) │
 │ dédup. par adresse de pool   │        │ → candidats                                                  │
 └──────────────────────────────┘        └──────────────────────────────┬───────────────────────────────┘
                                                                        │ quelques dizaines par heure au plus
                                         ┌──────────────────────────────▼───────────────────────────────┐
                                         │ Étage 3 · Filtres structurels éliminatoires                  │
                                         │ RPC getAccountInfo(mint) : mint / freeze / Token-2022 frais  │
                                         │ ratio volume / capitalisation, liquidité / capitalisation    │
                                         └──────────────────────────────┬───────────────────────────────┘
                                                                        │
                                         ┌──────────────────────────────▼───────────────────────────────┐
                                         │ Étage 4 · Drapeaux (signalés, non éliminatoires)             │
                                         │ tokens/{mint}/info : top 10, dev, socials, description       │
                                         │ transactions h1 : asymétrie, bots · h1 vs h24 : décélération │
                                         │ Helius DAS (optionnel) : créateur en série                   │
                                         └──────────────────────────────┬───────────────────────────────┘
                                                                        │
                                         ┌──────────────────────────────▼───────────────────────────────┐
                                         │ Étage 5 · Résultat explicite                                 │
                                         │ filtres passés n/5 · liste des drapeaux · horodatage         │
                                         │ tri : drapeaux croissants, puis liquidité décroissante       │
                                         │ alerte si 5/5 et 0 drapeau et créateur vérifié, une fois     │
                                         └──────────────────────────────────────────────────────────────┘
```

Chaque étage écrit dans la base. Rien n'est recalculé côté navigateur : l'interface lit le dernier `scan_run` et ses résultats.

---

## 3. Schéma de données

Sept tables, préfixées `scan_` pour rester séparées du module de surveillance. Les migrations viennent après `0001_init.sql`.

```sql
-- Réglages : une ligne par version, la plus récente fait foi.
-- Chaque scan_run mémorise l'id du réglage utilisé : on sait toujours quels seuils ont produit quel résultat.
CREATE TABLE scan_settings (
  id            INTEGER PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  settings      TEXT NOT NULL,              -- JSON, voir § 4.1
  note          TEXT
);

-- Étage 1 : chaque pool jamais vu, avec son palier de re-vérification.
CREATE TABLE scan_pools (
  pool_address        TEXT PRIMARY KEY,
  dex_id              TEXT,                 -- 'pumpfun' | 'pumpswap' | 'raydium' | 'meteora' | 'orca' | …
  token_address       TEXT NOT NULL,        -- le token étudié (côté non-quote du pool)
  quote_address       TEXT,                 -- SOL / USDC / USDT
  token_symbol        TEXT,
  token_name          TEXT,
  pool_created_at     INTEGER,              -- fourni par l'API
  first_seen_at       INTEGER NOT NULL,
  discovery_source    TEXT NOT NULL,        -- 'new_pools' | 'trending_1h' | 'trending_6h' | 'trending_24h'
  tier                TEXT NOT NULL DEFAULT 'hot',   -- 'hot' | 'warm' | 'cold' | 'retired'
  next_check_at       INTEGER NOT NULL,
  last_checked_at     INTEGER,
  last_liquidity_usd  REAL,
  last_volume_h24_usd REAL,
  last_pct_h24        REAL,
  consecutive_below   INTEGER NOT NULL DEFAULT 0,    -- passages consécutifs sous les seuils de liquidité / volume
  retired_at          INTEGER,
  retired_reason      TEXT                  -- 'age_max' | 'dormant' | 'pool_gone'
);
CREATE INDEX idx_scan_pools_due ON scan_pools(tier, next_check_at);
CREATE INDEX idx_scan_pools_token ON scan_pools(token_address);

-- Relevés successifs d'un pool (pools 'hot' uniquement, purge après 7 jours).
-- Sert au drapeau « prix qui stagne » et au suivi rétrospectif à court terme.
CREATE TABLE scan_pool_checks (
  id              INTEGER PRIMARY KEY,
  pool_address    TEXT NOT NULL REFERENCES scan_pools(pool_address),
  ts              INTEGER NOT NULL,
  price_usd       REAL,
  fdv_usd         REAL,
  market_cap_usd  REAL,                     -- NULL conservé tel quel
  reserve_usd     REAL,
  volume_h1_usd   REAL,
  volume_h24_usd  REAL,
  pct_h1          REAL,
  pct_h24         REAL,
  buys_h1         INTEGER, sells_h1 INTEGER, buyers_h1 INTEGER, sellers_h1 INTEGER,
  buys_h24        INTEGER, sells_h24 INTEGER, buyers_h24 INTEGER, sellers_h24 INTEGER
);
CREATE INDEX idx_scan_checks_pool_ts ON scan_pool_checks(pool_address, ts);

-- Enrichissement par token (étages 3 et 4), mis en cache avec TTL par champ.
CREATE TABLE scan_token_facts (
  token_address         TEXT PRIMARY KEY,
  -- RPC (TTL 24 h) : autorité pour l'exclusion
  program               TEXT,               -- 'spl-token' | 'token-2022'
  mint_authority        TEXT,               -- NULL = révoquée
  freeze_authority      TEXT,               -- NULL = absente
  transfer_fee_bps      INTEGER,            -- NULL si pas d'extension de frais
  extensions            TEXT,               -- JSON
  supply                REAL,
  rpc_checked_at        INTEGER,
  -- GeckoTerminal tokens/{mint}/info (TTL 6 h) : drapeaux
  holders_count         INTEGER,
  top10_pct             REAL,
  developer_address     TEXT,
  developer_holding_pct REAL,
  has_website           INTEGER,
  has_socials           INTEGER,
  has_description       INTEGER,
  gt_is_honeypot        TEXT,               -- 'true' | 'false' | 'unknown'
  gt_checked_at         INTEGER,
  -- Helius DAS (TTL 7 j) : créateur en série
  creator_address       TEXT,               -- Metaplex verified creator, sinon developer_address
  creator_token_count   INTEGER,            -- NULL = non vérifié (Helius absent)
  creator_checked_at    INTEGER
);

-- Une exécution du pipeline.
CREATE TABLE scan_runs (
  id                INTEGER PRIMARY KEY,
  started_at        INTEGER NOT NULL,
  finished_at       INTEGER,
  status            TEXT NOT NULL,          -- 'ok' | 'partial' | 'rate_limited' | 'error'
  settings_id       INTEGER NOT NULL REFERENCES scan_settings(id),
  pools_checked     INTEGER NOT NULL DEFAULT 0,
  passed_stage2     INTEGER NOT NULL DEFAULT 0,
  passed_stage3     INTEGER NOT NULL DEFAULT 0,
  kept_count        INTEGER NOT NULL DEFAULT 0,
  api_calls         INTEGER NOT NULL DEFAULT 0,
  stage2_reasons    TEXT,                   -- JSON : compteur par motif d'exclusion, ex. {"liquidity_min": 812, "volume_min": 1 203, …}
  error             TEXT
);

-- Résultats d'une exécution : les tokens gardés ET les exclus des étages 2 (cas proches) et 3.
CREATE TABLE scan_results (
  id                  INTEGER PRIMARY KEY,
  run_id              INTEGER NOT NULL REFERENCES scan_runs(id),
  pool_address        TEXT NOT NULL,
  token_address       TEXT NOT NULL,
  token_symbol        TEXT,
  status              TEXT NOT NULL,        -- 'kept' | 'excluded'
  excluded_stage      INTEGER,              -- 2 | 3 | NULL
  exclusion_reasons   TEXT,                 -- JSON : [{ code, label, observed, threshold }]
  structural_passed   INTEGER,              -- ex. 5
  structural_total    INTEGER,              -- ex. 5
  flags               TEXT NOT NULL DEFAULT '[]',   -- JSON : [{ code, label, observed, threshold, detail, verified }]
  flag_count          INTEGER NOT NULL DEFAULT 0,
  metrics             TEXT NOT NULL,        -- JSON figé : voir § 5, inclut mcap_is_fdv
  observed_at         INTEGER NOT NULL
);
CREATE INDEX idx_scan_results_run ON scan_results(run_id, status, flag_count);
CREATE INDEX idx_scan_results_token ON scan_results(token_address, observed_at);

-- Suivi rétrospectif : une ligne par token la première fois qu'il est gardé.
CREATE TABLE scan_retro (
  token_address     TEXT PRIMARY KEY,
  token_symbol      TEXT,
  first_kept_at     INTEGER NOT NULL,
  first_run_id      INTEGER NOT NULL REFERENCES scan_runs(id),
  ref_price_usd     REAL NOT NULL,          -- prix au moment où le scanner l'a remonté
  ref_mcap_usd      REAL,                   -- NULL si non vérifié
  ref_mcap_is_fdv   INTEGER NOT NULL,
  ref_flag_count    INTEGER NOT NULL,
  ref_structural    TEXT,                   -- '5/5'
  ref_flags         TEXT,                   -- JSON, pour segmenter la rétrospective par drapeau
  price_d1          REAL, price_d1_at  INTEGER, status_d1  TEXT,   -- 'pending' | 'filled' | 'unavailable'
  price_d7          REAL, price_d7_at  INTEGER, status_d7  TEXT,
  price_d30         REAL, price_d30_at INTEGER, status_d30 TEXT,
  alerted_at        INTEGER                 -- alerte « zéro drapeau » envoyée, une seule fois
);
CREATE INDEX idx_scan_retro_due ON scan_retro(first_kept_at);
```

### Pourquoi ces choix

- **`scan_pools` séparé de `scan_pool_checks`** : le premier est une liste de travail avec un palier de re-vérification, le second une série temporelle purgée à 7 jours. Sans cette séparation, la table gonfle de plusieurs milliers de lignes toutes les 5 minutes.
- **Exclusions de l'étage 2 : compteurs + cas proches, pas tout.** Plusieurs milliers de pools échouent à l'étage 2 à chaque passage. On enregistre dans `scan_runs.stage2_reasons` le compteur par motif, et dans `scan_results` uniquement les pools qui **avaient la performance demandée** (+100 %) mais ont échoué sur un autre critère. C'est exactement ce qu'il faut pour juger si les filtres sont trop agressifs, sans stocker 800 000 lignes par mois. Rétention 7 jours pour ces exclusions, illimitée pour les gardés. **À valider.**
- **Exclusions de l'étage 3 : toutes conservées**, elles sont peu nombreuses et ce sont les plus instructives.
- **`metrics` figé en JSON** dans chaque résultat : l'onglet exclus et l'historique doivent montrer ce qui a été vu à ce moment-là, pas la valeur actuelle.
- **`scan_retro` par token, pas par pool** : un token peut avoir plusieurs pools ; la question rétrospective porte sur le token. Le prix de référence est celui du **premier** passage en « gardé » : c'est le moment où le scanner te l'aurait montré.
- **`status_dN = 'unavailable'`** quand l'API ne renvoie plus le token ou que la liquidité est nulle. La rétrospective l'affiche comme **-100 % avec mention explicite**, et propose aussi le calcul qui les exclut. Les deux chiffres sont montrés.

---

## 4. Pipeline, étage par étage

### 4.1 Réglages (JSON de `scan_settings.settings`)

```json
{
  "performance": {
    "minChangeH24Pct": 100,
    "minAgeHours": 6,
    "maxAgeDays": 30,
    "minLiquidityUsd": 50000,
    "minVolumeH24Usd": 100000,
    "maxMarketCapUsd": 50000000
  },
  "structural": {
    "requireMintRevoked": true,
    "requireNoFreeze": true,
    "allowTransferFee": false,
    "maxVolumeToMcap": 5,
    "minLiquidityToMcapPct": 2
  },
  "flags": {
    "top10MaxPct": 35,
    "buyerSellerRatioMin": 3,
    "stagnantH1AbsPct": 5,
    "buysPerBuyerMin": 4,
    "creatorMaxTokens": 3,
    "decelerationFraction": 0.25,
    "developerHoldingMaxPct": 10
  },
  "discovery": {
    "newPoolsPages": 5,
    "trendingPages": 2,
    "quoteTokens": ["So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCdRE1MEB4"]
  }
}
```

Tous les seuils sont éditables dans l'interface ; « restaurer les défauts » insère une nouvelle ligne `scan_settings` avec ce JSON.

### 4.2 Étage 1 — Découverte

- Toutes les 5 minutes : `new_pools` pages 1 à 5 (100 pools). Toutes les 15 minutes : `trending_pools` en 1h, 6h et 24h, pages 1 et 2.
- Pour chaque pool : identifier le **token étudié** = le côté du pool qui n'est pas dans `discovery.quoteTokens`. Si les deux côtés sont des quotes (pool SOL/USDC) ou aucun (paire exotique), le pool est ignoré avec un compteur.
- Insertion dans `scan_pools` si inconnu (`first_seen_at = now`, `tier = 'hot'`, `next_check_at = now`). Si connu, rien.
- Un token déjà connu via un autre pool : le nouveau pool est stocké aussi ; à l'étage 5 on ne garde que **le pool le plus liquide du token**.

### 4.3 Étage 2 — Filtres de performance (re-vérification par lots)

Sélection des pools dus : `tier != 'retired' AND next_check_at <= now`, par lots de 30, appel `pools/multi`. Chaque réponse produit une ligne `scan_pool_checks` (si `hot`) et met à jour `scan_pools`.

**Paliers de fraîcheur**, recalculés à chaque relevé :

| Palier | Condition après relevé | Prochaine vérification |
|---|---|---|
| `hot` | liquidité ≥ 20 % du seuil **et** volume 24 h ≥ 20 % du seuil | + 15 min |
| `warm` | l'un des deux entre 5 % et 20 % du seuil | + 2 h |
| `cold` | les deux sous 5 % du seuil, ou pool absent de la réponse | + 24 h ; `consecutive_below` += 1 |
| `retired` | âge > `maxAgeDays`, ou `cold` 3 fois de suite, ou pool absent 3 fois de suite | jamais |

Ces bornes (20 %, 5 %) sont volontairement basses : un token peut passer de 8 k$ à 60 k$ de liquidité en deux heures, il doit rester en `hot`.

**Critères de l'étage 2**, évalués dans cet ordre, le premier échec donne le motif :

| Code | Test | Remarque |
|---|---|---|
| `age_min` | `now - pool_created_at ≥ minAgeHours` | On prend la date du **plus ancien** pool connu du token |
| `age_max` | `≤ maxAgeDays` | Au-delà, `retired` |
| `change_min` | `pct_h24 ≥ minChangeH24Pct` | Le critère demandé |
| `liquidity_min` | `reserve_usd ≥ minLiquidityUsd` | Liquidité du pool principal |
| `volume_min` | `volume_h24_usd ≥ minVolumeH24Usd` | |
| `mcap_max` | `cap ≤ maxMarketCapUsd` avec `cap = market_cap_usd` si non null, sinon `fdv_usd` et `mcap_is_fdv = true` | Jamais de substitution silencieuse : le drapeau `mcap_is_fdv` suit le résultat partout et l'interface affiche « FDV, capitalisation non vérifiée » |

Un pool qui passe `change_min` mais échoue ensuite est enregistré en `excluded, stage 2` (cas proche). Les autres n'alimentent que le compteur.

### 4.4 Étage 3 — Filtres structurels éliminatoires

Enrichissement RPC uniquement ici, sur quelques dizaines de tokens par heure au plus. `getAccountInfo(mint, jsonParsed)` donne tout en un appel ; résultat mis en cache 24 h dans `scan_token_facts`.

| # | Code | Test | Source |
|---|---|---|---|
| 1 | `mint_authority` | `mintAuthority == null` | RPC |
| 2 | `freeze_authority` | `freezeAuthority == null` | RPC |
| 3 | `transfer_fee` | pas d'extension `transferFeeConfig` avec `transferFeeBasisPoints > 0`, sauf `allowTransferFee` | RPC |
| 4 | `volume_to_mcap` | `volume_h24 / cap ≤ maxVolumeToMcap` (cap = même valeur qu'à l'étage 2, `mcap_is_fdv` propagé) | GeckoTerminal |
| 5 | `liquidity_to_mcap` | `reserve_usd / cap ≥ minLiquidityToMcapPct / 100` | GeckoTerminal |

Résultat : `structural_passed / 5`. Un seul échec → `excluded, stage 3`, avec tous les tests quand même évalués et enregistrés (on veut voir « 3/5 » dans l'onglet exclus, pas seulement le premier motif).

Note : `tokens/{mint}/info` renvoie aussi `mint_authority` / `freeze_authority` en yes/no. On le lit à l'étage 4, et si son verdict **diffère** du RPC, un drapeau `source_mismatch` est levé. Le RPC reste l'autorité.

### 4.5 Étage 4 — Drapeaux

Un appel `tokens/{mint}/info` par token gardé (TTL 6 h), un appel Helius DAS optionnel pour le créateur (TTL 7 j). Chaque drapeau porte `observed`, `threshold`, `detail` et `verified` (false quand la donnée nécessaire manque : on affiche « non vérifié », on ne compte pas le drapeau comme levé ni comme absent).

| Code | Règle | Détail affiché |
|---|---|---|
| `concentration` | `top10_pct > top10MaxPct` | « Top 10 : 41,2 % (seuil 35 %) ». Repli RPC `getTokenLargestAccounts` hors pools si l'info token n'a pas de `holders`. |
| `buyer_seller_asymmetry` | `buyers_h1 / max(sellers_h1, 1) ≥ buyerSellerRatioMin` **et** `abs(pct_h1) < stagnantH1AbsPct` | « 214 acheteurs pour 31 vendeurs sur 1 h, prix +0,8 % : beaucoup entrent, peu sortent, le prix ne suit pas. Profil de distribution. » |
| `bot_activity` | `buys_h1 / max(buyers_h1, 1) ≥ buysPerBuyerMin` ou idem sur 24 h | « 6,3 achats par acheteur : activité automatisée probable. » |
| `serial_creator` | `creator_token_count > creatorMaxTokens` | « Ce wallet a déployé 11 tokens. » Créateur = creator Metaplex vérifié, sinon `developer_address`. Comptage via Helius DAS `searchAssets` (`creatorAddress`, `tokenType: fungible`). Sans Helius : `verified = false`. |
| `deceleration` | `hourly = (1 + pct_h24/100)^(1/24) − 1` ; drapeau si `pct_h1/100 < decelerationFraction × hourly` | « Rythme horaire moyen sur 24 h : +3,1 % ; dernière heure : −1,4 %. Le mouvement ne se poursuit pas. » |
| `no_metadata` | ni site, ni Twitter / Telegram / Discord, ni description | « Aucune métadonnée publique. » |
| `developer_holding` | `developer_holding_pct > developerHoldingMaxPct` | « Le développeur détient 14 % de l'offre. » |
| `honeypot_suspected` | `gt_is_honeypot == 'true'` | Heuristique tierce, étiquetée comme telle. |
| `source_mismatch` | verdict mint / freeze de l'info token ≠ RPC | « GeckoTerminal indique une autorité de mint, le RPC non. » |

Les trois derniers ne sont pas dans le cahier des charges : ils coûtent zéro appel supplémentaire et sont utiles. **À valider ou à retirer.**

### 4.6 Étage 5 — Résultat, tri, alerte

- Un token = une ligne, sur son pool le plus liquide. Les autres pools du même token sont listés dans `metrics.otherPools`.
- **Tri par défaut** : `flag_count` croissant, puis drapeaux non vérifiés en second (un « non vérifié » n'est pas un zéro), puis liquidité décroissante. Jamais par performance.
- **Alerte** : `status = kept`, `structural_passed = 5`, `flag_count = 0`, **tous les drapeaux `verified = true`** (donc Helius présent pour le créateur), et `scan_retro.alerted_at IS NULL`. Une seule notification par token, jamais renouvelée. Le message contient les six métriques et la phrase « Zéro drapeau ne veut pas dire sûr : le scanner n'a rien trouvé, il n'a pas tout vu. »
- Sans Helius, l'alerte zéro drapeau **ne peut pas** se déclencher, et la vue Système le dit.

---

## 5. Contenu figé de `metrics` (par résultat)

```json
{
  "poolAddress": "…", "dexId": "pumpswap",
  "priceUsd": 0.00421, "priceSource": "geckoterminal",
  "ageHours": 31.4, "poolCreatedAt": 1789200000,
  "pctH1": -1.4, "pctH24": 187.3,
  "capUsd": 3120000, "mcapIsFdv": true, "fdvUsd": 3120000, "marketCapUsd": null,
  "liquidityUsd": 92000, "volumeH24Usd": 410000,
  "volumeToMcap": 0.13, "liquidityToMcapPct": 2.9,
  "txH1": { "buys": 812, "sells": 190, "buyers": 128, "sellers": 61 },
  "txH24": { "buys": 9100, "sells": 4300, "buyers": 1900, "sellers": 1100 },
  "otherPools": [{ "poolAddress": "…", "dexId": "raydium", "liquidityUsd": 15000 }]
}
```

---

## 6. Budget d'appels et cadence

Hypothèses : 400 nouveaux pools Solana par heure indexés par GeckoTerminal, dont 90 % tombent en `cold` dès le premier relevé.

| Poste | Appels par heure | Voie |
|---|---|---|
| Découverte `new_pools` 5 pages × 12 | 60 | GeckoTerminal public |
| Découverte `trending` 3 durées × 2 pages × 4 | 24 | GeckoTerminal public |
| Re-vérification `hot` (≈ 600 pools / 30 par appel × 4) | 80 | GeckoTerminal public |
| Re-vérification `warm` et `cold` | ≈ 30 | GeckoTerminal public |
| Enrichissement `tokens/{mint}/info` (10 à 40 candidats) | ≤ 40 | GeckoTerminal public |
| RPC `getAccountInfo` (candidats étage 3) | ≤ 40 | RPC (hors budget GT) |
| Helius DAS créateur | ≤ 40 | Helius |
| Rétrospective `tokens/multi` | < 2 | GeckoTerminal public ou démo |
| **Total GeckoTerminal** | **≈ 240 / h, soit 4 / min** | limite 10 / min |

Une **file d'attente unique** cadence tous les appels GeckoTerminal à 8 par minute maximum. Sur 429 : attente exponentielle 2 s, 4 s, 8 s… jusqu'à 2 min, puis **disjoncteur** : le scanner se met en pause 5 minutes, le `scan_run` est marqué `rate_limited`, l'interface l'affiche. Le job suivant reprend là où il s'était arrêté grâce à `next_check_at`.

Jobs planifiés :

| Job | Cadence | Rôle |
|---|---|---|
| `scan-discover` | `*/5 * * * *` | Étage 1 |
| `scan-evaluate` | `*/5 * * * *`, 1 min après | Étages 2 à 5 sur les pools dus |
| `scan-retro` | `15 * * * *` | Remplit J+1 / J+7 / J+30 échus |
| `scan-maintenance` | `30 3 * * *` | Retraite des pools trop vieux, purge `scan_pool_checks` > 7 j, purge des exclusions d'étage 2 > 7 j |

---

## 7. Rétrospective

- Horizons : J+1 = 24 h ± 2 h après `first_kept_at`, J+7 = 7 j ± 6 h, J+30 = 30 j ± 12 h. Le job prend le premier relevé dans la fenêtre.
- Source : `tokens/multi` par lots de 30 (prix du pool le plus liquide). Si le token n'est plus renvoyé ou que sa liquidité est nulle : `status = 'unavailable'`.
- Métriques affichées par horizon, sur les tokens dont l'horizon est échu :
  - **médiane** du rendement, en premier et en gros ;
  - moyenne, pour montrer l'écart avec la médiane ;
  - part des tokens en gain, part sous −50 %, part `unavailable` ;
  - meilleur et pire cas ;
  - histogramme par tranche (< −90 %, −90 à −50, −50 à 0, 0 à +100, +100 à +500, > +500).
- Deux calculs affichés côte à côte : `unavailable` compté à −100 %, et `unavailable` exclu.
- Segmentation : par nombre de drapeaux au moment du relevé (0, 1, 2, 3+), et par drapeau individuel. C'est ce qui permet de voir si un drapeau donné a réellement un pouvoir d'élimination.
- Phrase de tête, calculée : « Si vous aviez mis 100 $ sur chacun des N tokens remontés il y a plus de 30 jours, vous auriez aujourd'hui X $ (médiane par token : Y %). »

---

## 8. Justification des seuils par défaut

| Seuil | Défaut | Pourquoi | Effet si trop bas | Effet si trop haut |
|---|---|---|---|---|
| Variation 24 h | +100 % | Le critère demandé ; sélectionne des mouvements déjà entamés, l'outil le dit | Bruit | Ne reste que la fin des pumps |
| Âge min | 6 h | En dessous, `pct_h24` n'existe pas vraiment et les transactions h1 sont dominées par le lancement | Faux positifs | On rate les mouvements rapides, ce qui est acceptable |
| Âge max | 30 j | Définition de « nouveau » | — | La liste se remplit de tokens établis |
| Liquidité min | 50 k$ | Sous ce niveau, sortir 1 k$ bouge le prix de plusieurs % | Slippage | Élimine les tout petits, c'est le but |
| Volume 24 h min | 100 k$ | Élimine les tokens morts et ceux sans marché réel | Tokens illiquides | — |
| Capitalisation max | 50 M$ | Au-delà, le +100 % est consommé et la suite dépend d'autres acteurs | — | Peu d'effet |
| Volume / capi max | 5 | Un token qui tourne 5 fois par jour n'a pas de porteurs, il a des bots | Laisse passer le lavage | Élimine des lancements très actifs mais réels |
| Liquidité / capi min | 2 % | En dessous, la capitalisation est théorique : personne ne peut la réaliser | Capitalisations fictives | Élimine des tokens sur bonding curve, acceptable |
| Top 10 max (drapeau) | 35 % | Au-delà, dix wallets décident du prix | — | Drapeau levé partout |
| Acheteurs / vendeurs (drapeau) | 3 avec prix stagnant ± 5 % | Beaucoup d'entrées, peu de sorties, prix plat = quelqu'un vend en continu | — | — |
| Achats / acheteur (drapeau) | 4 | Un humain n'achète pas 4 fois par heure le même token | — | — |
| Créateur en série (drapeau) | > 3 tokens | Un déployeur récidiviste vit du lancement, pas du projet | — | — |
| Décélération (drapeau) | h1 < 25 % du rythme horaire moyen | Le mouvement 24 h ne se poursuit pas | Drapeau permanent | Rarement levé |
| Détention développeur (drapeau) | > 10 % | Une seule main peut renverser le marché | — | — |

---

## 9. Ce que l'interface montrera (pour mémoire, code après validation)

- **Résultats** : tableau du dernier run, colonnes symbole, âge, var 24 h, var 1 h, capitalisation (avec mention FDV le cas échéant), liquidité, volume, vol/cap, filtres n/5, drapeaux. Ligne dépliable : détail des drapeaux avec valeurs et seuils, autres pools, bouton « ajouter à ma surveillance » qui appelle `POST /api/tokens`.
- **Exclus** : même tableau, colonne « motif », filtrable par étage et par motif, avec les compteurs de l'étage 2.
- **Réglages** : formulaire des seuils, bouton « restaurer les défauts », historique des réglages.
- **Rétrospective** : § 7.
- Rafraîchissement de l'interface toutes les 5 minutes, aligné sur le job. Pas de flux temps réel.

---

## 10. Tests prévus

Jeux de données JSON représentatifs (réponses `pools/multi` et `tokens/info` figées) :

1. Token propre : passe tout, zéro drapeau.
2. `market_cap_usd` null : filtre sur FDV, `mcapIsFdv = true` dans le résultat.
3. Autorité de mint présente : exclu étage 3 avec `structural_passed = 4/5`.
4. Token-2022 avec frais 2 % : exclu, puis gardé si `allowTransferFee = true`.
5. Volume / capi = 7 : exclu ; = 4,9 : gardé.
6. Liquidité 1,5 % de la capi : exclu.
7. Pool SOL/USDC : ignoré à la découverte.
8. Token avec deux pools : une seule ligne, sur le plus liquide.
9. Asymétrie 200 acheteurs / 20 vendeurs et prix +1 % : drapeau ; même ratio avec prix +40 % : pas de drapeau.
10. Décélération : h24 = +300 %, h1 = −2 % : drapeau ; h1 = +8 % : pas de drapeau.
11. Sans Helius : drapeau créateur `verified = false`, alerte impossible.
12. Tri : trois tokens à 0, 1 et 2 drapeaux dans le désordre → ordre 0, 1, 2 quelle que soit la performance.
13. Rétrospective : cinq tokens dont un `unavailable` → médiane calculée dans les deux modes.
14. Paliers : un pool à 3 k$ de liquidité trois fois de suite → `retired`.
15. Disjoncteur : trois 429 consécutifs → pause, run `rate_limited`, reprise au tick suivant.

---

## 11. Points à valider

1. **Voie principale GeckoTerminal public** (sans clé, 10 appels/min) et clé démo CoinGecko en secours, plutôt que l'inverse : le plafond de 10 000 crédits par mois ne permet pas la découverte toutes les 5 minutes.
2. **Exclusions d'étage 2** : compteurs par motif + cas proches (ceux qui avaient le +100 %) conservés 7 jours, plutôt que toutes les exclusions.
3. **Trois drapeaux supplémentaires** à coût nul : détention du développeur, honeypot suspecté (heuristique GeckoTerminal), désaccord de sources sur mint / freeze.
4. **Alerte zéro drapeau conditionnée à Helius** : sans vérification du créateur, pas d'alerte. Alternative : alerter quand même en indiquant « créateur non vérifié ».
5. **Paliers de fraîcheur** (chaud 15 min / tiède 2 h / froid 24 h, retraite après 3 froids) : cadence acceptable, ou préfères-tu plus agressif sur `hot` (5 min) au prix du budget d'appels ?
6. **Formule de décélération** : h1 comparé à 25 % du rythme horaire moyen sur 24 h. Alternative plus simple : drapeau dès que h1 ≤ 0 avec h24 ≥ +100 %.
