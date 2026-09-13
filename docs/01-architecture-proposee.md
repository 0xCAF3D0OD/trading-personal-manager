# Proposition d'architecture — dashboard de surveillance de tokens Solana

> Document de cadrage à valider **avant** l'écriture du code.
> Version 0.1 — 2026-09-13

---

## 1. Décisions de structure

| Sujet | Choix proposé | Pourquoi |
|---|---|---|
| Organisation | Monorepo `pnpm workspaces` : `apps/web`, `apps/api`, `packages/shared` | Types partagés (Zod) entre front et back, une seule commande d'install, un seul lockfile. |
| Backend | **Fastify** + TypeScript | Écosystème mature pour ce qu'on a besoin : `@fastify/rate-limit`, `@fastify/cors`, schémas de validation intégrés, logs Pino. Hono est très bien aussi mais son rate-limit et son scheduler sont moins « clé en main ». |
| Persistance | **SQLite via better-sqlite3**, migrations SQL numérotées | L'historisation quotidienne est le coeur de l'outil ; un fichier JSON deviendrait ingérable dès qu'on requête « les 30 derniers snapshots de ce token ». |
| Scheduler | `node-cron` dans le process API (pas de worker séparé) | Mono-utilisateur, un seul process suffit. Un worker séparé complexifie le compose sans gain. |
| Graphiques | **uPlot** | ~40 ko, conçu pour les séries temporelles, suffit pour offre / détenteurs / prix. |
| Cache | Cache mémoire (`Map` + TTL) devant chaque `DataSource`, **plus** persistance du dernier résultat en SQLite | Le cache mémoire disparaît au redémarrage du conteneur ; sans persistance, chaque `docker compose up` rebrûlerait des CU Solscan. |
| Notifications | `ntfy` en premier (zéro compte, un `curl`), Telegram et Discord via webhook derrière la même interface `Notifier` | Web Push impose un service worker, des clés VAPID et un onglet ouvert. À garder pour plus tard. |

### Ce qui n'est PAS dans le périmètre (rappel des pièges)

- Pas de score agrégé, pas de RSI / MACD / moyennes mobiles.
- Pas de bouton achat / vente. L'app observe, historise, alerte.
- Pas de clé API côté navigateur : aucune variable `VITE_*` ne contient de secret.

### Extension optionnelle : valeur du portefeuille Kraken

Tu as mentionné vouloir suivre en temps réel la valeur de ton portefeuille sur Kraken. Ce n'est pas dans le cahier des charges détaillé, donc je le propose comme **module optionnel désactivé par défaut** :

