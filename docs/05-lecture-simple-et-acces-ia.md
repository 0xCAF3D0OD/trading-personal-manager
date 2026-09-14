# Lecture simple, synthèse en cinq questions et accès pour l'IA — cadrage

> Document de cadrage. Version 0.2 — 2026-09-14. **Partie A implémentée** (0.4.1) avec les propositions par défaut de la partie D. Ajout demandé en cours de route : la colonne « Où l'acheter » du scanner (A.7). Partie B à venir (0.4.2).
> Ne change aucun calcul ni aucune source : tout ce qui est décrit ici réorganise ce qui existe et ouvre une porte de sortie vers une IA. Les règles du projet restent entières : aucun score, aucune prédiction, aucun bouton d'achat, aucune clé dans le navigateur.

## Journal des décisions

| Date | Point | Verdict | Effet dans ce document |
|---|---|---|---|
| 2026-09-14 | Cacher le technique, le montrer à la demande, harmoniser et ranger | **Demandé** par Kevin | Partie A |
| 2026-09-14 | Rapport par l'IA préférée sans repayer une API | **Question posée** : l'abonnement claude.ai ne couvre pas l'API, mais un connecteur local utilise l'abonnement | Partie B |

---

## Partie A — Deux niveaux de lecture

### A.1 Principe

Deux modes, et un seul jeu de données derrière.

| Mode | Pour qui | Ce qu'il montre |
|---|---|---|
| **Lecture simple** (défaut) | Quelqu'un qui veut savoir si le token est sain | La synthèse en cinq questions, puis une carte par question avec deux à quatre lignes en langage courant |
| **Détail** | Quelqu'un qui veut vérifier ou trader | Tout ce qui existe aujourd'hui, réorganisé sous les mêmes cartes, replié par défaut |

Le mode se choisit d'un bouton en haut de chaque fiche (« Lecture simple / Détail ») et se mémorise dans les réglages, module `ui`. En mode simple, chaque carte garde un lien « Voir le détail » qui déplie uniquement cette carte. On ne perd donc jamais l'accès à un chiffre ; on choisit seulement ce qui est visible d'emblée.

### A.2 La synthèse en cinq questions

Bloc unique en tête de fiche. Cinq lignes, une question, une réponse en mots, la source et son heure, un lien vers la carte qui la justifie. **Pas de couleur globale, pas de total, pas de note** : cinq réponses côte à côte, dont le lecteur fait lui-même la somme.

| # | Question affichée | Réponse construite à partir de | Formulations possibles |
|---|---|---|---|
| 1 | Peut-on me piéger ? | Autorité de mint, autorité de freeze, frais de transfert (carte Santé structurelle) | « Non : l'équipe ne peut ni créer de tokens, ni geler les comptes, ni prélever de frais. » / « Oui : l'équipe peut encore geler les comptes. » / « Inconnu : le RPC n'a pas répondu. » |
| 2 | Puis-je sortir ? | Bande de liquidité et, s'il a été estimé, le slippage à 1 000 $ (carte Liquidité) | « Oui, sans mal : 12 % de la capitalisation est disponible, vendre 1 000 $ coûte 0,4 %. » / « Difficilement : liquidité très mince, vendre 1 000 $ coûterait 18 %. » / « Non estimé : cliquez sur Estimer. » |
| 3 | Qui tient le token ? | Part des dix premiers portefeuilles, pools et burn exclus (carte Concentration) | « Répartie : les dix premiers détiennent 23 %. » / « Concentrée : les dix premiers détiennent 61 %, une seule vente peut faire chuter le prix. » / « Partielle : seuls les vingt premiers sont connus (palier A). » |
| 4 | Que fait l'équipe ? | Actions on-chain des portefeuilles équipe sur 30 jours, engagements échus tenus ou non (Veille) | « Rien de notable sur 30 jours, 2 engagements tenus sur 2. » / « Le créateur a vendu trois fois en 30 jours ; 1 engagement non tenu. » / « Créateur non identifiable, aucun portefeuille déclaré. » |
| 5 | Le marché confirme-t-il l'histoire ? | Divergences déclenchées (panneau Divergences) | « Aucune contradiction entre prix, volume, liquidité et détenteurs. » / « 2 contradictions : le prix monte alors que le volume baisse ; la liquidité se retire. » |

Règles :

