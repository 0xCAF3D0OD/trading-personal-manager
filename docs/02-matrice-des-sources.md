# Matrice des sources — gratuit d'abord, Solscan en dernier recours

> Complément de `01-architecture-proposee.md`. Chaque donnée affichée par l'app
> a une source primaire gratuite, éventuellement une source secondaire gratuite,
> et Solscan uniquement si rien de gratuit ne couvre le besoin.
> Version 0.1 — 2026-09-13

---

## 1. Principe : trois paliers de configuration

Le backend s'adapte à ce qui est configuré dans l'env. Rien n'est obligatoire sauf un RPC.

| Palier | Variables renseignées | Ce que l'app sait faire |
|---|---|---|
| **A. RPC public seul** | `SOLANA_RPC_URL` (mainnet-beta public) | Santé structurelle, offre et burn, top 20 comptes (donc top 5 / top 10), prix et volume via DexScreener et Jupiter, divergences basées sur l'offre et le prix. **Pas de nombre total de détenteurs, pas de top 50 / 100.** |
| **B. RPC Helius (plan gratuit)** | `SOLANA_RPC_URL` = URL Helius | Tout le palier A, plus : **nombre total de détenteurs, top 50 / top 100, tranches de valeur**, activités du créateur (transactions parsées). Solscan devient inutile pour le fonctionnement quotidien. |
| **C. + Solscan Pro** | + `SOLSCAN_API_KEY` | Source de **recoupement** et de repli : créateur et date de création si les métadonnées on-chain sont muettes, contrôle ponctuel des chiffres Helius, marchés et pools. Jamais appelé en boucle. |

Le palier B est celui que je recommande. Le plan gratuit Helius se crée en deux minutes et couvre largement moins de 10 tokens surveillés une fois par jour.

---

## 2. Matrice donnée par donnée

Légende coût : **0** = gratuit, **CU** = crédits Solscan (100 par appel v2.0).

### Santé structurelle (TTL 24 h, palier A suffit)

| Donnée | Source primaire | Comment | Repli | Solscan ? |
|---|---|---|---|---|
| Autorité de mint révoquée | RPC `getAccountInfo(mint, jsonParsed)` | champ `mintAuthority` null ou non | — | non |
| Autorité de freeze présente | idem | champ `freezeAuthority` | — | non |
| Programme (SPL Token vs Token-2022) | idem | `owner` du compte mint | — | non |
| Extensions Token-2022 | idem | tableau `extensions` dans le parsing (transferFee, permanentDelegate, transferHook, nonTransferable, defaultAccountState…) | — | non |
| Décimales, offre totale | idem | `decimals`, `supply` | — | non |
| Adresse du créateur | RPC `getAccountInfo(PDA metadata Metaplex)` | `updateAuthority` et tableau `creators` ; pour les tokens pump.fun le créateur y figure | Solscan `/token/meta` (`creator`), une seule fois, mis en cache sans expiration | **repli uniquement** |
| Date de création | RPC `getSignaturesForAddress(mint)` en remontant à la plus ancienne signature | fiable pour les tokens récents ; coûteux si le mint a des millions de transactions (on plafonne à N pages) | Solscan `/token/meta` (`created_time`), une seule fois | **repli uniquement** |
| Liquidité verrouillée | RugCheck `GET /v1/tokens/{mint}/report` (public, sans clé) | `markets[].lp.lpLockedPct`, `lockers` | RPC : offre du LP mint et solde du compte de burn pour Raydium | non |

Note sur RugCheck : c'est une heuristique tierce. On l'affiche avec son étiquette de source et on ne l'agrège avec rien.

### Offre et burn (TTL 15 min, palier A suffit)

| Donnée | Source primaire | Comment | Solscan ? |
|---|---|---|---|
| Offre en circulation | RPC `getTokenSupply(mint)` | `uiAmount`. Sur Solana un burn réduit directement l'offre du mint, donc cette valeur suffit au suivi du burn. | non |
| Taux de burn 24 h / 7 j / 30 j | calcul local sur `market_snapshots.supply_circ` | différence entre la valeur courante et celle du snapshot le plus proche de T − 24 h / 7 j / 30 j | non |
| Offre « hors pools et hors burn » | RPC `getTokenLargestAccounts` + `getMultipleAccounts` sur les propriétaires | on exclut les comptes dont le propriétaire est un programme AMM connu ou l'adresse de burn `1nc1nerator11111111111111111111111111111111` | non |

### Prix et volume (TTL 1 min, palier A suffit)

