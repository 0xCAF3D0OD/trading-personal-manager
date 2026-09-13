# Panneau de métriques de marché et encadré de veille — schéma de données et moteur de diff

> Document de cadrage. Version 0.3 — 2026-09-13. **Partie B (veille) implémentée** le 13 septembre 2026 avec les propositions par défaut de la partie D ; partie A (métriques de marché) à suivre.
> S'appuie sur la base existante (`market_snapshots`, `holder_snapshots`, `alerts`, règles de divergence partagées).

## Journal des décisions

| Date | Point | Verdict | Effet dans ce document |
|---|---|---|---|
| 2026-09-13 | Slippage via Jupiter Quote | **Validé**, avec cache 30–60 s par couple token/taille, mention « simulation de route », repli limité aux pools à produit constant | A.3 |
| 2026-09-13 | Offre émise moins adresses de burn | **Validé avec réserve** : pas de double comptage, composants affichés séparément, terme « offre émise nette des burns » | A.2, A.3 |
| 2026-09-13 | Sites rendus côté client non couverts | **Refusé** : le diff du site est la fonctionnalité centrale. Trois modes : HTML, API JSON découverte, rendu sans tête | B.1, B.2, B.3 |
| 2026-09-13 | Notification puis alerte à 48 h | **Validé avec correction** : sévérité par nature du changement, « non annoncé » est un drapeau additionnel à 48 h, cumulatif | B.3 |
| 2026-09-13 | Table de réglages commune | **Validé**, avec défauts versionnés en code et remise à zéro par module | A.2, A.5, B.8 |
| 2026-09-13 | Discord / Telegram reportés | **Validé en entrée seulement**. Telegram en sortie (notifications) est déjà livré en 0.1.0 et reste | B.1 |
| 2026-09-13 | Remarque : oEmbed = saisie manuelle, donc X non automatisé | **Pris en compte** : la collecte automatique repose sur le site (trois modes), GitHub, les actualités et l'on-chain ; X reste manuel et le document le dit | B.1 |

---

## Partie A — Module 1 : métriques de marché

### A.1 Ce qui existe déjà et ce qui manque

| Besoin | État dans la 0.1.0 | À faire |
|---|---|---|
| Prix DexScreener + Jupiter + écart | Affiché en direct, écart calculé | Historiser les deux prix, alerte visuelle > 2 %, alerte notifiée si l'écart persiste |
| Variations 5 min / 1 h / 6 h / 24 h | Affichées en direct | Historiser, calculer l'état de dérivée (extinction / accélération) |
| Capitalisation source vs recalculée | Les deux affichées | Ajouter la FDV locale, l'écart en %, le drapeau « substitution FDV », historiser les trois |
| Liquidité du pool principal | Affichée | Ratio liquidité / capi en évidence, liste de tous les pools, slippage pour 3 tailles, historisation quotidienne du ratio, alerte retrait de liquidité |
| Volume 24 h + ratio vol / capi | Affichés | Source stockée par point, variation du ratio 24 h / 7 j, interdiction de tracer deux sources sur une même courbe |
| Divergences | 4 règles | 3 règles de plus : retrait de liquidité, hausse non confirmée par le volume, burn annoncé sans baisse d'offre (lien avec le module 2) |
| Seuils éditables | Constantes dans le code | Table de réglages versionnée, partagée avec le scanner |

### A.2 Schéma : évolution de `market_snapshots` (migration `0002_market_metrics.sql`)

La table reste la série à 15 minutes ; on l'enrichit plutôt que d'en créer une seconde, pour que toutes les divergences croisent des points relevés au même instant.

```sql
ALTER TABLE market_snapshots ADD COLUMN pct_m5  REAL;
ALTER TABLE market_snapshots ADD COLUMN pct_h1  REAL;
ALTER TABLE market_snapshots ADD COLUMN pct_h6  REAL;
ALTER TABLE market_snapshots ADD COLUMN pct_h24 REAL;
ALTER TABLE market_snapshots ADD COLUMN momentum_state TEXT;        -- 'extinction' | 'acceleration' | 'none' | 'insufficient'
ALTER TABLE market_snapshots ADD COLUMN price_spread_pct REAL;      -- (DexScreener − Jupiter) / Jupiter × 100

ALTER TABLE market_snapshots ADD COLUMN mcap_source_name TEXT;      -- 'dexscreener' | 'geckoterminal' | NULL
ALTER TABLE market_snapshots ADD COLUMN mcap_source_is_fdv INTEGER; -- 1 si la source renvoie mcap == fdv ou mcap NULL remplacé par FDV côté source
ALTER TABLE market_snapshots ADD COLUMN mcap_local_usd REAL;        -- prix × supply_net (RPC)
ALTER TABLE market_snapshots ADD COLUMN fdv_local_usd REAL;         -- prix × supply_minted (RPC)
ALTER TABLE market_snapshots ADD COLUMN mcap_gap_pct REAL;          -- (source − locale) / locale × 100

ALTER TABLE market_snapshots ADD COLUMN volume_source TEXT;         -- 'dexscreener' | 'geckoterminal'
ALTER TABLE market_snapshots ADD COLUMN liquidity_source TEXT;
ALTER TABLE market_snapshots ADD COLUMN liquidity_to_mcap_pct REAL; -- liquidité pool principal / capi locale × 100
ALTER TABLE market_snapshots ADD COLUMN volume_to_mcap REAL;
ALTER TABLE market_snapshots ADD COLUMN pools TEXT;                 -- JSON : [{ address, dex, liquidityUsd, volumeH24Usd, priceUsd, source }]
ALTER TABLE market_snapshots ADD COLUMN pools_count INTEGER;
ALTER TABLE market_snapshots ADD COLUMN liquidity_total_usd REAL;   -- somme de tous les pools connus
ALTER TABLE market_snapshots ADD COLUMN supply_minted REAL;         -- getTokenSupply : offre émise, déjà nette des burns SPL
ALTER TABLE market_snapshots ADD COLUMN supply_incinerated REAL;    -- soldes des adresses incinérateur identifiées (tokens envoyés, pas brûlés)
ALTER TABLE market_snapshots ADD COLUMN supply_net REAL;            -- supply_minted − supply_incinerated : « offre émise nette des burns »
ALTER TABLE market_snapshots ADD COLUMN supply_incinerator_addresses TEXT;  -- JSON : adresses effectivement soustraites, avec leur solde

-- Slippage : calculé à la demande et une fois par jour, pas toutes les 15 min.
CREATE TABLE slippage_snapshots (
  id            INTEGER PRIMARY KEY,
  token_id      INTEGER NOT NULL REFERENCES tokens(id),
  ts            INTEGER NOT NULL,
  order_usd     REAL NOT NULL,                -- 200, 1000, 10000 (paramétrable)
  side          TEXT NOT NULL,                -- 'sell' (sortie) ; 'buy' possible plus tard
  impact_pct    REAL,                         -- NULL si indisponible
  method        TEXT NOT NULL,                -- 'jupiter_quote' | 'constant_product'
  route         TEXT,                         -- JSON : étapes de la route Jupiter, ou pool utilisé
  pool_address  TEXT,
  UNIQUE(token_id, ts, order_usd, side)
);
CREATE INDEX idx_slippage_token_ts ON slippage_snapshots(token_id, ts);

-- Réglages génériques, versionnés, par module. Remplace `scan_settings` du document 03.
-- Les valeurs par défaut vivent dans le code (packages/shared/src/defaults/<module>.ts) avec un numéro de version ;
-- « restaurer les défauts » agit module par module et insère une nouvelle ligne, jamais une mise à jour.
CREATE TABLE app_settings (
  id                INTEGER PRIMARY KEY,
  module            TEXT NOT NULL,            -- 'market' | 'scanner' | 'watch'
  created_at        INTEGER NOT NULL,
  settings          TEXT NOT NULL,            -- JSON complet (pas un delta), validé par le schéma Zod du module
  defaults_version  INTEGER NOT NULL,         -- version des défauts en code au moment de l'enregistrement
  is_default        INTEGER NOT NULL DEFAULT 0,
  note              TEXT
);
CREATE INDEX idx_app_settings_module ON app_settings(module, id);
```

