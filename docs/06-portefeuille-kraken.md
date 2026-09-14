# Portefeuille Kraken en lecture seule — cadrage

> Document de cadrage à valider **avant** le code. Version 0.1 — 2026-09-14. Version cible : 0.5.0.
> Reprend l'esquisse « extension optionnelle » de docs/01 (§ 1, table `portfolio_snapshots`, route `/portfolio`), reportée en 0.5.0 par décision du 13 septembre 2026. Les règles du projet restent entières : lecture seule par construction, clés côté serveur, aucune route d'ordre, pas de score ni de prévision.

## Journal des décisions

| Date | Point | Verdict | Effet |
|---|---|---|---|
| 2026-09-13 | Module Kraken reporté après l'observation on-chain | **Validé** | Version 0.5.0 |
| 2026-09-14 | Cadrage ci-dessous | **Validé avec les propositions par défaut** (partie H) | Tout le document |
| 2026-09-14 | Source Kraken | **Livrée** : signature vérifiée contre l'exemple de la documentation, liste blanche `Balance` seule testée, normalisation des codes et des états, paires et prix publics | B, C.1, C.2 |

---

## A. Ce que le module fait, et ce qu'il ne fera jamais

**Il fait** : lire les soldes du compte Kraken, les valoriser avec un prix dont la source est affichée, conserver un relevé quotidien, relier chaque solde au token surveillé quand c'en est un, et montrer l'écart entre ce que dit le plan du journal et ce que le compte contient.

**Il ne fera jamais** : passer un ordre, retirer, déposer, convertir, ni même lire l'historique des ordres. La clé demandée n'en a pas le droit, et le code n'a pas de route pour cela. C'est une fenêtre sur le compte, pas une télécommande.

## B. La clé Kraken : une seule permission

Kraken permet de créer une clé API avec des permissions choisies une à une. Le module exige une clé avec **« Query Funds » seulement** (consulter les soldes). Rien d'autre : ni « Query Open Orders », ni « Query Ledger Entries », ni aucun droit de trading ou de retrait.

Recommandations écrites dans le README, à l'attention de Kevin :

- Créer une clé dédiée à cet outil, nommée par exemple `tpm-lecture`.
- Cocher uniquement « Query Funds ».
- Renseigner une date d'expiration (Kraken le propose) et la renouveler tous les trois mois.
- Si Kraken propose la restriction par adresse IP, l'activer sur l'IP de la machine qui fait tourner Docker.
- Ne jamais coller la clé ni le secret dans une conversation, un ticket ou un fichier suivi par git.

Côté code : `KRAKEN_API_KEY` et `KRAKEN_API_SECRET` lus depuis `.env`, ajoutés à la liste des secrets dont la présence en `VITE_*` fait refuser le démarrage. Il n'existe pas d'appel Kraken qui liste les permissions d'une clé : le module appelle donc **uniquement** `Balance`, et refuse par construction tout autre endpoint privé (une liste blanche dans la source, avec un test qui échoue si elle grandit).

Signature : Kraken authentifie chaque appel privé par un HMAC-SHA512 du chemin et d'un nonce, avec le secret décodé en base64. Implémenté avec `node:crypto`, sans dépendance.

Limite d'appels : Kraken compte les appels privés avec un compteur qui se vide lentement (environ un point toutes les deux ou trois secondes selon le niveau du compte). Un appel `Balance` toutes les 15 minutes, plus le bouton « Rafraîchir » limité à une fois par minute, reste très loin de la limite.

## C. Les données

### C.1 Soldes

`Balance` renvoie tous les actifs du compte avec leur quantité, sous des codes Kraken : `XXBT` pour le bitcoin, `ZEUR` pour l'euro, `SOL`, et des suffixes pour les états particuliers (`SOL.S` staké, `.F` en Earn flexible, `.B`/`.M` selon les produits). Le module :

- normalise le code (`XXBT` → `BTC`, `ZEUR` → `EUR`, suffixe retiré) ;
- garde le suffixe comme **état** (« en staking », « en Earn flexible ») et l'affiche, parce qu'un solde staké ne se vend pas immédiatement ;
- ignore les soldes nuls.

Le module ne connaît pas le nombre de Kraken sur les adresses de mint Solana : Kraken ne publie pas cette correspondance. Le lien entre un actif Kraken et un token surveillé est donc **déclaré à la main**, une fois, dans les réglages (par exemple `EMBER` → le token EMBER de la liste). Le module propose la correspondance quand le symbole Kraken et le symbole du token coïncident, mais ne l'applique jamais seul : dix tokens portent le même symbole.

### C.2 Prix, avec leur source

Deux prix, jamais moyennés, comme partout dans l'outil :

| Prix | Source | Pour quoi |
|---|---|---|
| Prix Kraken | `Ticker` public, paire `ACTIF/EUR` (ou `/USD` puis conversion `EUR/USD` Kraken) | Ce que vaut l'actif **là où il est détenu**, donc ce que rapporterait une vente sur Kraken |
| Prix on-chain | DexScreener, déjà relevé pour les tokens surveillés | Ce que vaut le token sur les DEX ; l'écart avec Kraken est un signal en soi (arbitrage qui ne se fait pas, liquidité fragmentée) |

Pour les actifs non surveillés (BTC, ETH, EUR…), seul le prix Kraken est utilisé. Pour l'euro, la valeur est la quantité.

Monnaie d'affichage : euro par défaut (Kevin est en France), dollar en option. Les deux totaux sont calculés, l'un est mis en avant.

### C.3 Relevés

Table `portfolio_snapshots` (docs/01, complétée) :