- **La finalité est écrite** : au-dessus des cinq questions, une phrase fixe (« Personne ne peut dire si ce token vous rapportera. Ces cinq questions disent ce qui peut vous faire perdre, et chacune est vérifiable. »), et sous chaque question une ligne « à quoi ça sert » rapportée à l'argent du lecteur (`SUMMARY_PURPOSE`, partagée avec les cartes). Demandé par Kevin le 14 septembre 2026 : le visiteur doit savoir à quoi sert chaque information.
- **La question 2 lit tous les pools connus**, pas seulement le principal : un gros token à liquidité répartie paraissait invendable. Le ratio du pool principal reste affiché en détail, car c'est lui que suivent les divergences et l'alerte de retrait.
- Une réponse « Inconnu » ou « Partielle » est toujours accompagnée de la raison et, si une variable manque, de son nom, comme la page Système le fait déjà.
- Les seuils qui séparent « répartie » de « concentrée », « sans mal » de « difficilement », sont ceux déjà en réglages (bandes de liquidité, top 10 des drapeaux du scanner à 40 %). Aucun seuil nouveau.
- Les phrases sont des gabarits fixes en code, pas des textes générés : le même état donne toujours la même phrase.

### A.3 Ce que chaque carte montre en lecture simple

| Carte | Visible en lecture simple | Replié sous « Voir le détail » |
|---|---|---|
| Santé structurelle | Les trois lignes mint / freeze / frais, en mots | Programme, décimales, adresses d'autorité, source |
| Prix | Prix, variation 24 h, une phrase sur la tendance (« le mouvement ralentit depuis 1 h ») | Prix Jupiter et écart, 5 min / 1 h / 6 h, état de dérivée détaillé, capitalisation en trois lectures, composants de l'offre, volume et bandes |
| Liquidité | Bande en mots, pool principal en dollars, bouton Estimer et son résultat à 1 000 $ | Tous les pools, types, tailles 100 $ et 500 $, routes, historique du ratio |
| Suivi de l'offre | Offre nette des burns et sa variation sur 7 j en mots | Composants, adresses de burn, courbe |
| Concentration | Part du top 10 en mots et en chiffre, nombre de détenteurs | Top 5 / 20 / 50 / 100, tranches, liste des portefeuilles, historique |
| Créateur | Une phrase : qui, et ce qu'il a fait sur 30 jours | Liste des transactions |
| Divergences | Seulement les déclenchées, une phrase chacune | Toutes les règles, les deux séries de chaque règle |

Les courbes disparaissent du mode simple, sauf une : le prix sur 30 jours, parce qu'elle est lisible par tout le monde.

### A.4 Le vocabulaire expliqué là où il apparaît

Un composant `Terme` enveloppe chaque mot technique et affiche sa définition au survol ou au toucher, en une phrase. Les définitions vivent dans `packages/shared/src/glossary.ts` pour être réutilisées par le dossier de la partie B.

Termes couverts au minimum : autorité de mint, autorité de freeze, frais de transfert (Token-2022), liquidité, pool, slippage, capitalisation, FDV, offre émise, burn, incinérateur, détenteur, concentration, créateur, divergence, dérivée, produit constant, liquidité concentrée, RPC, palier de source, snapshot, engagement.

### A.5 Harmonisation et rangement

- **Ordre des cartes** identique à l'ordre des cinq questions : Santé, Liquidité, Concentration, Équipe (créateur + veille résumée), Marché (prix, offre, divergences). Aujourd'hui l'ordre suit l'histoire du code, pas la lecture.
- **Une seule grille** : une colonne en lecture simple, deux en détail, aucune carte plus haute que l'écran sans repli.
- **Un seul niveau d'alerte visuel** : le texte est neutre, seuls les états qui demandent attention prennent la couleur d'avertissement. Fini les badges verts partout, qui rassurent sans informer.
- **Doublons supprimés** : la variation 24 h n'apparaît qu'une fois, la source et l'heure d'un relevé sont affichées une fois par carte, en pied.
- **Navigation** inchangée (Surveillance, Scanner, Alertes, Réglages, Système). L'écran Réglages gagne un onglet Affichage.
- **Liste de surveillance** en lecture simple : symbole, prix, variation 24 h, et les cinq réponses sous forme de mots courts (« sain / mince / concentré / calme / 2 contradictions ») pour comparer d'un regard. En détail, les colonnes actuelles.
- **Scanner** en lecture simple : symbole, âge, +24 h, liquidité, nombre de drapeaux, bouton Ajouter. Le reste sous le dépliage de ligne, comme aujourd'hui. La rétrospective ne montre que la médiane à J+7 avec les deux modes ; le détail garde les histogrammes et l'analyse par drapeau.
- **Veille** : inchangée dans sa structure, mais les diffs ligne à ligne passent sous un dépliage, et l'onglet par défaut devient la chronologie.