Au démarrage, si la version des défauts en code est plus récente que celle de la dernière ligne d'un module, l'interface l'indique (« de nouveaux réglages par défaut existent ») sans rien écraser.

**Offre émise nette des burns** (décision du 2026-09-13). Deux mécanismes coexistent sur Solana et ne doivent pas être confondus :

- l'instruction SPL `burn` **réduit l'offre du mint** : `getTokenSupply` la reflète déjà, il n'y a rien à soustraire ;
- l'**envoi** vers une adresse incinérateur laisse les tokens dans l'offre : seuls ces soldes sont soustraits.

Formule : `supply_net = supply_minted − supply_incinerated`, où `supply_incinerated` est la somme des soldes du token sur les adresses incinérateur identifiées (liste amorcée avec `1nc1nerator11111111111111111111111111111111`, éditable). L'interface affiche **les trois composants séparément** : offre du mint, soldes des adresses de burn identifiées (avec la liste), résultat. Jamais un seul chiffre.

Le terme « offre en circulation » n'est **pas** utilisé : rien ne permet d'identifier de façon fiable les tokens équipe ou verrouillés. Les comptes détenus par des programmes (`holder_snapshots.excluded_accounts`) sont affichés à titre indicatif, sans être soustraits. `mcap_local_usd = prix × supply_net`, `fdv_local_usd = prix × supply_minted`.

### A.3 Règles de calcul

**Écart de prix** : `spread = (dexscreener − jupiter) / jupiter × 100`. Affichage en alerte visuelle si `|spread| > 2 %`. Alerte notifiée `price_spread` si `|spread| > 2 %` sur **3 relevés consécutifs** (45 min) : un écart ponctuel est du bruit de routage, un écart persistant est une liquidité fragmentée.

**État de dérivée** (décélération / accélération). Pour chaque fenêtre, rythme horaire moyen linéaire `r_w = pct_w / heures_w` (5 min = 1/12 h). Séquence ordonnée de la plus longue à la plus courte : `r_24h, r_6h, r_1h, r_5m`.

- `extinction` si la séquence est **décroissante** à chaque pas (tolérance 0,5 point par pas) **et** `r_5m < 0` **et** `r_1h < 0`.
- `acceleration` si la séquence est **croissante** à chaque pas (même tolérance) **et** `r_5m > 0` **et** `r_1h > 0`.
- `insufficient` si le volume 5 min est nul ou inférieur à 50 $ (la fenêtre courte ne contient pas de marché).
- `none` sinon.

Libellés affichés : « Mouvement en extinction : +2,7 %/h sur 24 h, −10 %/h sur 1 h, −24 %/h sur 5 min » et « Accélération en cours : … ». Le rythme linéaire est retenu plutôt que composé parce qu'il se lit directement ; la valeur 5 min est **toujours** affichée avec la mention « extrapolée, très bruitée ». **À valider** : tolérance de 0,5 point, ou exiger que l'écart entre `r_1h` et `r_24h` dépasse 2 points pour éviter de qualifier un marché plat.

**Écart de capitalisation** : `mcap_gap = (mcap_source − mcap_locale) / mcap_locale × 100`. Drapeau visuel si `|gap| > 5 %`. `mcap_source_is_fdv = 1` si la source renvoie `market_cap == fdv` à 0,1 % près ou si `market_cap` est `NULL` : dans ce cas la carte affiche « la source ne fournit pas de capitalisation vérifiée » et n'affiche **que** la valeur recalculée et la FDV.

**Ratio liquidité / capi** : `liquidité du pool principal / mcap_locale × 100`. Bandes par défaut : > 10 confortable, 5–10 correcte, 2–5 mince, < 2 très mince. Le dénominateur est la capitalisation **locale** : c'est la seule qui ne dépend pas de la source. Aussi affiché avec `liquidity_total_usd` (tous pools) pour la fragmentation : « 92 k$ sur le pool principal, 118 k$ au total sur 4 pools ».

**Slippage estimé pour une sortie** (décision du 2026-09-13). Deux méthodes, la première en priorité :

1. **Jupiter Quote API** (`GET /swap/v1/quote?inputMint=<token>&outputMint=<USDC>&amount=<lamports>&slippageBps=50`, sans clé sur lite-api). Renvoie `priceImpactPct` et la route. **Cache de 60 s par couple token / taille**, quelle que soit la fréquence de polling du frontend : 3 tailles × N tokens ne peuvent pas dépasser 3 × N appels par minute, et en pratique les appels ne partent que si la vue détaillée est ouverte. Une passe quotidienne alimente l'historique.
   Libellé affiché avec chaque valeur : « simulation de route Jupiter à l'instant T ; n'intègre ni le MEV, ni le déplacement de prix que votre propre ordre provoque pour les suivants. Mieux qu'une formule, pas la réalité d'exécution. »