```sql
CREATE TABLE portfolio_snapshots (
  id            INTEGER PRIMARY KEY,
  ts            INTEGER NOT NULL,
  day           TEXT NOT NULL,          -- AAAA-MM-JJ, un relevé conservé par jour, le dernier de la journée
  asset         TEXT NOT NULL,          -- code normalisé (BTC, SOL, EMBER…)
  kraken_code   TEXT NOT NULL,          -- code brut (XXBT, SOL.S…)
  state         TEXT,                   -- NULL | 'staking' | 'earn_flex' | 'earn_locked'
  balance       REAL NOT NULL,
  price_eur     REAL,  price_usd REAL,
  price_source  TEXT NOT NULL,          -- 'kraken' | 'dexscreener' | 'fiat'
  onchain_price_usd REAL,               -- prix DexScreener quand l'actif est un token surveillé
  value_eur     REAL,  value_usd REAL,
  token_id      INTEGER REFERENCES tokens(id)   -- lien déclaré, sinon NULL
);
CREATE INDEX idx_portfolio_day ON portfolio_snapshots(day, asset);
```

Un relevé toutes les 15 minutes en mémoire (cache) ; **un seul conservé par jour** en base, le dernier, pour tracer la valeur dans le temps sans gonfler la base. Rétention : illimitée (quelques dizaines de lignes par jour au plus).

### C.4 Le plan face au compte

Pour chaque actif relié à un token surveillé qui a un plan dans le journal : quantité détenue × prix Kraken = valeur ; comparée au montant engagé du plan, au prix d'entrée, aux seuils de sortie. Le module affiche l'écart en mots : « le compte détient pour 312 € d'EMBER, le plan en prévoyait 250 € », « le prix Kraken est à 8 % du seuil de sortie en perte ». Aucune action, aucune alerte automatique nouvelle : les alertes de prix existantes suffisent, et elles portent déjà sur le plan.

## D. L'écran « Portefeuille »

Navigation : entrée « Portefeuille » entre « Liste » et « Scanner ». Page absente de la navigation tant que la clé n'est pas configurée ; à la place, la page Système indique « Portefeuille Kraken : non configuré, variable `KRAKEN_API_KEY` » comme pour Helius.

En **lecture simple** :

- Valeur totale en euros, variation depuis le relevé de la veille, heure du dernier relevé Kraken.
- Un tableau : actif, quantité (avec « en staking » s'il y a lieu), valeur, part du total, et pour les tokens surveillés un lien vers la fiche et les cinq réponses courtes.
- Un **mode discret** (bouton en haut de l'écran, mémorisé) qui masque les montants et ne laisse que les parts en pourcentage : pour consulter l'outil sans afficher ce que l'on possède.

En **détail** :

- Prix Kraken et prix on-chain côte à côte avec leur écart, pour les tokens surveillés.
- Le plan face au compte (C.4).
- Courbe de la valeur totale sur 30 / 90 jours, une courbe par actif au survol, sources indiquées.
- Correspondances actif ↔ token, éditables.

## E. Ce qui reste hors du dossier IA

Les montants du portefeuille sont personnels. Ils sont **exclus des dossiers** (token, liste, scanner) par défaut, comme le plan du journal ; un réglage `dossierIncludesPortfolio` permet de les inclure, désactivé par défaut. Le connecteur MCP n'expose pas d'outil portefeuille dans cette version.

## F. Réglages (module `portfolio`, défauts versionnés)

```ts
{
  enabled: true,                 // le module se coupe sans retirer la clé
  baseCurrency: 'EUR',           // 'EUR' | 'USD'
  refreshIntervalS: 900,         // 15 min
  discreetByDefault: false,      // mode discret à l'ouverture
  mappings: [],                  // [{ asset: 'EMBER', tokenId: 3 }] déclarés à la main
  dailyChangeAlertPct: 0,        // 0 = pas d'alerte ; sinon alerte ntfy si |variation jour| ≥ X %
}
```

Jobs : `portfolio-refresh` toutes les 15 min (Balance + Ticker), `portfolio-daily` à 23:55 (conserve le relevé du jour).

## G. Tests prévus

- Signature HMAC vérifiée contre un vecteur connu (chemin, nonce, secret de test).
- Liste blanche des endpoints : tout appel privé autre que `Balance` est refusé, test qui échoue si la liste grandit.
- Normalisation des codes Kraken (`XXBT`, `ZEUR`, `SOL.S`, `ETH.F`) et des états.
- Valorisation : EUR direct, USD converti, token surveillé avec les deux prix, actif sans paire (valeur inconnue, dite telle quelle).
- Un seul relevé conservé par jour.
- Le plan face au compte : écarts en mots à partir d'un jeu figé.
- Les dossiers n'incluent pas le portefeuille par défaut.

## H. Points à valider

| # | Point | Proposition par défaut si aucun avis |
|---|---|---|
| 1 | Permission de la clé | « Query Funds » seule. **Pas** de « Query Ledger Entries » : le prix d'entrée réel resterait inconnu, mais celui du plan du journal suffit à l'outil |
| 2 | Monnaie d'affichage | Euro, dollar en option |
| 3 | Correspondance actif Kraken ↔ token surveillé | Déclarée à la main dans les réglages, suggestion par symbole jamais appliquée seule |
| 4 | Montants dans les dossiers IA | Exclus par défaut, réglage pour les inclure |
| 5 | Mode discret | Présent, désactivé par défaut |
| 6 | Alerte sur la variation journalière | Disponible, désactivée par défaut (seuil 0) |
| 7 | Fréquence | Relevé toutes les 15 min, un conservé par jour |
| 8 | Soldes stakés / Earn | Comptés dans la valeur, marqués « non vendable immédiatement » |

Si vous validez avec les défauts, je commence par la source Kraken (signature, liste blanche, normalisation) et ses tests, puis la valorisation et l'écran.