### A.7 Où s'achète le token (scanner)

Demandé le 14 septembre 2026. Une colonne « Où l'acheter » par ligne du scanner, en lecture simple comme en détail. Ce n'est pas un bouton d'achat : c'est un lien vers un endroit où le token s'échange.

| Plateformes | Source | Fiabilité |
|---|---|---|
| DEX (Raydium, Orca, Meteora, Pump.fun…) | Les pools déjà connus du scanner (GeckoTerminal), par adresse | Certaine : un pool est une adresse, pas un nom |
| Plateformes centralisées (Kraken, Binance…) | Marchés de la fiche CoinGecko du token, identifiée par GeckoTerminal (`coingecko_coin_id`) | Certaine quand la fiche existe ; **jamais** de correspondance par symbole, car dix tokens portent le même |

Quand le token n'a pas de fiche CoinGecko, la colonne le dit : « les plateformes centralisées ne peuvent pas être vérifiées ». Les marchés sont relus toutes les 24 h pour les tokens gardés seulement, hors file GeckoTerminal (autre hôte, autre limite), clé démo CoinGecko utilisée si présente. Table `scan_token_facts` : colonnes `coingecko_id`, `cex_venues`, `cex_checked_at` (migration 0006). Kraken est mis en évidence, puisque c'est la plateforme de Kevin.

### A.6 Réglages du module `ui` (défauts versionnés, `UI_DEFAULTS_VERSION = 1`)

```ts
{
  mode: 'simple',                 // 'simple' | 'detail'
  showPriceChartInSimple: true,
  summaryTop10ConcentratedPct: 40, // réutilise le seuil du drapeau scanner
  summarySlippageOrderUsd: 1000,   // taille lue pour la question 2
  dossierIncludesPlan: false,      // partie B : le plan du journal est personnel
}
```

---

## Partie B — Accès pour l'IA

### B.1 Pourquoi l'abonnement ne suffit pas, et ce qui l'utilise quand même

Un abonnement claude.ai (Pro, Max) donne accès aux applications Claude : le site, l'application de bureau, l'application mobile. Il ne donne pas de clé pour l'API, qui est un service distinct, facturé à l'usage sur console.anthropic.com. Une fenêtre dans la plateforme qui appelle Anthropic directement passerait forcément par l'API, donc par une facture séparée. Il n'existe pas de moyen de faire payer cet appel par l'abonnement.

En revanche, l'application de bureau Claude sait se brancher sur des outils locaux (connecteurs MCP). Si la plateforme expose un connecteur, c'est Claude, sous votre abonnement, qui vient lire le dossier du token et écrit le rapport. Aucune clé, aucun coût en plus, rien ne quitte votre machine sauf ce que vous lui demandez de lire.

| Voie | Coût | Où vit le rapport | Effort | Proposition |
|---|---|---|---|---|
| **B.2 Dossier à copier** | Aucun | Chez l'IA de votre choix, n'importe laquelle | Faible | Dans cette version |
| **B.3 Connecteur MCP pour Claude Desktop** | Aucun (abonnement) | Dans Claude ; collage optionnel dans la plateforme | Moyen | Dans cette version |
| **B.4 Appel API côté serveur** | À l'usage, quelques centimes par rapport | Dans la plateforme, historisé | Moyen | Prévu, activable par variable d'environnement, plus tard |

### B.2 Le dossier

Un texte structuré, en Markdown, produit par le serveur : `GET /api/tokens/:id/dossier` (`?format=md` ou `json`). Bouton « Copier le dossier » sur la fiche.

Ordre du dossier = ordre de lecture :

1. Identité : symbole, nom, adresse, âge, programme, palier de sources actif.
2. Les cinq questions et leurs réponses, avec les chiffres et la source de chacune.
3. Détail par carte, dans l'ordre de A.5, chaque valeur suivie de `(source, heure)`.
4. Veille : changements des 30 derniers jours par sévérité, engagements et leur statut, actualités retenues.
5. Divergences : déclenchées, puis au repos.
6. Journal : plan actuel et ses versions, **seulement si `dossierIncludesPlan` est activé**.
7. Glossaire des termes utilisés, tiré de A.4, pour que l'IA emploie les mêmes définitions.
8. Pied : « Généré le … par trading-personal-manager. Données observées, aucune n'est une recommandation. »