- Clé API Kraken **lecture seule** (permission « Query Funds » uniquement, rien d'autre), lue depuis l'env côté backend, jamais exposée.
- Une seule route `GET /api/portfolio` : soldes × prix de référence, avec la source du prix affichée.
- Aucune route d'ordre. Le module ne sait pas passer d'ordre, par construction.

À valider : on l'inclut dans la v1 ou on le garde pour une v2 ?

---

## 2. Arborescence proposée

```
trading-personal-manager/
├── apps/
│   ├── api/                              # Backend proxy Fastify (TypeScript)
│   │   ├── src/
│   │   │   ├── index.ts                  # Bootstrap : env, db, plugins, routes, scheduler
│   │   │   ├── config/
│   │   │   │   └── env.ts                # Lecture + validation Zod des variables d'env (échec au démarrage si clé absente)
│   │   │   ├── db/
│   │   │   │   ├── client.ts             # Ouverture better-sqlite3, PRAGMA (WAL, foreign_keys)
│   │   │   │   ├── migrate.ts            # Applique migrations/*.sql dans l'ordre
│   │   │   │   ├── migrations/
│   │   │   │   │   ├── 0001_init.sql
│   │   │   │   │   └── 0002_kraken.sql   # (optionnel)
│   │   │   │   └── repositories/         # Une classe par table, requêtes préparées
│   │   │   │       ├── tokens.repo.ts
│   │   │   │       ├── snapshots.repo.ts
│   │   │   │       ├── plans.repo.ts
│   │   │   │       ├── alerts.repo.ts
│   │   │   │       ├── usage.repo.ts
│   │   │   │       └── cache.repo.ts
│   │   │   ├── datasources/              # Couche d'abstraction DataSource
│   │   │   │   ├── types.ts              # Interfaces : PriceSource, SupplySource, HoldersSource, MetaSource…
│   │   │   │   ├── registry.ts           # Choisit la source par type de donnée (gratuite d'abord, Solscan en repli)
│   │   │   │   ├── rpc/
│   │   │   │   │   └── solana-rpc.source.ts      # getTokenSupply, getTokenLargestAccounts, getAccountInfo, Token-2022 extensions
│   │   │   │   ├── dexscreener/
│   │   │   │   │   └── dexscreener.source.ts     # prix, volume 24h, liquidité, âge du pool
│   │   │   │   ├── jupiter/
│   │   │   │   │   └── jupiter-price.source.ts   # prix de référence
│   │   │   │   ├── solscan/
│   │   │   │   │   ├── solscan.client.ts         # fetch + header token + compteur CU + gestion 429 / quota
│   │   │   │   │   └── solscan.source.ts         # holders, meta, markets, defi activities, usage
│   │   │   │   └── kraken/                        # (optionnel)
│   │   │   │       └── kraken.source.ts           # Balance (lecture seule, signature HMAC)
│   │   │   ├── cache/
│   │   │   │   ├── ttl-cache.ts          # Cache mémoire générique avec TTL par clé
│   │   │   │   └── ttl-policy.ts         # Table des TTL par type de donnée (une seule source de vérité)
│   │   │   ├── services/                 # Logique métier, indépendante de HTTP
│   │   │   │   ├── token.service.ts      # Ajout (validation adresse, résolution meta), suppression, ordre
│   │   │   │   ├── health.service.ts     # Santé structurelle : mint/freeze authority, Token-2022, créateur, LP lock
│   │   │   │   ├── holders.service.ts    # Concentration top 5/10/50/100, tranches de valeur
│   │   │   │   ├── supply.service.ts     # Offre, taux de burn 24h/7j/30j
│   │   │   │   ├── market.service.ts     # Prix, volume, ratio volume/capi, divergence entre sources de prix
│   │   │   │   ├── divergence.service.ts # Les 4 règles de divergence, calculées sur les snapshots
│   │   │   │   ├── plan.service.ts       # Journal de discipline, immuable, versionné
│   │   │   │   ├── alert.service.ts      # Évaluation des règles, anti-rebond, journal des déclenchements
│   │   │   │   └── notify/
│   │   │   │       ├── notifier.ts       # Interface Notifier + fan-out
│   │   │   │       ├── ntfy.notifier.ts
│   │   │   │       ├── telegram.notifier.ts
│   │   │   │       └── discord.notifier.ts
│   │   │   ├── jobs/
│   │   │   │   ├── scheduler.ts          # Enregistrement node-cron
│   │   │   │   ├── snapshot-market.job.ts    # Toutes les 15 min : prix, volume, offre (sources gratuites)
│   │   │   │   ├── snapshot-holders.job.ts   # 1×/jour : détenteurs + concentration (Solscan + RPC)
│   │   │   │   └── evaluate-alerts.job.ts    # Toutes les minutes : règles de prix et de divergence
│   │   │   ├── routes/                   # Fins, délèguent aux services
│   │   │   │   ├── tokens.routes.ts      # CRUD watchlist + réordonnancement
│   │   │   │   ├── token-detail.routes.ts# health, holders, supply, market, divergences, history
│   │   │   │   ├── plans.routes.ts
│   │   │   │   ├── alerts.routes.ts
│   │   │   │   ├── system.routes.ts      # /health, /usage (CU Solscan + compteur local), /sources (état dégradé)
│   │   │   │   └── portfolio.routes.ts   # (optionnel Kraken)
│   │   │   └── plugins/
│   │   │       ├── rate-limit.ts         # @fastify/rate-limit : par route, plus strict sur ce qui touche Solscan
│   │   │       └── error-handler.ts      # Erreurs typées → réponses { error, source, degraded }
│   │   ├── test/                         # Vitest : divergence.service, supply.service, plan immutabilité
│   │   ├── Dockerfile                    # multi-stage (build → runtime node:22-alpine, better-sqlite3 compilé)
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                              # Frontend Vue 3 + Vite
│       ├── src/
│       │   ├── main.ts                   # createApp, Pinia, VueQuery, router
│       │   ├── App.vue
│       │   ├── router.ts                 # / (watchlist), /token/:address, /token/:address/journal, /alerts, /system
│       │   ├── api/                      # Client HTTP typé vers NOTRE backend uniquement
│       │   │   ├── http.ts               # fetch wrapper, base URL /api, gestion { degraded }
│       │   │   ├── tokens.api.ts
│       │   │   ├── plans.api.ts
│       │   │   ├── alerts.api.ts
│       │   │   └── system.api.ts
│       │   ├── queries/                  # Hooks vue-query : clés, staleTime alignés sur les TTL backend
│       │   │   ├── useWatchlist.ts
│       │   │   ├── useTokenDetail.ts
│       │   │   ├── useTokenHistory.ts
│       │   │   ├── usePlans.ts
│       │   │   └── useUsage.ts
│       │   ├── stores/                   # Pinia : état UI uniquement (pas de cache de données serveur)
│       │   │   ├── ui.store.ts           # thème, ordre local d'affichage, préférences
│       │   │   └── notifications.store.ts# toasts, bandeau « mode dégradé »
│       │   ├── views/
│       │   │   ├── WatchlistView.vue
│       │   │   ├── TokenDetailView.vue
│       │   │   ├── JournalView.vue
│       │   │   ├── AlertsView.vue
│       │   │   ├── SystemView.vue        # usage CU, état des sources, dernier snapshot
│       │   │   └── PortfolioView.vue     # (optionnel Kraken)
│       │   ├── components/
│       │   │   ├── watchlist/
│       │   │   │   ├── AddTokenForm.vue          # validation base58 + longueur avant appel
│       │   │   │   └── TokenRow.vue
│       │   │   ├── token/
│       │   │   │   ├── StructuralHealthCard.vue  # liste d'items OK / attention / risque
│       │   │   │   ├── HolderConcentrationCard.vue
│       │   │   │   ├── SupplyCard.vue
│       │   │   │   ├── MarketCard.vue            # chaque chiffre avec sa source
│       │   │   │   └── DivergencePanel.vue       # chaque divergence + ses deux séries
│       │   │   ├── journal/
│       │   │   │   ├── PlanForm.vue              # case « ce montant peut aller à zéro » obligatoire
│       │   │   │   └── PlanHistory.vue           # toutes les versions, diff des seuils
│       │   │   ├── charts/
│       │   │   │   ├── TimeSeriesChart.vue       # wrapper uPlot
│       │   │   │   └── DualSeriesChart.vue       # deux axes, pour les divergences
│       │   │   └── shared/
│       │   │       ├── StatusBadge.vue
│       │   │       ├── SourceTag.vue             # « DexScreener · il y a 42 s »
│       │   │       └── DegradedBanner.vue
│       │   ├── composables/
│       │   │   ├── useSolanaAddress.ts   # validation format
│       │   │   └── useFormat.ts          # nombres, %, dates
│       │   └── styles/
│       │       └── base.css
│       ├── index.html
│       ├── vite.config.ts                # proxy /api → api:3000 en dev
│       ├── Dockerfile                    # multi-stage : build Vite → nginx:alpine
│       ├── nginx.conf                    # sert le build + reverse proxy /api
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/                           # Types et schémas partagés (Zod → types TS)
│       ├── src/
│       │   ├── schemas/
│       │   │   ├── token.schema.ts
│       │   │   ├── snapshot.schema.ts
│       │   │   ├── plan.schema.ts
│       │   │   ├── alert.schema.ts
│       │   │   └── api.schema.ts         # enveloppe de réponse { data, source, fetchedAt, degraded }
│       │   ├── divergence-rules.ts       # Définition des règles (seuils, fenêtres) partagée, affichée telle quelle dans l'UI
│       │   └── index.ts
│       └── package.json
│
├── data/                                 # Volume Docker : app.db (gitignoré)
├── docs/
│   ├── 01-architecture-proposee.md       # ce document
│   └── 02-regles-divergence.md           # (à venir) formules exactes, exemples chiffrés
├── docker-compose.yml                    # api + web, volume ./data, env_file .env
├── .env.example
├── pnpm-workspace.yaml
├── package.json                          # scripts racine : dev, build, test, lint, db:migrate
├── tsconfig.base.json
├── .gitignore                            # à compléter : node_modules, dist, data/*.db, .env
├── LICENSE
└── README.md
```

---

## 3. Schéma de données (SQLite)

### Choix : deux tables de snapshots au lieu d'une

Le cahier des charges propose une table `snapshots` unique. Je propose de la **scinder en deux**, car les deux familles de données n'ont ni la même cadence, ni le même coût, ni la même source :

- `market_snapshots` : prix, capitalisation, volume, offre. Sources gratuites, **toutes les 15 min**. Plusieurs milliers de lignes par token par mois, ce n'est rien pour SQLite.
- `holder_snapshots` : nombre de détenteurs, concentration, tranches. Solscan + RPC, **une fois par jour**. Coûteux en CU, on ne veut surtout pas les mélanger avec une cadence rapide.

Les divergences croisent les deux tables par `token_id` et par jour. Si tu préfères garder une seule table avec des colonnes nullables, c'est faisable, mais on perd la clarté sur « quelle ligne a coûté des CU ».

### Tables

```sql
-- Watchlist
CREATE TABLE tokens (
  id              INTEGER PRIMARY KEY,
  address         TEXT NOT NULL UNIQUE,          -- mint address, base58
  symbol          TEXT,
  name            TEXT,
  decimals        INTEGER NOT NULL,
  program         TEXT NOT NULL,                 -- 'spl-token' | 'token-2022'
  created_at      INTEGER,                       -- unix s, date du premier mint (Solscan meta ou 1re tx)
  creator_address TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  added_at        INTEGER NOT NULL,              -- unix s
  archived_at     INTEGER                        -- suppression logique : on garde l'historique
);

-- Santé structurelle : calculée rarement, stockée en entier (JSON pour les extensions)
CREATE TABLE token_health (
  token_id              INTEGER PRIMARY KEY REFERENCES tokens(id),
  mint_authority        TEXT,                    -- NULL = révoquée
  freeze_authority      TEXT,                    -- NULL = absente
  token2022_extensions  TEXT,                    -- JSON array : ['transferFee', 'permanentDelegate', ...]
  lp_locked             INTEGER,                 -- 0/1/NULL (inconnu)
  lp_lock_protocol      TEXT,                    -- 'raydium-burn' | 'streamflow' | ... | NULL
  lp_lock_source        TEXT,                    -- d'où vient l'info
  checked_at            INTEGER NOT NULL
);

-- Séries rapides, sources gratuites (15 min)
CREATE TABLE market_snapshots (
  id                INTEGER PRIMARY KEY,
  token_id          INTEGER NOT NULL REFERENCES tokens(id),
  ts                INTEGER NOT NULL,            -- unix s
  price_usd         REAL,
  price_source      TEXT NOT NULL,               -- 'dexscreener' | 'jupiter' | 'solscan'
  price_alt_usd     REAL,                        -- 2e source pour afficher l'écart, jamais moyenné
  price_alt_source  TEXT,
  market_cap_usd    REAL,
  fdv_usd           REAL,
  volume_24h_usd    REAL,
  liquidity_usd     REAL,
  supply_circ       REAL,                        -- en unités entières (déjà divisé par 10^decimals)
  supply_total      REAL,
  supply_source     TEXT NOT NULL                -- 'rpc'
);
CREATE INDEX idx_market_token_ts ON market_snapshots(token_id, ts);

-- Séries lentes, coûteuses (1 × / jour)
CREATE TABLE holder_snapshots (
  id                INTEGER PRIMARY KEY,
  token_id          INTEGER NOT NULL REFERENCES tokens(id),
  ts                INTEGER NOT NULL,
  day               TEXT NOT NULL,               -- 'YYYY-MM-DD', une ligne max par token et par jour
  holder_count      INTEGER,
  top5_pct          REAL,
  top10_pct         REAL,
  top50_pct         REAL,
  top100_pct        REAL,
  buckets           TEXT,                        -- JSON : [{ minUsd, maxUsd, count }, ...]
  excluded_accounts TEXT,                        -- JSON : pools LP / burn exclus du calcul de concentration
  source            TEXT NOT NULL,               -- 'solscan' | 'rpc' | 'solscan+rpc'
  cu_spent          INTEGER NOT NULL DEFAULT 0,  -- traçabilité du coût
  UNIQUE(token_id, day)
);

-- Activités du wallet créateur (surveillance de dump)
CREATE TABLE creator_activities (
  id            INTEGER PRIMARY KEY,
  token_id      INTEGER NOT NULL REFERENCES tokens(id),
  tx_signature  TEXT NOT NULL UNIQUE,
  ts            INTEGER NOT NULL,
  kind          TEXT NOT NULL,                   -- 'swap' | 'transfer' | 'add_liquidity' | 'remove_liquidity' | ...
  amount        REAL,
  amount_usd    REAL,
  raw           TEXT                             -- JSON brut Solscan, pour ne rien perdre
);

-- Journal de discipline : append-only, jamais UPDATE ni DELETE
CREATE TABLE plans (
  id                  INTEGER PRIMARY KEY,
  token_id            INTEGER NOT NULL REFERENCES tokens(id),
  version             INTEGER NOT NULL,          -- 1, 2, 3… par token
  supersedes_plan_id  INTEGER REFERENCES plans(id),
  created_at          INTEGER NOT NULL,
  entry_price         REAL NOT NULL,
  take_profit_price   REAL NOT NULL,
  stop_loss_price     REAL NOT NULL,
  amount_usd          REAL NOT NULL,
  accepts_total_loss  INTEGER NOT NULL CHECK (accepts_total_loss = 1),  -- refus en base si non coché
  note                TEXT,
  UNIQUE(token_id, version)
);
-- Un trigger SQLite interdira UPDATE et DELETE sur plans (RAISE(ABORT)).

-- Règles d'alerte
CREATE TABLE alerts (
  id              INTEGER PRIMARY KEY,
  token_id        INTEGER NOT NULL REFERENCES tokens(id),
  type            TEXT NOT NULL,   -- 'price_above' | 'price_below' | 'plan_tp' | 'plan_sl'
                                   -- | 'div_distribution' | 'div_avg_position' | 'div_concentration_up_price'
                                   -- | 'div_burn_slowdown' | 'creator_sell' | 'mint_authority_changed'
  threshold       REAL,            -- NULL pour les divergences (seuils dans divergence-rules.ts)
  plan_id         INTEGER REFERENCES plans(id), -- si l'alerte dérive d'un plan
  enabled         INTEGER NOT NULL DEFAULT 1,
  cooldown_s      INTEGER NOT NULL DEFAULT 21600, -- anti-rebond : 6 h par défaut
  last_fired_at   INTEGER,
  created_at      INTEGER NOT NULL
);

-- Historique des déclenchements (pour afficher « ce que je m'étais fixé »)
CREATE TABLE alert_events (
  id            INTEGER PRIMARY KEY,
  alert_id      INTEGER NOT NULL REFERENCES alerts(id),
  fired_at      INTEGER NOT NULL,
  observed      REAL,              -- valeur constatée
  threshold     REAL,              -- seuil au moment du tir
  rule_text     TEXT NOT NULL,     -- phrase lisible : « TP fixé à 0,0042 $ le 2026-09-10 (plan v2) »
  payload       TEXT,              -- JSON : séries ayant servi au calcul (pour les divergences)
  delivered_to  TEXT,              -- JSON : ['ntfy', 'telegram'] + erreurs éventuelles
  acknowledged_at INTEGER
);

-- Consommation des API externes
CREATE TABLE api_usage (
  id          INTEGER PRIMARY KEY,
  ts          INTEGER NOT NULL,
  provider    TEXT NOT NULL,       -- 'solscan' | 'dexscreener' | 'rpc' | 'jupiter' | 'kraken'
  endpoint    TEXT NOT NULL,
  cu          INTEGER NOT NULL DEFAULT 0,
  status      INTEGER,             -- HTTP
  cache_hit   INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER
);
CREATE INDEX idx_usage_ts ON api_usage(ts);

-- Cache persistant (survit au redémarrage, évite de rebrûler des CU)
CREATE TABLE cache_entries (
  key         TEXT PRIMARY KEY,    -- 'solscan:holders:<mint>:p1'
  value       TEXT NOT NULL,       -- JSON
  source      TEXT NOT NULL,
  fetched_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

-- (optionnel) Portefeuille Kraken
CREATE TABLE portfolio_snapshots (
  id          INTEGER PRIMARY KEY,
  ts          INTEGER NOT NULL,
  asset       TEXT NOT NULL,       -- code Kraken normalisé
  balance     REAL NOT NULL,
  price_usd   REAL,
  price_source TEXT,
  value_usd   REAL
);
```

### Relations

```
tokens 1 ── 1 token_health
tokens 1 ── n market_snapshots
tokens 1 ── n holder_snapshots
tokens 1 ── n creator_activities
tokens 1 ── n plans ── (supersedes) ── plans
tokens 1 ── n alerts ── n alert_events
plans  1 ── n alerts   (alertes TP / SL dérivées d'un plan)
```

---

## 4. Contrat des routes backend (aperçu)

Toutes sous `/api`. Chaque réponse est enveloppée :

```ts
{ data: T, meta: { source: string, fetchedAt: number, cached: boolean, degraded?: { provider, reason } } }
```

| Méthode | Route | Rôle | Touche Solscan ? |
|---|---|---|---|
| GET | `/tokens` | watchlist + dernier market snapshot | non |
| POST | `/tokens` | ajout par adresse (validée) | oui, 1 fois (meta) |
| DELETE | `/tokens/:id` | archivage logique | non |
| PATCH | `/tokens/order` | réordonnancement | non |
| GET | `/tokens/:id/health` | santé structurelle | non (RPC), Solscan en repli pour le créateur |
| GET | `/tokens/:id/holders` | dernière concentration + historique | non (lit la base) |
| POST | `/tokens/:id/holders/refresh` | force un snapshot détenteurs | **oui** (rate-limité : 1 / 6 h / token) |
| GET | `/tokens/:id/supply` | offre + taux de burn | non |
| GET | `/tokens/:id/market` | prix, volume, ratio, écart entre sources | non |
| GET | `/tokens/:id/divergences` | les 4 règles + séries | non |
| GET | `/tokens/:id/creator` | activités du créateur | oui (TTL 1 h) |
| GET / POST | `/tokens/:id/plans` | journal (POST crée toujours une nouvelle version) | non |
| GET / POST / PATCH | `/alerts` | règles (PATCH limité à `enabled`, `cooldown_s`) | non |
| GET | `/alerts/events` | historique des tirs | non |
| GET | `/system/usage` | CU consommés (local) + `GET /monitor/usage` Solscan (TTL 10 min) | oui, rare |
| GET | `/system/sources` | état de chaque provider : ok / dégradé / quota | non |
| GET | `/portfolio` | (optionnel) soldes Kraken valorisés | non (Kraken) |

---

## 5. Budget Solscan estimé

Hypothèse : 5 tokens surveillés, plan Solscan Pro à 100 CU par appel v2.0.

| Appel | Fréquence | CU / jour / token |
|---|---|---|
| `/token/meta` (nb de détenteurs, créateur) | 1 / jour | 100 |
| `/token/holders` top 100 (pagination 40 → 3 pages) | 1 / jour | 300 |
| `/account/defi/activities` (créateur) | à la demande, TTL 1 h, max 4 / jour | ≤ 400 |
| `/token/markets` (LP lock) | 1 / semaine | ~15 |
| **Total** | | **≈ 400 à 800** |

Soit **2 000 à 4 000 CU / jour pour 5 tokens**, environ 60 000 à 120 000 CU / mois. Le top 5 et le top 10 viennent du RPC (`getTokenLargestAccounts`, 20 comptes, gratuit) ; Solscan ne sert que pour le top 50 / top 100 et le nombre total de détenteurs.

Si le quota approche 80 %, le job détenteurs passe automatiquement à un jour sur deux et l'UI affiche le bandeau dégradé.

---

## 6. Variables d'environnement prévues (`.env.example`)

```
# --- Backend ---
PORT=3000
DATABASE_PATH=./data/app.db
LOG_LEVEL=info

# Solscan Pro (obligatoire pour la concentration au-delà du top 20)
SOLSCAN_API_KEY=
SOLSCAN_MONTHLY_CU_BUDGET=1000000        # utilisé pour le mode dégradé automatique

# RPC Solana : public par défaut, Helius recommandé (gratuit jusqu'à un certain volume)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
# SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...

# Jobs (cron)
CRON_MARKET_SNAPSHOT=*/15 * * * *
CRON_HOLDER_SNAPSHOT=0 6 * * *           # 06:00 tous les jours
CRON_ALERT_EVAL=* * * * *

# Notifications (au moins un canal)
NTFY_URL=https://ntfy.sh
NTFY_TOPIC=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
DISCORD_WEBHOOK_URL=

# Rate limit des routes internes
RATE_LIMIT_MAX=120                       # requêtes / minute / IP
RATE_LIMIT_SOLSCAN_ROUTES_MAX=10         # sur les routes qui peuvent déclencher Solscan

# (optionnel) Kraken, lecture seule — permission "Query Funds" uniquement
KRAKEN_API_KEY=
KRAKEN_API_SECRET=

# --- Frontend --- (aucun secret, VITE_* est public)
VITE_API_BASE=/api
```

---

## 7. Points à valider avant le code

1. **Fastify plutôt que Hono** : OK ?
2. **Deux tables de snapshots** (`market_snapshots` / `holder_snapshots`) au lieu d'une : OK ?
3. **Module Kraken** (valeur du portefeuille, lecture seule) : v1 ou v2 ?
4. **Canal de notification** prioritaire : ntfy, Telegram ou Discord ? (les trois seront câblés, mais lequel testes-tu en premier ?)
5. **Adresses de contrat** des tokens à surveiller (Embercurve, The Patriotes) : je ne les devine pas, je préfère que tu me les colles depuis Solscan ou DexScreener pour éviter tout homonyme.
6. **Seuils des divergences** : je propose des valeurs par défaut dans `divergence-rules.ts` (ex. distribution = détenteurs +5 % sur 7 j ET capi ≤ 0 % sur 7 j). Tu les ajusteras ensuite, mais veux-tu les définir toi-même dès maintenant ?

---

## 8. Complément

Voir `02-matrice-des-sources.md` pour l'attribution détaillée de chaque donnée à une source gratuite, et la définition des trois paliers de configuration (RPC public / Helius / Solscan). En palier Helius, la consommation Solscan récurrente tombe à zéro.

## 9. Décisions validées le 2026-09-13 et écarts d'implémentation

- Validé : Fastify, deux tables de snapshots, Helius comme palier recommandé, ntfy en premier canal, Kraken reporté en v2.
- **npm workspaces** au lieu de pnpm : pnpm n'est pas installé sur la machine cible et npm ≥ 10 couvre le besoin.
- **`node:sqlite`** au lieu de better-sqlite3 : module intégré à Node ≥ 22.13, même API synchrone, aucune compilation native (Node 26 local, image Docker `node:24-alpine`). Les migrations SQL, les triggers d'immuabilité et les repositories sont indépendants de ce choix.
- Deux sources gratuites ajoutées par rapport au cahier des charges : Helius DAS (détenteurs complets) et RugCheck (verrouillage de liquidité), voir `02-matrice-des-sources.md`.
- Table `job_runs` ajoutée pour afficher l'état des jobs dans la vue Système ; colonnes `top20_pct`, `top_holders`, `truncated` ajoutées à `holder_snapshots`.