| Donnée | Source primaire | Source secondaire (affichée à côté, jamais moyennée) | Solscan ? |
|---|---|---|---|
| Prix USD | DexScreener `GET /tokens/v1/solana/{mint}` → paire la plus liquide | Jupiter Price `GET /price/v3?ids={mint}` | non |
| Variation 5 min / 1 h / 6 h / 24 h | DexScreener `priceChange` | — | non |
| Volume 24 h | DexScreener `volume.h24` | — | non |
| Liquidité du pool | DexScreener `liquidity.usd` | — | non |
| Capitalisation / FDV | DexScreener `marketCap`, `fdv` ; recalculé localement `prix × offre RPC` pour contrôle | l'écart entre les deux est affiché | non |
| Âge du pool | DexScreener `pairCreatedAt` | — | non |
| Ratio volume / capi | calcul local | — | non |
| Marchés et pools | DexScreener `pairs[]` (DEX, adresse de paire, liquidité) | Solscan `/token/markets` si on veut la liste exhaustive, TTL 24 h | **optionnel** |

### Détenteurs et concentration (TTL 6 h, snapshot quotidien)

C'est le seul bloc où le palier A est limité.

| Donnée | Palier A (RPC public) | Palier B (Helius gratuit) | Solscan (palier C) |
|---|---|---|---|
| Top 5 %, top 10 % | RPC `getTokenLargestAccounts` (20 comptes), propriétaires résolus, pools et burn exclus | idem | — |
| Top 20 % | idem | idem | — |
| Top 50 %, top 100 % | **indisponible** (affiché « non disponible sans Helius ») | Helius DAS `getTokenAccounts` filtré par `mint`, paginé par curseur (1000 comptes / page), tri local | `/token/holders` (3 pages de 40) |
| Nombre total de détenteurs | **indisponible** | même appel Helius : on compte les comptes à solde > 0 en paginant jusqu'au bout | `/token/meta` (`holder`) |
| Tranches par valeur détenue | approximation sur 20 comptes seulement, non affichée | calcul local : solde × prix, bornes en USD | `/token/holders` avec filtres `value[]` |
| Coût / token / jour | 0 | environ 10 crédits Helius par page ; un token à 50 000 détenteurs ≈ 50 pages | 400 CU |

Pour un token à plusieurs centaines de milliers de détenteurs, la pagination Helius devient longue (plusieurs centaines de pages). Le job impose un plafond de pages configurable ; au-delà, il note le snapshot comme « tronqué » et, si Solscan est configuré, bascule sur `/token/meta` pour le nombre exact.

### Activités du créateur (TTL 1 h, à la demande)

| Donnée | Palier A | Palier B | Solscan |
|---|---|---|---|
| Swaps, transferts, retraits de liquidité du wallet créateur | RPC `getSignaturesForAddress` + `getTransaction` brut : possible mais le décodage des swaps est lourd, on ne le fait pas | Helius Enhanced Transactions `GET /v0/addresses/{creator}/transactions` : transactions déjà typées (`SWAP`, `TRANSFER`, `WITHDRAW_LIQUIDITY`…) | `/account/defi/activities` |

### Quota et usage

| Donnée | Source | Coût |
|---|---|---|
| Consommation Solscan | `/monitor/usage`, TTL 10 min, uniquement si la clé est configurée | gratuit selon la doc Solscan, à vérifier |
| Consommation Helius / RPC / DexScreener | compteur local dans `api_usage` | 0 |

---

## 3. Ce que ça change dans l'architecture

- `datasources/registry.ts` ne choisit plus « gratuit puis Solscan » de façon fixe, il **détecte le palier** au démarrage (URL Helius reconnue ? clé Solscan présente ?) et expose `GET /api/system/sources` qui liste, pour chaque type de donnée, la source active et celle qui manque.
- Deux nouvelles sources gratuites entrent dans l'arborescence :
  - `datasources/helius/helius.source.ts` (DAS `getTokenAccounts`, Enhanced Transactions)
  - `datasources/rugcheck/rugcheck.source.ts` (rapport LP lock)
- L'UI affiche « non disponible dans la configuration actuelle » avec le nom de la variable à renseigner, plutôt qu'une case vide.
- Le budget Solscan estimé dans le document 01 devient un **plafond** pour le palier C. En palier B, la consommation Solscan quotidienne récurrente est de **zéro** ; il ne reste que l'appel unique de repli à l'ajout d'un token.

---

## 4. Points d'attention sur les API gratuites

| API | Limite connue | Ce qu'on fait |
|---|---|---|
| RPC public mainnet-beta | ~100 req / 10 s par IP, `getSignaturesForAddress` parfois lent | cache, pas de polling direct depuis le front, plafond de pages |
| Helius gratuit | ~1 M crédits / mois, ~10 req / s | un snapshot par jour et par token, largement dans les clous |
| DexScreener | 300 req / min sur les routes tokens | un appel groupé pour tous les tokens de la watchlist (jusqu'à 30 adresses par requête) toutes les 60 s |
| Jupiter Price v3 (`lite-api.jup.ag`) | limite non documentée précisément, usage raisonnable toléré | un appel groupé par minute |
| RugCheck | non documentée | un appel par token par 24 h |

Les URL et formats de réponse seront vérifiés contre les docs officielles au moment de l'implémentation ; les versions d'API (Jupiter v3, DexScreener `tokens/v1`) bougent souvent et chaque source aura un test de contrat.