Le dossier ne contient jamais de clé, d'adresse de portefeuille personnel ni de montant engagé si le plan est exclu.

### B.3 Le connecteur MCP local

Nouveau paquet `apps/mcp`, lancé par l'application de bureau Claude (transport stdio), qui interroge l'API locale. Lecture seule, quatre outils :

| Outil | Retourne |
|---|---|
| `list_tokens` | La liste de surveillance avec les cinq réponses courtes |
| `get_dossier(token)` | Le dossier de B.2, par symbole ou adresse |
| `get_alerts(days)` | Les déclenchements récents |
| `get_scanner_results(days)` | Les tokens gardés par le scanner et leurs drapeaux |

Configuration côté Claude Desktop : un bloc dans son fichier de connecteurs, documenté dans le README avec le chemin exact. Aucune variable secrète : le connecteur parle à `http://localhost:3000`.

Optionnel, pour garder une trace : un champ « Coller un rapport » sur la fiche stocke le texte reçu dans `ai_reports` avec la date, le fournisseur saisi à la main et l'empreinte du dossier utilisé. Le rapport est figé comme un plan du journal.

### B.4 L'appel API côté serveur (plus tard)

Variables `AI_PROVIDER` (`anthropic`, `openai`, `ollama`), `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL`. Route `POST /api/tokens/:id/report`. Le serveur envoie le dossier et le prompt de B.5, stocke la réponse dans `ai_reports`. Sans variables, le bouton « Générer un rapport » n'apparaît pas et la page Système l'indique, comme pour Helius.

### B.5 Ce que le rapport a le droit de dire

Le prompt système, versionné dans le code et affiché dans les réglages, impose :

- décrire et hiérarchiser les faits du dossier, en citant la ligne utilisée ;
- signaler les contradictions et les données manquantes ;
- **ne jamais** conseiller d'acheter, de vendre, de conserver, ni donner une note, une probabilité ou une cible de prix ;
- écrire en français courant, définir chaque terme technique à sa première apparition.

Le même texte sert de consigne dans le dossier copié (B.2), en tête, pour que le résultat soit comparable quelle que soit l'IA.

### B.6 Schéma

```sql
CREATE TABLE ai_reports (
  id           INTEGER PRIMARY KEY,
  token_id     INTEGER NOT NULL REFERENCES tokens(id),
  created_at   INTEGER NOT NULL,
  provider     TEXT NOT NULL,        -- 'manuel' | 'anthropic' | 'openai' | 'ollama'
  model        TEXT,
  dossier_hash TEXT NOT NULL,        -- empreinte du dossier utilisé, pour relier rapport et données
  content      TEXT NOT NULL,        -- figé, jamais modifié
  note         TEXT
);
```

Réglages `ui` : voir A.6. Aucune autre table.

---

## Partie C — Tests prévus

- Gabarits des cinq questions : chaque état d'entrée (sain, piège, inconnu, partiel) donne la phrase attendue, jamais une phrase vide.
- Dossier : contient les cinq questions, exclut le plan par défaut, l'inclut si le réglage est activé, ne contient aucune variable d'environnement.
- Connecteur MCP : les quatre outils répondent sur un jeu de données figé ; aucun outil n'écrit.
- Rapports : insertion figée, tentative de modification refusée.
- Glossaire : chaque terme référencé par un composant `Terme` existe dans `glossary.ts`.

---

## Partie D — Points à valider

| # | Point | Proposition par défaut si aucun avis |
|---|---|---|
| 1 | Mode par défaut à l'ouverture | Lecture simple |
| 2 | Formulations des cinq réponses (A.2) | Celles du tableau, ajustables ensuite dans le code sans migration |
| 3 | Seuils « concentré » et « difficile à vendre » | Réutiliser top 10 > 40 % et bande « mince » ; pas de nouveau seuil |
| 4 | Le plan du journal dans le dossier | Exclu par défaut |
| 5 | Voies IA livrées dans cette version | B.2 et B.3 ; B.4 prévu, non livré |
| 6 | Courbe conservée en lecture simple | Le prix sur 30 jours, rien d'autre |
| 7 | Rapport collé à la main historisé (`ai_reports`, fournisseur « manuel ») | Oui |
| 8 | Numéro de version | 0.4.1 pour la partie A, 0.4.2 pour la partie B, Kraken reste 0.5.0 |

Le 14 septembre 2026, Kevin a accepté les huit propositions par défaut et demandé de commencer par la partie A, en y ajoutant A.7.