2. **Formule produit constant** en repli, **uniquement** si Jupiter ne répond pas **et** si le pool principal est un pool à produit constant (Raydium AMM v4, PumpSwap, Orca legacy, Meteora Dynamic AMM). Pour une vente de `X` dollars dans un pool de réserve `R` dollars, `impact ≈ X / (R/2 + X)`. Étiquetée « approximation, formule x·y = k, hors frais ». Sur un pool à liquidité concentrée (Orca Whirlpool, Raydium CLMM, Meteora DLMM), la formule n'est pas une approximation, elle est fausse : la valeur affichée est alors **« indisponible »**, avec la raison.

Le type de pool vient du `dexId` DexScreener ou du `dex` GeckoTerminal, table de correspondance éditable. Tailles par défaut : 200 $, 1 000 $, 10 000 $.

**Alerte prioritaire retrait de liquidité** (`liq_withdrawal`), évaluée sur la série à 15 min :

- fenêtre 24 h : `liquidity_to_mcap_pct` a baissé de **20 % relatif** ou plus (ex. 6 % → 4,8 %) **et** `prix` a varié de **−2 % ou mieux** ;
- **ou** fenêtre 6 h : `liquidity_usd` du pool principal a baissé de **15 %** ou plus **et** prix ≥ −2 %.

Le message contient les deux séries (liquidité, prix) sur 24 h et la phrase « des fournisseurs de liquidité retirent leurs fonds sans que le prix ne réagisse ». Silence 6 h après déclenchement. Exclusion : si `pools_count` a augmenté et que `liquidity_total_usd` est stable à 5 % près, il s'agit d'une **migration** de liquidité entre pools, pas d'un retrait : l'alerte est remplacée par une information « liquidité migrée vers … ».

**Volume** : ratio `volume_h24 / mcap_locale`. Bandes : > 1 rotation extrême, 0,3–1 très élevée, 0,1–0,3 soutenue, < 0,1 faible. Variation du ratio sur 24 h et 7 j calculée **uniquement entre points de même `volume_source`**.

**Règle d'intégrité des courbes** : la route d'historique renvoie les points **groupés par source** (`{ source, points[] }[]`). Le composant graphique trace un segment par groupe, avec une rupture visible et une étiquette « changement de source le … » entre deux groupes. Il n'existe pas de chemin de code qui concatène deux sources : la contrainte est structurelle, pas une option.

### A.4 Nouvelles règles de divergence (ajoutées à `DIVERGENCE_RULES`)

| Id | Séries A / B | Déclenchement (fenêtre 7 j sauf mention) | Lecture |
|---|---|---|---|
| `liquidity_withdrawal` | ratio liquidité / capi ; prix | ratio −20 % ou plus **et** prix entre −5 % et +∞ | Retrait des fournisseurs de liquidité |
| `unconfirmed_rise` | volume 24 h (même source) ; prix | volume −30 % ou plus **et** prix +15 % ou plus | Hausse non confirmée par les flux |
| `announced_burn_no_supply_change` | offre ; engagements de type burn (module 2) | un engagement `tokenomics/burn` au statut « en attente » ou « tenu » existe **et** l'offre a baissé de moins de 0,1 % sur la fenêtre de l'engagement | Revenus taris, ou promesse non tenue |

Les quatre règles existantes restent. Le panneau n'affiche par défaut que les règles `triggered`, avec un bouton « tout afficher ».

### A.5 Réglages par défaut (`app_settings`, module `market`)

```json
{
  "priceSpreadWarnPct": 2, "priceSpreadAlertConsecutive": 3,
  "momentumTolerancePts": 0.5, "momentumMinVolume5mUsd": 50,
  "mcapGapWarnPct": 5,
  "liquidityBands": [10, 5, 2],
  "slippageOrderSizesUsd": [200, 1000, 10000],
  "liqWithdrawal": { "ratioDropPct24h": 20, "liqDropPct6h": 15, "priceFloorPct": -2, "cooldownS": 21600 },
  "volumeBands": [1, 0.3, 0.1],
  "divergences": { "liquidity_withdrawal": { "ratioDropPct": 20, "priceFloorPct": -5 }, "unconfirmed_rise": { "volumeDropPct": 30, "priceRisePct": 15 } }
}
```

---

## Partie B — Module 2 : encadré de veille

### B.1 Positionnement des sources

| Source | Voie proposée | Légitimité | Coût |
|---|---|---|---|
| Site officiel, pages tokenomics, documentation | **Snapshot + diff** toutes les 6 h, en **trois modes** selon la page : `html` (fetch simple), `json_api` (l'appel JSON que fait l'application, découvert à l'ajout de la source), `headless` (rendu par navigateur sans tête). Respect de `robots.txt`, `User-Agent` identifiant l'application. Voir B.3. | Lecture de pages publiques à une cadence d'un lecteur humain | 0 (le rendu sans tête coûte de la mémoire, pas d'argent) |
| Compte X | **Saisie assistée, donc non automatisée** : coller l'URL d'un post, le backend appelle l'endpoint **oEmbed officiel** de X (`publish.twitter.com/oembed`) qui renvoie le texte intégral, l'auteur et la date, sans clé. Adaptateur API X v2 derrière `X_BEARER_TOKEN` si un jour le budget le permet (le palier gratuit n'autorise pas la lecture). Pas de scraping de la timeline. L'interface affiche clairement « X : suivi manuel » sur la source. | oEmbed est prévu pour cet usage | 0 |
| GitHub | API REST publique (`/repos/{o}/{r}/commits`, `/releases`), 60 req/h sans token, 5 000 avec `GITHUB_TOKEN` | Officiel | 0 |
| Discord / Telegram **en entrée** (lire les canaux du projet) | **Reporté à la version suivante du module.** Discord exige que le serveur du projet accepte notre bot, ce qui n'arrive presque jamais. Un bot Telegram lecteur demande une configuration par canal. La prévisualisation web `t.me/s/…` est un scraping que je ne propose pas. | — | — |
| Telegram **en sortie** (recevoir nos alertes) | **Déjà livré en 0.1.0**, conservé. Rien à voir avec la ligne précédente : c'est notre canal de notification, pas une source. | Bot API officielle | 0 |
| Actualités tierces | **CryptoPanic** (API développeur gratuite, filtrée par symbole, couvre rarement les tokens de quelques semaines) **+ flux RSS Google News** sur une requête « nom du token » + « solana » (usage personnel d'un flux RSS public). Chaque item porte son fournisseur. | Officiel / RSS public | 0 |
| Annonces d'exchanges | Détection par mots-clés (« lists », « listing », « will list », « perpetual », « futures ») sur les actualités ci-dessus **+** flux officiels des exchanges qui en publient un (RSS ou JSON public de Binance, Bybit, OKX, Kraken, Coinbase ; chemins à vérifier à l'implémentation, ils changent souvent). Kraken en priorité puisque c'est ta plateforme. | Flux publics | 0 |
| Actions on-chain de l'équipe | Réutilise l'adaptateur Helius Enhanced Transactions déjà en place, étendu à une **liste de wallets équipe** par token (créateur ajouté automatiquement, les autres à la main). Burns effectifs déduits de la série d'offre déjà historisée toutes les 15 min. | On-chain | Helius gratuit |

Le module n'utilise aucune API payante. **Collecte automatique** : site officiel (trois modes), GitHub, actualités, on-chain. **Collecte manuelle** : X. Cette répartition est affichée dans l'interface, source par source.

### B.2 Schéma (migration `0003_watch.sql`)

```sql
-- Sources suivies, plusieurs par token.
CREATE TABLE watch_sources (
  id                INTEGER PRIMARY KEY,
  token_id          INTEGER NOT NULL REFERENCES tokens(id),
  kind              TEXT NOT NULL,      -- 'website' | 'docs' | 'github' | 'x_account' | 'news_query' | 'exchange_feed'
  label             TEXT NOT NULL,      -- 'Accueil', 'Tokenomics', 'Whitepaper'…
  url               TEXT,               -- page, dépôt, flux ; NULL pour x_account (handle dans `handle`)
  handle            TEXT,
  mode              TEXT NOT NULL DEFAULT 'html',   -- 'html' | 'json_api' | 'headless' (website / docs uniquement)
  api_url           TEXT,               -- mode json_api : URL de l'appel découvert
  api_headers       TEXT,               -- JSON : en-têtes nécessaires (ex. Accept), jamais de secret
  json_pointer      TEXT,               -- mode json_api : sous-arbre à surveiller (RFC 6901), NULL = tout
  discovered_endpoints TEXT,            -- JSON : appels JSON observés lors du rendu de découverte, pour choix dans l'UI
  render_wait_ms    INTEGER,            -- mode headless : attente après chargement (défaut 3000)
  enabled           INTEGER NOT NULL DEFAULT 1,
  check_interval_s  INTEGER NOT NULL,   -- 21600 site, 3600 actualités, 900 on-chain
  next_check_at     INTEGER NOT NULL,
  last_checked_at   INTEGER,
  last_status       TEXT,               -- 'ok' | 'unchanged' | 'changed' | 'http_error' | 'blocked_by_robots' | 'needs_mode_choice' | 'render_error' | 'too_large' | 'timeout'
  last_error        TEXT,
  etag              TEXT,
  last_modified     TEXT,
  volatile_lines    TEXT NOT NULL DEFAULT '[]',   -- JSON : empreintes des lignes apprises comme volatiles (voir B.3)
  added_at          INTEGER NOT NULL,
  note              TEXT
);
CREATE INDEX idx_watch_sources_due ON watch_sources(enabled, next_check_at);

-- Un relevé par vérification, léger. Permet de prouver « rien n'a changé entre telle et telle date ».
CREATE TABLE page_checks (
  id            INTEGER PRIMARY KEY,
  source_id     INTEGER NOT NULL REFERENCES watch_sources(id),
  checked_at    INTEGER NOT NULL,
  http_status   INTEGER,
  content_hash  TEXT,
  changed       INTEGER NOT NULL DEFAULT 0,
  snapshot_id   INTEGER                 -- renseigné seulement si un snapshot a été créé
);
CREATE INDEX idx_page_checks_source_ts ON page_checks(source_id, checked_at);

-- Un snapshot n'est créé que si le contenu normalisé a changé. Texte conservé sans limite, HTML brut 90 jours.
CREATE TABLE page_snapshots (
  id              INTEGER PRIMARY KEY,
  source_id       INTEGER NOT NULL REFERENCES watch_sources(id),
  fetched_at      INTEGER NOT NULL,
  content_hash    TEXT NOT NULL,
  mode            TEXT NOT NULL,        -- mode utilisé pour ce snapshot
  text_lines      TEXT NOT NULL,        -- JSON : [{ path: "Tokenomics > Taxes", text: "80% redistributed to holders" }]
                                        -- en mode json_api, path = chemin de clés ("tokenomics/tax/holdersShare") et text = valeur
  title           TEXT,
  raw_html        BLOB,                 -- gzip : HTML (html / headless) ou JSON brut (json_api), purgé après 90 jours
  raw_size        INTEGER,
  final_url       TEXT                  -- après redirections
);
CREATE INDEX idx_page_snapshots_source_ts ON page_snapshots(source_id, fetched_at);

-- Un changement = la comparaison de deux snapshots consécutifs.
CREATE TABLE page_changes (
  id                    INTEGER PRIMARY KEY,
  source_id             INTEGER NOT NULL REFERENCES watch_sources(id),
  from_snapshot_id      INTEGER NOT NULL REFERENCES page_snapshots(id),
  to_snapshot_id        INTEGER NOT NULL REFERENCES page_snapshots(id),
  detected_at           INTEGER NOT NULL,
  severity              TEXT NOT NULL,  -- 'tokenomics' | 'content' | 'minor'
  hunks                 TEXT NOT NULL,  -- JSON : [{ op: 'added'|'removed'|'changed', path, before, after }]
  numeric_changes       TEXT NOT NULL DEFAULT '[]',  -- JSON : [{ path, before: "80 %", after: "50 %", beforeValue: 80, afterValue: 50, unit: "%" , keywords: ["tax","redistribut"] }]
  announced             INTEGER,        -- NULL = pas encore évalué, 0 = aucune annonce trouvée, 1 = annonce associée
  announced_claim_id    INTEGER REFERENCES claims(id),
  announce_check_due_at INTEGER,        -- detected_at + 48 h
  unannounced_flag      INTEGER NOT NULL DEFAULT 0,   -- posé à +48 h si toujours rien : drapeau additionnel, indépendant de la sévérité
  alert_sent_at         INTEGER,        -- alerte liée à la sévérité (immédiate)
  unannounced_alert_sent_at INTEGER,    -- second signal, à +48 h
  reviewed_at           INTEGER,
  review_note           TEXT
);
CREATE INDEX idx_page_changes_token ON page_changes(source_id, detected_at);

-- Engagements : affirmations vérifiables, texte brut jamais reformulé.
CREATE TABLE claims (
  id                  INTEGER PRIMARY KEY,
  token_id            INTEGER NOT NULL REFERENCES tokens(id),
  source_id           INTEGER REFERENCES watch_sources(id),
  origin              TEXT NOT NULL,    -- 'manual' | 'x_oembed' | 'x_api' | 'website' | 'github_release' | 'news' | 'onchain'
  published_at        INTEGER NOT NULL,
  captured_at         INTEGER NOT NULL,
  url                 TEXT,
  author              TEXT,
  text                TEXT NOT NULL,    -- verbatim
  type                TEXT NOT NULL,    -- 'tokenomics' | 'product' | 'partnership' | 'listing' | 'governance' | 'other'
  subtype             TEXT,             -- 'burn' | 'tax' | 'redistribution' | 'lp_lock' | 'airdrop' | 'vesting' | …
  status              TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'kept' | 'contradicted' | 'expired'
  due_at              INTEGER,          -- échéance annoncée ou déduite ; NULL = sans échéance
  extracted_numbers   TEXT NOT NULL DEFAULT '[]',  -- JSON : [{ value: 80, unit: "%", context: "taxes redistribuées" }]
  verification_kind   TEXT,             -- 'supply_decrease' | 'lp_lock' | 'wallet_transfer' | 'holders_growth' | 'page_content' | NULL
  verification_ref    TEXT,             -- adresse, signature, URL
  verification_note   TEXT,
  resolved_at         INTEGER,
  resolved_by         TEXT,             -- 'manual' | 'auto'
  linked_change_id    INTEGER REFERENCES page_changes(id)
);
CREATE INDEX idx_claims_token_ts ON claims(token_id, published_at);
CREATE INDEX idx_claims_status ON claims(token_id, status, due_at);

-- Actualités tierces, séparées des engagements par construction.
CREATE TABLE news_items (
  id            INTEGER PRIMARY KEY,
  token_id      INTEGER NOT NULL REFERENCES tokens(id),
  provider      TEXT NOT NULL,          -- 'cryptopanic' | 'google_news_rss' | 'exchange:kraken' | 'exchange:binance' | …
  external_id   TEXT,
  published_at  INTEGER NOT NULL,
  fetched_at    INTEGER NOT NULL,
  title         TEXT NOT NULL,
  url           TEXT NOT NULL,
  canonical_url TEXT NOT NULL,          -- sans paramètres de suivi, hôte en minuscules
  domain        TEXT NOT NULL,
  dedup_key     TEXT NOT NULL,          -- voir B.5
  kind          TEXT NOT NULL,          -- 'news' | 'listing' | 'promo'
  promo_flags   TEXT NOT NULL DEFAULT '[]',   -- JSON : [{ code, detail }]
  UNIQUE(token_id, dedup_key)
);
CREATE INDEX idx_news_token_ts ON news_items(token_id, published_at);

-- Wallets équipe : créateur ajouté automatiquement, le reste à la main.
CREATE TABLE team_wallets (
  id          INTEGER PRIMARY KEY,
  token_id    INTEGER NOT NULL REFERENCES tokens(id),
  address     TEXT NOT NULL,
  label       TEXT NOT NULL,            -- 'creator' | 'team' | 'treasury' | 'marketing' | 'lp_owner' | 'other'
  source      TEXT NOT NULL,            -- 'auto' | 'manual'
  added_at    INTEGER NOT NULL,
  note        TEXT,
  UNIQUE(token_id, address)
);

-- Actions on-chain des wallets équipe, généralise `creator_activities`.
CREATE TABLE onchain_actions (
  id                  INTEGER PRIMARY KEY,
  token_id            INTEGER NOT NULL REFERENCES tokens(id),
  wallet_address      TEXT NOT NULL,
  tx_signature        TEXT NOT NULL,
  ts                  INTEGER NOT NULL,
  kind                TEXT NOT NULL,    -- 'transfer_out' | 'transfer_in' | 'swap_sell' | 'swap_buy' | 'burn' | 'lp_add' | 'lp_remove' | 'mint' | 'authority_change' | 'other'
  amount              REAL,
  amount_usd          REAL,
  counterparty        TEXT,
  counterparty_label  TEXT,             -- 'exchange:binance' | 'pool:raydium' | 'wallet' | 'burn' | NULL
  source              TEXT NOT NULL,    -- 'helius' | 'solscan' | 'rpc'
  raw                 TEXT,
  UNIQUE(token_id, tx_signature, wallet_address)
);
CREATE INDEX idx_onchain_token_ts ON onchain_actions(token_id, ts);

-- Variations d'offre déduites de la série `market_snapshots.supply_circ` : la preuve des burns.
CREATE TABLE supply_events (
  id            INTEGER PRIMARY KEY,
  token_id      INTEGER NOT NULL REFERENCES tokens(id),
  ts_from       INTEGER NOT NULL,
  ts_to         INTEGER NOT NULL,
  supply_before REAL NOT NULL,
  supply_after  REAL NOT NULL,
  delta         REAL NOT NULL,          -- négatif = burn
  delta_pct     REAL NOT NULL,
  kind          TEXT NOT NULL           -- 'burn' | 'mint'
);
CREATE INDEX idx_supply_events_token ON supply_events(token_id, ts_to);

-- Étiquettes d'adresses (exchanges, pools), amorcées depuis un fichier JSON, complétées via Solscan `/account/metadata` si la clé existe.
CREATE TABLE address_labels (
  address     TEXT PRIMARY KEY,
  label       TEXT NOT NULL,            -- 'exchange:kraken', 'pool:raydium'…
  source      TEXT NOT NULL,            -- 'seed' | 'solscan' | 'manual'
  updated_at  INTEGER NOT NULL
);
```

### B.3 Le moteur de diff des snapshots

C'est le mécanisme central. Six étapes, chacune testée séparément.

**1. Récupération.**
- `robots.txt` du domaine lu et mis en cache 24 h. Si le chemin est interdit à `*` ou à notre agent, la source passe en `blocked_by_robots` et n'est plus récupérée ; l'interface le dit et propose la saisie manuelle.
- `User-Agent: trading-personal-manager/0.x (+veille personnelle; contact dans .env)`.
- En-têtes `If-None-Match` / `If-Modified-Since` : un `304` ne crée qu'un `page_check`.
- Limite 2 Mo, délai 20 s, 3 redirections max, HTML uniquement (un PDF de whitepaper est traité par extraction de texte, option v2).
- **Sites rendus côté client** (décision du 2026-09-13 : couverts en v1). À l'ajout d'une source `website` / `docs`, le backend exécute une **découverte** en trois temps :
  1. fetch HTML simple. Si le texte extrait dépasse 200 caractères et contient au moins un nombre, le mode `html` suffit ;
  2. sinon, **rendu de découverte** par navigateur sans tête (service `renderer`, voir ci-dessous) : la page est chargée une fois, et **toutes les réponses JSON** reçues pendant le chargement (XHR / fetch) sont capturées avec leur URL, leur taille et un aperçu des clés. Elles sont enregistrées dans `discovered_endpoints` et proposées dans l'interface, celles dont le corps contient des mots-clés tokenomics ou des pourcentages en tête. L'utilisateur en choisit une, éventuellement un sous-arbre (`json_pointer`) : la source passe en mode **`json_api`**. Les vérifications suivantes sont de simples requêtes HTTP sur ce JSON, sans navigateur : pas de bruit de mise en page, contenu structuré, diff par chemin de clés ;
  3. si aucun appel JSON exploitable n'apparaît (contenu inliné dans le bundle JavaScript, ou page purement statique côté client), la source passe en mode **`headless`** : rendu toutes les 6 h, texte extrait du DOM rendu par le même normaliseur qu'en mode `html`.
  Tant que l'utilisateur n'a pas choisi, le statut est `needs_mode_choice` et l'interface le montre. Le mode est modifiable à tout moment ; un changement de mode crée un nouveau snapshot de référence et **n'est pas** compté comme un changement de contenu.

  **Service `renderer`** : conteneur séparé dans `docker-compose.yml` (image Playwright officielle, Chromium seul), exposant en interne `POST /render { url, waitMs }` → `{ html, jsonResponses[] }`. Il n'est pas exposé à l'extérieur, n'a aucune clé, et l'API le contacte avec un délai de 30 s. Il tourne avec un profil mémoire limité (512 Mo) et un seul rendu à la fois. Sans ce conteneur (par exemple en dev sans Docker), les modes `json_api` déjà configurés continuent de fonctionner ; seuls la découverte et le mode `headless` sont indisponibles, et l'interface le dit.

**2. Normalisation.** Le HTML est analysé (parseur léger, sans navigateur) et réduit à une liste de **lignes** :
- suppression de `script`, `style`, `noscript`, `svg`, `iframe`, commentaires ;
- un élément de bloc (`p`, `li`, `td`, `h1`–`h6`, `div` feuille…) = une ligne ;
- chaque ligne porte un **chemin de titres** : le dernier `h1`/`h2`/`h3` rencontré, par exemple `Tokenomics > Distribution des taxes`. C'est ce chemin qui donne le contexte d'un changement ;
- espaces, espaces insécables et retours multiples réduits à un espace ; chiffres normalisés (`80 %`, `80%`, `80 percent` → valeur 80, unité `%` ; `1,5 M`, `1.5M`, `1 500 000` → 1 500 000) ;
- les attributs `href` des liens sont conservés en fin de ligne entre crochets : un lien qui change de cible est un changement.

**2 bis. Normalisation en mode `json_api`.** Le JSON (ou le sous-arbre pointé) est **aplati** en lignes `chemin de clés → valeur` (`tokenomics/tax/holdersShare → 80`), tableaux indexés par position sauf si leurs éléments ont un identifiant (`id`, `name`, `symbol`), auquel cas la clé est cet identifiant : un réordonnancement n'est alors pas un changement. Les valeurs numériques gardent leur type ; les chaînes passent par la même normalisation que le HTML. Le reste du moteur (empreinte, volatilité, diff, classification) est identique, avec le chemin de clés comme contexte à la place du chemin de titres.

**3. Empreinte.** `content_hash = sha256(lignes normalisées jointes)`. Identique au dernier snapshot → `page_check` seulement. Différent → snapshot créé, puis diff.

**4. Lignes volatiles.** Certaines lignes changent à chaque passage sans porter d'information : prix affiché en direct, compteur de détenteurs, horodatage. Règle d'apprentissage : une ligne (identifiée par son chemin + sa forme sans les chiffres) qui a changé lors de **3 vérifications consécutives** est marquée volatile dans `watch_sources.volatile_lines`. Les lignes volatiles restent dans le snapshot mais sont **exclues du diff**. L'interface liste les lignes volatiles par source et permet d'en retirer une manuellement (si le « prix en direct » était en fait le taux de taxe, on veut le savoir).

**5. Diff.** Diff de lignes par algorithme de Myers (bibliothèque `diff`, quelques ko), puis **appariement** des lignes supprimées et ajoutées adjacentes par similarité de Dice sur les bigrammes (seuil 0,6) pour produire des paires `changed { before, after }` au lieu de deux entrées séparées. Résultat : la liste des `hunks` avec leur chemin.

**6. Extraction numérique et classification.** Pour chaque paire `changed` :
- extraction des nombres avec unité dans `before` et `after`, alignés par position ;
- un **changement numérique** est retenu si au moins une valeur diffère ;
- un dictionnaire de mots-clés tokenomics (fr + en : taxe, tax, fee, frais, redistribu, reward, récompense, burn, brûl, supply, offre, holder, détenteur, LP, liquidit, lock, verrou, vesting, allocation, team, équipe, treasury, trésorerie, airdrop, buyback, rachat) est appliqué au **chemin + texte** ;
- `severity = 'tokenomics'` si changement numérique **et** mot-clé ; `'content'` si le texte change sans nombre ou sans mot-clé ; `'minor'` si seuls la ponctuation, la casse ou des espaces changent.

**Sévérité et signal « non annoncé »** (décision du 2026-09-13 : la sévérité dépend de la nature du changement, pas du délai ; « non annoncé » est un drapeau additionnel, cumulatif).

Deux signaux indépendants :

| Signal | Quand | Sévérité | Canal |
|---|---|---|---|
| **Changement détecté** | immédiatement | `tokenomics` → **prioritaire** (un chiffre de tokenomics qui bouge est prioritaire, annonce ou pas) ; `content` → normale, désactivable par réglage ; `minor` → jamais notifié, visible dans l'onglet | `alert_sent_at` |
| **Modifié sans communication** | à `detected_at + 48 h`, si aucune annonce n'a été associée sur la fenêtre ±48 h | **prioritaire** pour `tokenomics`, normale pour `content` | `unannounced_alert_sent_at`, `unannounced_flag = 1` |

Association : recherche immédiate sur les 48 h **précédentes**, puis à l'échéance sur la fenêtre complète ±48 h, d'un `claim` ou d'un `news_item` du même token dont le texte contient la valeur d'avant ou la valeur d'après (avec unité) ou deux mots-clés communs. Si trouvé : `announced = 1`, lien vers le claim, mention « annoncé le … » sur le changement. À +48 h sans association : `unannounced_flag = 1`, second signal envoyé, et un `claim` d'origine `website` au statut `contradicted` est créé automatiquement, lié au changement, avec l'ancienne valeur comme texte.

Le message du premier signal pour un changement `tokenomics` : « Tokenomics modifiées sur <page> : <chemin> — 80 % → 50 %. Annonce associée : aucune trouvée pour l'instant, réévaluation dans 48 h. » Le second : « Modifié sans communication : le changement 80 % → 50 % du <date> n'a été accompagné d'aucune annonce dans les 48 h avant ou après. »

### B.4 Engagements : cycle de vie

- **Création** : manuelle (formulaire : URL, texte collé, date, type, échéance), par oEmbed X (URL → texte, auteur, date remplis automatiquement, le texte reste modifiable **uniquement** avant enregistrement, ensuite figé), par release GitHub (titre + corps), par diff de site (voir ci-dessus).
- **Extraction** à la création : nombres avec unité et contexte, échéance si le texte contient une date ou un délai (« d'ici fin septembre », « within 7 days »), sous-type par mots-clés. Tout est proposé, rien n'est imposé : l'utilisateur confirme.
- **Vérification** : selon `verification_kind`,
  - `supply_decrease` : à l'échéance, `supply_events` cumulés depuis `published_at` ; si la baisse atteint la valeur annoncée à 10 % près → `kept` (auto) ; sinon `contradicted` (auto), avec les deux chiffres. Un engagement sans échéance est réévalué chaque jour et passe `expired` après 30 jours sans effet.
  - `lp_lock` : lecture RugCheck déjà en place ; `kept` si `lpLockedPct` ≥ valeur annoncée.
  - `wallet_transfer` : présence d'une `onchain_action` correspondante.
  - `page_content` : le texte de la page contient toujours la valeur promise.
  - Sans `verification_kind` : statut manuel uniquement.
- Une résolution automatique est toujours **modifiable à la main**, avec `resolved_by` qui passe à `manual` et une note obligatoire.
- Les engagements ne sont jamais supprimés. Un engagement erroné est marqué `expired` avec une note.

### B.5 Actualités : déduplication et signaux de promotion

**Déduplication**, dans l'ordre : `canonical_url` (schéma et hôte en minuscules, paramètres `utm_*`, `ref`, `source`, `fbclid` retirés, ancre retirée) ; sinon `dedup_key = sha1(titre normalisé)` où le titre normalisé est en minuscules, sans ponctuation ni mots vides, sur une fenêtre de 72 h. Le premier fournisseur qui a remonté l'item est conservé, les autres sont ajoutés dans `promo_flags` sous forme `{ code: 'also_seen_on', detail: 'cryptopanic' }` pour information.

**Signaux de promotion** (`kind = 'promo'`, affichés à part, visuellement dévalués) :

| Code | Règle |
|---|---|
| `price_prediction` | titre ou URL contenant « price prediction », « prédiction de prix », « forecast », « price target » **et** une année ≥ année courante + 1, **et** token âgé de moins de 90 jours |
| `pr_wire` | domaine dans la liste des fils de communiqués payants (GlobeNewswire, PRNewswire, AccessWire, Business Wire, Newsfile, Chainwire, Cointelegraph et Bitcoinist sur les chemins `/press-releases`, …), liste éditable |
| `sponsored_mention` | contenu ou titre contenant « sponsored », « sponsorisé », « partner content », « paid partnership », « Made with AI », « advertorial » |
| `young_multi_token_domain` | domaine vu pour la première fois dans la base il y a moins de 30 jours **et** présent sur au moins 3 tokens suivis |
| `also_seen_on` | information de déduplication, sans dévaluation |

Le repérage des **comptes X récents ou multi-tokens** demande l'API X : non réalisable en v1, indiqué comme tel dans l'interface.

### B.6 Actions on-chain de l'équipe

- Wallets : `token.creator_address` ajouté automatiquement au label `creator` ; les autres à la main, avec possibilité d'importer les 20 premiers détenteurs du dernier snapshot pour en étiqueter certains.
- Collecte toutes les 15 min via Helius Enhanced Transactions (adaptateur existant), 100 dernières transactions par wallet, dédupliquées par signature.
- Classification : `TRANSFER` du token vers une adresse étiquetée `exchange:*` → `transfer_out` vers exchange ; `SWAP` où le token est vendu → `swap_sell` ; `BURN` → `burn` ; `WITHDRAW_LIQUIDITY` → `lp_remove` ; changement d'autorité détecté par la santé structurelle → `authority_change`.
- Étiquettes d'adresses : fichier `seed/address-labels.json` livré avec l'application (à compléter : je ne fournirai que des adresses que je peux vérifier publiquement au moment de l'implémentation), enrichi par Solscan `/account/metadata` si la clé est configurée (100 CU par adresse, mis en cache sans expiration).
- Alertes : `team_transfer_to_exchange` (tout transfert sortant vers un exchange > 0,5 % de l'offre ou > 10 k$), `team_lp_remove`, `team_sell` (swap de vente > 1 % de l'offre). Silence 6 h.

### B.7 Onglets et données qu'ils lisent

| Onglet | Lit | Tri |
|---|---|---|
| Engagements | `claims` filtrés par statut et type | Date de publication décroissante |
| Changements détectés | `page_changes` avec les deux valeurs, le chemin, le lien vers les deux snapshots | Détection décroissante, `tokenomics` en tête |
| Dire vs faire | Frise : en haut `claims` + `news_items` de type `listing` ; en bas `onchain_actions`, `supply_events`, `page_changes` | Chronologique, même axe |
| Signaux de promotion | `news_items` de kind `promo` | Date, section séparée |
| Actualités | `news_items` de kind `news` et `listing`, jamais mélangés aux engagements | Date |

### B.8 Jobs et réglages

| Job | Cadence | Rôle |
|---|---|---|
| `watch-pages` | `*/10 * * * *` (traite les sources dont `next_check_at` est échu ; intervalle par source 6 h) | Récupération selon le mode (`html` fetch, `json_api` fetch JSON, `headless` via le service `renderer`), normalisation, diff |
| `watch-news` | `0 * * * *` | CryptoPanic, RSS, flux exchanges, déduplication, signaux de promotion |
| `watch-onchain` | `*/15 * * * *` | Wallets équipe, `supply_events` depuis la série d'offre |
| `watch-review` | `30 * * * *` | Échéances des engagements, vérifications automatiques, réévaluation à 48 h des changements non annoncés |
| `market-slippage` | `0 7 * * *` + à la demande | Slippage quotidien pour l'historique |
| `watch-maintenance` | `0 4 * * *` | Purge `raw_html` > 90 j, `page_checks` > 180 j |

Réglages (`app_settings`, module `watch`) : fenêtre d'association 48 h, seuil de similarité 0,6, nombre de passages avant « volatile » 3, dictionnaire de mots-clés, liste des fils de communiqués, seuils des alertes on-chain, âge token pour `price_prediction` 90 j, notification des changements `content` (oui / non), attente de rendu `headless` 3 000 ms. Défauts versionnés dans `packages/shared/src/defaults/watch.ts`, remise à zéro **par module**.

Ajout à `docker-compose.yml` : service `renderer` (image Playwright, Chromium seul, 512 Mo, réseau interne uniquement). Variable `RENDERER_URL` côté API ; absente = découverte et mode `headless` indisponibles, annoncés comme tels.

### B.9 Nouvelles variables d'environnement

| Variable | Rôle |
|---|---|
| `WATCH_USER_AGENT_CONTACT` | Courriel ou URL inséré dans le `User-Agent` des snapshots |
| `CRYPTOPANIC_API_KEY` | Optionnel, palier développeur gratuit |
| `GITHUB_TOKEN` | Optionnel, passe de 60 à 5 000 requêtes par heure |
| `X_BEARER_TOKEN` | Optionnel, adaptateur API X v2 ; sans lui, oEmbed + saisie assistée |

---

## Partie C — Tests prévus

1. Décélération : 6 h +16 %, 1 h −10 %, 5 min −2 % → `extinction` ; 24 h +5 %, 6 h +10 %, 1 h +20 %, 5 min +3 % → `acceleration` ; marché plat ±0,3 % → `none` ; volume 5 min nul → `insufficient`.
2. Écart de prix : 1,9 % → aucun drapeau ; 2,5 % une fois → drapeau visuel sans alerte ; 2,5 % trois relevés → alerte.
3. Capitalisation : source = FDV à 0,05 % près → `mcap_source_is_fdv` ; écart 7 % → drapeau.
4. Slippage : réponse Jupiter mise en cache 60 s par couple token / taille (deux appels à 30 s d'écart → un seul appel sortant) ; repli produit constant sur pool Raydium AMM v4, réserve 100 k$, ordre 1 k$ → 1,96 %, ordre 10 k$ → 16,7 % ; pool Meteora DLMM sans Jupiter → « indisponible » avec raison.
5. Retrait de liquidité : ratio 6 % → 4,5 % en 24 h avec prix +1 % → alerte ; même baisse avec prix −12 % → pas d'alerte ; liquidité migrée vers un nouveau pool à total constant → information, pas d'alerte.
6. Intégrité des courbes : historique avec changement de source à J−3 → deux groupes, jamais un tableau unique.
7. Normalisation : `80 %`, `80%`, `80 percent` → même valeur ; `1.5M` et `1 500 000` → même valeur ; espaces insécables.
8. Diff : page avec « 80% of taxes redistributed » → « 50% of taxes redistributed » → un hunk `changed`, un changement numérique 80 → 50 unité %, severity `tokenomics`, chemin `Tokenomics > …`.
9. Lignes volatiles : un prix qui change trois fois de suite → exclu du diff au quatrième passage ; retrait manuel → réintégré.
10. Sévérité et association : changement `tokenomics` → alerte prioritaire immédiate quelle que soit l'annonce ; claim daté J−1 contenant « 50% » → `announced = 1`, pas de second signal ; aucun claim → `unannounced_flag = 1` et second signal à +48 h ; changement `content` → notification normale, pas de drapeau prioritaire.
11. Site rendu côté client : HTML avec `<div id="app"></div>` → découverte lancée ; réponses JSON capturées listées dans `discovered_endpoints` ; statut `needs_mode_choice` tant que rien n'est choisi.
11 bis. Mode `json_api` : `{ "tax": { "holders": 80 } }` → `{ "tax": { "holders": 50 } }` → un changement numérique au chemin `tax/holders`, severity `tokenomics` ; un tableau réordonné d'objets avec `id` → aucun changement.
11 ter. Mode `headless` : service `renderer` absent → statut `render_error` explicite, aucune fausse détection de « page vidée ».
11 quater. Changement de mode `html` → `json_api` → nouveau snapshot de référence, aucun `page_change` créé.
12. `robots.txt` interdisant le chemin → `blocked_by_robots`, aucune requête sur la page.
13. Engagement burn 5 % à 7 jours : `supply_events` −5,2 % → `kept` auto ; −0,4 % → `contradicted` auto ; modification manuelle → `resolved_by = manual`.
14. Déduplication : même article via CryptoPanic et RSS avec `utm_source` différent → une seule ligne, `also_seen_on`.
15. Promotion : « X Price Prediction 2030 » sur un token de 20 jours → `promo` ; même titre sur un token de 2 ans → `news`.
16. On-chain : transfert de 1 % de l'offre du wallet créateur vers une adresse `exchange:kraken` → `transfer_out` + alerte.

---

## Partie D — État des points

Tranchés le 2026-09-13 (voir le journal des décisions en tête) : slippage, offre nette, sites rendus côté client, sévérité et drapeau « non annoncé », réglages communs, Discord / Telegram en entrée.

Restent ouverts, avec la proposition par défaut qui sera appliquée sans avis contraire :

1. **État de dérivée** : rythme horaire linéaire avec tolérance 0,5 point par pas. Alternative : exiger un écart d'au moins 2 points entre le rythme 1 h et le rythme 24 h avant de qualifier quoi que ce soit, pour ne jamais étiqueter un marché plat.
2. **X** : oEmbed officiel + saisie assistée, donc suivi manuel affiché comme tel. Alternative : budget pour l'API X v2 Basic.
3. **Actualités** : CryptoPanic (si le token y est référencé) + RSS Google News sur le nom + flux officiels d'exchanges, Kraken en premier, chemins vérifiés à l'implémentation.
4. **Wallets équipe** : créateur ajouté automatiquement, autres à la main ; étiquettes d'exchanges depuis un fichier amorce, complété par Solscan `/account/metadata` si la clé existe.
