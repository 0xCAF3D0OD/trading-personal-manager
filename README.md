# trading-personal-manager

Petite application personnelle pour surveiller quelques tokens Solana sur ce qui se passe **sur la blockchain**, pas seulement sur le prix, et recevoir une alerte quand une règle que vous avez écrite vous-même est franchie.

Elle observe, garde l'historique et prévient. Elle n'achète rien, ne vend rien et ne donne pas de note.

---

## Expliqué simplement

### Le problème que ça résout

Quand on détient un petit token crypto, on regarde surtout son prix. Le prix est pourtant la dernière chose à bouger. Avant qu'il ne baisse, il se passe souvent des choses visibles sur la blockchain elle-même : les gros porteurs qui vendent petit à petit, la liquidité qui s'amenuise, un créateur qui garde le pouvoir de créer de nouveaux tokens, un mécanisme de destruction de tokens qui s'essouffle.

Cette application regarde ces signaux-là, tous les jours, sans que vous ayez à y penser. Elle ne donne pas de conseil, ne note pas le token sur 10 et n'exécute aucune opération. Elle observe, garde l'historique, et vous prévient quand une règle que **vous** avez écrite est franchie.

### Comment ça marche, en trois phrases

1. Un **serveur** tourne en permanence. Toutes les 15 minutes il relève le prix, le volume et la quantité de tokens en circulation. Une fois par jour il relève qui détient le token et dans quelles proportions. Tout est enregistré dans une petite base de données locale.
2. Une **page web** vous montre ces relevés sous forme de tableaux et de courbes. Elle ne parle qu'à votre serveur, jamais directement aux services externes, ce qui protège vos clés d'accès.
3. Chaque minute, le serveur compare les relevés à vos **règles** : seuils de prix, signaux de distribution. Si une règle est franchie, vous recevez une notification sur votre téléphone avec le rappel exact de ce que vous vous étiez fixé.

### Les écrans

| Écran | Ce que vous y faites |
|---|---|
| **Liste** | Vous ajoutez un token en collant son adresse. La page affiche le prix, la capitalisation, le volume et l'âge du token. |
| **Détail d'un token** | Quatre blocs : la santé structurelle (les verrous de sécurité du token), la concentration (qui détient quoi), l'offre (combien de tokens existent et combien sont détruits), le prix et le volume. Puis un panneau de divergences et les mouvements récents du wallet du créateur. |
| **Journal de discipline** | Avant de prendre position, vous écrivez votre prix d'entrée, votre prix de sortie en gain, votre prix de sortie en perte et le montant engagé, et vous cochez que ce montant peut être perdu en totalité. Une fois enregistré, c'est gravé. Si vous changez d'avis, une nouvelle version est créée et l'ancienne reste visible. L'écran compte combien de fois vous avez déplacé vos seuils dans le sens qui vous arrangeait. |
| **Alertes** | La liste de toutes les règles actives, l'historique des déclenchements, un bouton pour tester que les notifications arrivent bien. |
| **Système** | Quelles sources de données sont actives, ce qui manque dans votre configuration pour en débloquer d'autres, combien d'appels ont été faits, et l'état des tâches automatiques. |

### Les mots à connaître

- **Adresse de mint** : l'identifiant unique du token sur Solana, une suite de 32 à 44 caractères. C'est ce que vous collez pour ajouter un token.
- **Autorité de mint** : le droit de créer de nouveaux tokens. Si elle est encore active, quelqu'un peut diluer votre part à tout moment. « Révoquée » est la situation saine.
- **Autorité de freeze** : le droit de geler n'importe quel compte, donc d'empêcher quelqu'un de vendre. « Absente » est la situation saine.
- **Token-2022** : une version plus récente du standard de token, avec des options supplémentaires. Certaines sont anodines, d'autres dangereuses. Un « délégué permanent », par exemple, peut déplacer vos tokens sans votre accord. L'application liste celles qui sont actives.
- **Liquidité verrouillée** : l'argent qui permet d'échanger le token est-il bloqué, ou son créateur peut-il le retirer d'un coup ? L'information vient d'un service tiers et est étiquetée comme telle.
- **Concentration** : quelle part du token est détenue par les 5, 10, 50 ou 100 plus gros wallets. Les pools d'échange et les adresses de destruction sont exclus du calcul pour ne pas fausser le résultat.
- **Offre en circulation** et **burn** : le nombre total de tokens existants, et sa diminution quand des tokens sont détruits. Certains projets détruisent régulièrement des tokens. Si ce rythme ralentit, le mécanisme derrière s'essouffle.
- **Capitalisation** : prix × nombre de tokens. **Volume** : la valeur échangée en 24 heures. Un volume supérieur à la capitalisation signifie que tout le token change de mains plus d'une fois par jour.
- **Divergence** : deux courbes qui devraient aller ensemble et qui se séparent. Par exemple, de plus en plus de détenteurs alors que la capitalisation stagne : cela ressemble à des gros qui distribuent leurs tokens à une foule de petits porteurs. L'application affiche les deux courbes, pas seulement un voyant.

### Ce qui a été construit, concrètement

- **Un serveur** qui va chercher les données auprès de services gratuits : le réseau Solana lui-même, DexScreener, Jupiter, RugCheck, Helius. Le service payant Solscan n'est utilisé qu'en dernier recours, et seulement si vous lui donnez une clé. Le serveur garde les réponses en mémoire pendant une durée adaptée à chaque donnée, pour ne pas solliciter les services inutilement, et il limite le nombre de requêtes que la page web peut lui envoyer.
- **Trois tâches automatiques** : relevé de marché toutes les 15 minutes, relevé des détenteurs chaque matin à 6 h, évaluation des alertes chaque minute. Elles tournent même si vous n'ouvrez pas la page.
- **Une base de données** dans un simple fichier, qui conserve les relevés, les plans, les alertes, les déclenchements et le journal de consommation. Les plans y sont protégés : la base elle-même refuse toute modification ou suppression.
- **Une page web** avec les cinq écrans ci-dessus, des courbes légères, et un bandeau visible dès qu'une source de données ne répond plus, plutôt qu'un écran vide.
- **Des notifications** vers ntfy, Telegram ou Discord. Chaque message rappelle la règle que vous vous étiez fixée et la valeur constatée.
- **Une détection automatique** de ce que votre configuration permet. Avec le seul accès public au réseau Solana, certaines données de détenteurs ne sont pas disponibles. L'application le dit clairement et indique quelle variable renseigner pour les débloquer. Un compte Helius gratuit suffit.
- **Des tests automatisés** sur les points sensibles : l'immuabilité des plans, le calcul des quatre divergences, la validation des adresses.
- **Une configuration Docker** pour tout lancer en une commande.

### Le scanner de nouveaux tokens (livré)

Le module de surveillance suit des tokens que vous avez choisis. Le scanner fait l'inverse : il part des milliers de tokens lancés chaque jour sur Solana et n'en garde qu'une poignée, que vous examinez ensuite à la main dans la vue de surveillance.

- **Ce qu'il cherche** : des tokens lancés depuis 6 heures à 30 jours qui ont fait au moins +100 % sur 24 heures, avec assez de liquidité et de volume pour qu'un marché existe vraiment.
- **Ce qu'il élimine d'office** : autorité de mint encore active, autorité de freeze présente, frais de transfert cachés, volume disproportionné par rapport à la capitalisation, liquidité trop faible pour pouvoir sortir.
- **Ce qu'il signale sans éliminer** : dix wallets qui détiennent plus d'un tiers de l'offre, beaucoup d'acheteurs pour peu de vendeurs avec un prix qui stagne, activité de robots, créateur qui a déjà lancé plusieurs tokens, mouvement qui s'essouffle, absence totale de site ou de réseaux sociaux.
- **Ce qu'il affiche** : pour chaque token, le nombre de filtres passés sur cinq et la liste des drapeaux levés avec la valeur constatée et le seuil. Le tri place le token le plus propre en premier, jamais le plus spectaculaire.
- **Ce qu'il retient** : chaque résultat est conservé, et le prix de chaque token remonté est relevé à J+1, J+7 et J+30. Une vue « rétrospective » répond à la seule question utile : si j'avais suivi mon scanner, où en serais-je ? Elle affiche la médiane, pas seulement la moyenne, parce qu'un seul gros gain masque cinquante pertes.
- **Ce qu'il ne fait pas** : pas de classement par performance, pas de « fort potentiel », pas de flux temps réel, pas de bouton d'achat.

Le scanner a son écran, avec les résultats, les exclus et leur motif, la rétrospective et ses réglages. Un bouton par ligne ajoute le token à la surveillance. Le cadrage complet, avec le schéma de données, les formules de chaque filtre et la justification de chaque seuil, est dans [docs/03-scanner-schema-et-pipeline.md](docs/03-scanner-schema-et-pipeline.md).

### La veille sur les annonces et le panneau de métriques (livrés)

Deux compléments à la vue détaillée d'un token :

- **Le panneau de métriques** affine la vue détaillée : quand deux sources donnent un prix différent, l'écart est affiché et signalé au-delà de 2 % ; la capitalisation est montrée trois fois (celle de la source, celle recalculée depuis la blockchain, la valeur totalement diluée) avec l'écart entre elles ; la liquidité est rapportée à la capitalisation et traduite en slippage concret pour trois tailles d'ordre, autrement dit combien vous perdriez en sortant ; les variations sur 5 minutes, 1 heure, 6 heures et 24 heures sont lues ensemble pour dire si le mouvement s'éteint ou s'accélère. Une alerte prioritaire se déclenche quand la liquidité baisse alors que le prix ne bouge pas : c'est le signal qui précède le plus souvent les chutes brutales.
- **La veille** n'est ni un fil d'actualités ni une mesure de sentiment. C'est un journal horodaté de ce que l'équipe a affirmé, en texte brut jamais reformulé, avec pour chaque affirmation un statut : en attente, tenue, contredite, expirée. Le cœur du module prend une photo du site officiel toutes les 6 heures et compare : si un chiffre de tokenomics change sans qu'aucune annonce ne l'accompagne, vous êtes prévenu. Une frise met face à face ce qui a été dit et ce que les wallets de l'équipe ont réellement fait sur la blockchain. Le contenu promotionnel payé est mis à part et dévalué visuellement.

Les seuils des modules se règlent dans l'écran Réglages, module par module, avec retour aux valeurs par défaut en un clic.

### La lecture simple (livrée)

À l'ouverture, l'application est en **lecture simple** : chaque fiche commence par cinq questions, avec une réponse en une phrase et la source de chaque réponse.

1. Peut-on me piéger ? (autorités de mint et de freeze, frais de transfert)
2. Puis-je sortir ? (liquidité rapportée à la capitalisation, coût estimé d'une vente)
3. Qui tient le token ? (part des dix premiers portefeuilles)
4. Que fait l'équipe ? (mouvements des portefeuilles suivis, engagements tenus ou non)
5. Le marché confirme-t-il l'histoire ? (contradictions entre prix, volume, liquidité et détenteurs)

Il n'y a ni note ni total : les cinq réponses sont côte à côte, et c'est vous qui en faites la somme. Sous la synthèse, chaque carte ne montre que l'essentiel ; « Voir le détail » déplie le reste, et le bouton « Lecture simple ⇄ Détail » en haut de page bascule tout l'écran. Les mots techniques sont soulignés en pointillé : le survol donne leur définition. Le scanner indique où chaque token s'échange : les DEX sont connus par l'adresse du pool ; les plateformes centralisées comme Kraken ne sont affichées que si le token a une fiche CoinGecko, jamais sur la seule foi d'un symbole. La veille est accessible depuis la vue détaillée d'un token, bouton « Veille ». Huit onglets : engagements, changements détectés, dire vs faire, actualités, signaux de promotion, sources, wallets équipe, réglages. Pour une page rendue par JavaScript, l'application propose de surveiller directement l'appel JSON que fait la page, ou un rendu par navigateur dans un conteneur séparé.

Le cadrage complet est dans [docs/04-metriques-marche-et-veille.md](docs/04-metriques-marche-et-veille.md).

### Le portefeuille Kraken (livré)

L'écran Portefeuille montre ce que contient votre compte Kraken, sans jamais pouvoir y toucher. La clé demandée n'a qu'une permission, consulter les soldes, et le code n'appelle qu'un seul endpoint : un test vérifie que cette liste ne grandit pas. Aucune route d'ordre, de retrait ni de conversion n'existe.

- **Deux prix, jamais moyennés** : le prix Kraken, là où l'actif est détenu, donc ce qu'une vente rapporterait ; et pour les tokens surveillés, le prix on-chain, avec l'écart entre les deux.
- **Le lien entre un actif Kraken et un token surveillé se déclare à la main**, dans Réglages, onglet Portefeuille. Kraken ne publie pas les adresses de mint et dix tokens portent le même symbole : une suggestion par symbole est proposée, jamais appliquée seule.
- **Le plan face au compte** : pour un token relié qui a un plan dans le journal, l'écran dit en mots l'écart entre ce que le compte contient et ce que le plan prévoyait, et où se situe le prix Kraken entre la sortie en perte et la sortie en gain.
- **Mode discret** : un bouton masque les montants et ne laisse que les parts, pour consulter l'outil sans afficher ce que vous possédez.
- Un relevé au plus toutes les 15 minutes, un seul conservé par jour à 23:55, courbe de la valeur dans le temps. Les soldes stakés ou en Earn sont comptés mais marqués « non vendable immédiatement ».
- Les montants ne sont jamais inclus dans les dossiers pour l'IA.

Pour l'activer : sur Kraken, créez une clé dédiée (par exemple `tpm-lecture`) avec la seule permission « Query Funds » et une date d'expiration, puis mettez `KRAKEN_API_KEY` et `KRAKEN_API_SECRET` dans le `.env` et relancez. La page Système confirme « Portefeuille Kraken : disponible ».

### L'accès pour l'IA (livré)

Vous pouvez donner à une IA tout ce que la plateforme sait d'un token, sans payer une API en plus et sans qu'aucune clé ne circule.

- **Le dossier.** Sur la fiche d'un token, le bouton « Rapport IA » (aussi en bas de la synthèse en cinq questions) ouvre une page où « Copier le dossier » met dans le presse-papiers un texte complet : identité, les cinq questions et leur finalité, santé, marché, offre, détenteurs, équipe et engagements, veille, divergences, glossaire. Chaque valeur porte sa source et sa date. La consigne de rédaction est en tête : l'IA doit décrire, hiérarchiser, signaler les contradictions et les manques, définir les termes, et n'a pas le droit de conseiller d'acheter ou de vendre, ni de donner une note ou une prévision. Votre plan du journal est exclu par défaut (réglages, Affichage).
- **Le connecteur pour Claude Desktop.** L'application de bureau Claude sait se brancher sur des outils locaux. Le connecteur fourni lui donne quatre outils en lecture seule : la liste de surveillance avec les cinq réponses, le dossier d'un token, les alertes récentes, les résultats du scanner. C'est votre abonnement qui rédige le rapport ; rien ne quitte votre machine sauf ce que vous demandez à Claude de lire.
- **Un rapport peut aussi servir à corriger l'outil.** La première relecture par une IA d'un vrai dossier a révélé deux erreurs de calcul (un slippage lu dans un champ peu fiable, un volume limité au pool principal) et une synthèse plus rassurante que ses données. Les corrections sont dans docs/05, A.2.
- **Les rapports conservés.** Le rapport rendu par l'IA se colle sur la même page. Il est enregistré avec la date, le fournisseur et l'empreinte du dossier utilisé, et ne peut plus être modifié, comme un plan du journal.
- **Le dossier de la liste et celui du scanner.** Au-dessus de la liste de surveillance et des résultats du scanner, « Dossier de la liste » et « Dossier des résultats » assemblent tous les tokens affichés (la sélection filtrée, si un filtre est actif) en un seul texte : vue d'ensemble en tableau, puis une section par token. La consigne en tête interdit à l'IA de classer les tokens du meilleur au pire : elle doit les regrouper par ce qui est vérifié. Copie pour une IA, ou fichier Markdown / HTML.
- **Partager.** Chaque rapport, et le dossier lui-même, se télécharge en fichier : Markdown brut, ou page HTML autonome (aucune ressource extérieure, lisible partout) qui s'imprime en PDF depuis le navigateur. Le pied de page rappelle que rien n'y est une recommandation.

Pour brancher Claude Desktop :

1. Construisez le connecteur une fois : `npm install` puis `npm run build -w apps/mcp`.
2. Ouvrez les réglages de Claude Desktop, section Développeur, « Modifier la configuration », et ajoutez :

```json
{
  "mcpServers": {
    "trading-personal-manager": {
      "command": "node",
      "args": ["/chemin/absolu/vers/trading-personal-manager/apps/mcp/dist/index.js"],
      "env": { "TPM_API_URL": "http://localhost:8080/api" }
    }
  }
}
```

Avec Docker, l'adresse est `http://localhost:8080/api` ; en développement, `http://localhost:3000/api`. Redémarrez Claude Desktop, puis demandez-lui par exemple : « Lis le dossier d'EMBER et fais-moi un rapport ». Le connecteur ne sait qu'écrire du texte à partir de ce qu'il lit : il ne peut rien modifier dans la plateforme.

**Filtrer la liste et le scanner.** Au-dessus de la liste de surveillance et des résultats du scanner, des filtres permettent de ne garder que les tokens récents (moins de 24 h, 7, 30 ou 90 jours) ou à forte évolution (variation sur 24 h au-dessus d'un seuil), et de trier par variation ou par âge. Ce sont des filtres de lecture : ils ne changent rien aux données ni aux alertes.

### Ce qui a été volontairement laissé de côté

- Pas de bouton d'achat ou de vente, pas de connexion à votre plateforme d'échange : l'application observe, elle n'agit pas.
- Pas de note de risque globale : un chiffre unique donnerait une fausse impression de certitude.
- Pas d'indicateurs de trading classiques (RSI, moyennes mobiles) : sur des tokens de quelques jours ou semaines, ils ne veulent rien dire et poussent à réagir au bruit.
- Le suivi de la valeur de votre portefeuille sur votre plateforme d'échange est prévu pour une version ultérieure, en lecture seule. Voir la section Versions.

### Pour démarrer en cinq minutes

1. Créez un compte gratuit chez Helius et copiez l'URL RPC qu'il vous donne.
2. Installez l'application ntfy sur votre téléphone et abonnez-vous à un sujet au nom difficile à deviner, par exemple `solana-veille-8f3k2`.
3. Copiez le fichier `.env.example` en `.env` et renseignez `SOLANA_RPC_URL` et `NTFY_TOPIC`.
4. Lancez `docker compose up -d --build` puis ouvrez `http://localhost:8080`.
5. Ajoutez vos tokens en collant leur adresse de mint, copiée depuis Solscan ou DexScreener.

Les premiers signaux de divergence apparaissent après deux ou trois jours de relevés. C'est normal : sans historique, il n'y a rien à comparer.

---

## Versions

| Version | État | Contenu |
|---|---|---|
| **0.1.0 — Surveillance** | Livrée le 13 septembre 2026 | Liste de surveillance, vue détaillée en quatre blocs, détection de divergences, journal de discipline immuable, alertes ntfy / Telegram / Discord, vue Système, sources gratuites en priorité avec Solscan en repli, Docker. Cadrage : [docs/01](docs/01-architecture-proposee.md), [docs/02](docs/02-matrice-des-sources.md). |
| **0.4.0 — Scanner** | Livrée le 14 septembre 2026, avec les propositions par défaut du cadrage | Découverte des nouveaux pools Solana via GeckoTerminal, pipeline de filtrage en cinq étages, drapeaux explicites, onglet des exclus avec motif, réglages éditables, suivi rétrospectif J+1 / J+7 / J+30 avec médiane, alerte rare « zéro drapeau ». Cadrage : [docs/03](docs/03-scanner-schema-et-pipeline.md). |
| **0.3.0 — Veille sur les annonces** | Livrée le 13 septembre 2026 | Panneau de métriques affiné (écart entre sources, état de dérivée, capitalisation source / recalculée / FDV, ratio liquidité / capitalisation avec slippage estimé, volume par source, trois divergences de plus, alerte retrait de liquidité) et encadré de veille (snapshots du site avec diff automatique, journal d'engagements en texte brut, frise « dire vs faire », actualités tierces séparées et signaux de promotion). Cadrage : [docs/04](docs/04-metriques-marche-et-veille.md). |
| **0.3.1 — Panneau de métriques de marché** | Livrée le 14 septembre 2026 | État de dérivée (extinction / accélération) sur les fenêtres 6 h, 1 h, 5 min ; écart entre sources avec alerte sur trois relevés ; capitalisation en trois lectures (source, recalculée, FDV) avec écart et détection de substitution ; offre émise nette des burns avec composants séparés ; ratio liquidité / capitalisation avec bandes, liste des pools, slippage estimé par cotation Jupiter ; volume avec source et bandes ; courbes groupées par source ; alerte de retrait de liquidité avec exclusion des migrations ; trois divergences de plus ; réglages versionnés. Cadrage : [docs/04](docs/04-metriques-marche-et-veille.md), partie A. |
| **0.4.1 — Lecture simple** | Livrée le 14 septembre 2026, avec les propositions par défaut du cadrage | Deux niveaux de lecture (simple par défaut, détail à la demande, globalement ou carte par carte) ; synthèse en cinq questions en tête de fiche, en phrases fixes, sans note ni total ; vocabulaire expliqué au survol ; cartes rangées dans l'ordre des questions ; liste de surveillance et scanner allégés ; colonne « Où l'acheter » dans le scanner (DEX par pool, plateformes centralisées via la fiche CoinGecko) ; réglages d'affichage versionnés. Cadrage : [docs/05](docs/05-lecture-simple-et-acces-ia.md), partie A. |
| **0.4.2 — Accès pour l'IA** | Livrée le 14 septembre 2026 | Dossier complet d'un token en Markdown, daté et sourcé, avec la consigne de rédaction en tête (à copier dans n'importe quelle IA) ; connecteur MCP local pour l'application de bureau Claude (abonnement, sans clé, quatre outils en lecture seule) ; rapports collés conservés, figés, reliés à l'empreinte du dossier ; filtres « récent » et « forte évolution » sur la liste et le scanner. L'appel API côté serveur reste en option, non livré. Cadrage : [docs/05](docs/05-lecture-simple-et-acces-ia.md), partie B. |
| **0.5.0 — Portefeuille** | Livrée le 14 septembre 2026, avec les propositions par défaut du cadrage | Soldes Kraken en lecture seule (clé « Query Funds » seule, un seul endpoint appelé, liste blanche testée), valorisation avec deux prix jamais moyennés (Kraken et on-chain), euro par défaut, un relevé conservé par jour, correspondances actif ↔ token déclarées à la main, le plan du journal face au compte, mode discret, alerte optionnelle sur la variation journalière, montants exclus des dossiers IA. Cadrage : [docs/06](docs/06-portefeuille-kraken.md). | Valeur du portefeuille Kraken en lecture seule (permission de consultation des soldes uniquement), avec la source de chaque prix. Aucune route d'ordre. |
| Non planifié | — | Web Push (ntfy couvre le besoin), indicateurs techniques (exclus par principe), multi-utilisateurs (hors périmètre). |

### Ce que chaque version a tranché

- **0.1.0** : Fastify plutôt que Hono ; deux tables de snapshots (marché toutes les 15 minutes, détenteurs une fois par jour) plutôt qu'une ; Helius gratuit comme palier recommandé ; ntfy comme premier canal ; npm workspaces et `node:sqlite` pour éviter toute compilation native.
- **0.2.0 → livrée en 0.4.0** avec les propositions par défaut, faute d'avis contraire : GeckoTerminal public en voie principale et clé démo CoinGecko en secours (le plan démo est plafonné à 10 000 appels par mois, insuffisant pour la découverte) ; conservation des exclusions d'étage 2 limitée aux cas proches ; trois drapeaux supplémentaires à coût nul ; alerte zéro drapeau conditionnée à la vérification du créateur ; cadence des paliers de re-vérification ; formule de décélération.
- **0.3.0 et 0.3.1** : tranché le 13 septembre 2026 : slippage réel via Jupiter Quote avec cache 60 s et repli limité aux pools à produit constant ; « offre émise nette des burns » avec composants séparés, jamais « offre en circulation » ; sites rendus côté client couverts dès la v1 par trois modes (HTML, API JSON découverte, rendu sans tête dans un conteneur séparé) ; sévérité d'un changement selon sa nature, « non annoncé » comme drapeau additionnel à 48 h ; réglages communs aux trois modules avec défauts versionnés et remise à zéro par module ; Discord et Telegram reportés en entrée seulement, Telegram reste le canal de notification. Encore ouverts : tolérance de l'état de dérivée, X via oEmbed et saisie manuelle, sources d'actualités, wallets équipe.
- **0.5.0** : Kraken reporté volontairement pour livrer d'abord l'observation on-chain, qui est le cœur de l'outil.

---

## Vue technique

- **Frontend** : Vue 3, `<script setup>`, TypeScript strict, Vite, Pinia, TanStack Query, uPlot
- **Backend** : Fastify (TypeScript), cache mémoire + persistant, rate limit, jobs planifiés
- **Persistance** : SQLite via le module intégré de Node (`node:sqlite`, aucune compilation native)
- **Sources** : RPC Solana (Helius recommandé), DexScreener, Jupiter, RugCheck ; Solscan Pro **optionnel** et en repli uniquement

Documents de cadrage : [docs/01-architecture-proposee.md](docs/01-architecture-proposee.md) et [docs/02-matrice-des-sources.md](docs/02-matrice-des-sources.md).

### Fonctionnalités

| Vue | Contenu |
|---|---|
| Liste | Ajout par adresse de mint (validée localement avant tout appel réseau), prix, capitalisation, volume, âge, réordonnancement, suppression logique |
| Détail | Santé structurelle (mint / freeze / Token-2022 / créateur / LP lock), concentration des détenteurs avec **historique quotidien**, offre et taux de burn 24 h / 7 j / 30 j, prix et volume avec les deux sources affichées côte à côte |
| Divergences | Distribution, taille moyenne de position, concentration en baisse pendant une hausse, burn qui ralentit. Chaque règle avec ses deux séries |
| Journal | Plans immuables et versionnés (entrée, gain, perte, montant, confirmation de perte totale). L'historique montre si vous déplacez vos seuils dans le sens qui vous arrange |
| Alertes | Seuils du journal, alertes de prix libres, divergences, changement d'autorité. Notification ntfy / Telegram / Discord avec la règle que vous vous étiez fixée |
| Système | Palier de configuration détecté, état de chaque source, consommation par fournisseur, jobs |

---

## Installation

### Prérequis

- Node.js ≥ 22.13 (testé avec 26) et npm ≥ 10, **ou** Docker
- Une URL RPC Solana. Le RPC public fonctionne mais bride les appels détenteurs ; le plan gratuit **Helius** est recommandé et débloque le nombre total de détenteurs et le top 100.

### 1. Configuration

```bash
cp .env.example .env
```

Renseignez au minimum `SOLANA_RPC_URL`. Pour recevoir les alertes, renseignez `NTFY_TOPIC`.

### 2a. Lancer en développement

```bash
npm install
```

```bash
npm run build -w packages/shared
```

```bash
npm run dev
```

Backend sur `http://localhost:3000`, frontend sur `http://localhost:5173` (le proxy Vite relaie `/api` vers le backend).

### 2b. Lancer avec Docker

```bash
docker compose up -d --build
```

Interface sur `http://localhost:8080` (modifiable via `WEB_PORT`). La base SQLite est persistée dans `./data`.

### 3. Vérifier

```bash
curl -s localhost:3000/api/system/sources
```

La réponse indique le palier détecté (A, B ou C) et, pour chaque donnée, la source active et la variable manquante le cas échéant.

### Tests

```bash
npm test
```

Cent six tests : source Kraken (signature contre le vecteur public, liste blanche, codes), valorisation du portefeuille et plan face au compte, dossier pour l'IA (consigne en tête, cinq questions et finalités, plan exclu par défaut, aucune clé, sections vides dites telles quelles), synthèse en cinq questions (gabarits, inconnu et partiel, bascules d'état), plateformes d'échange du scanner, base58 et adresse nulle, immuabilité des plans et des engagements, sept règles de divergence, moteur de diff (normalisation, appariement, lignes volatiles, robots.txt, JSON), pipeline de veille complet sur un site local, vérification automatique des engagements, réglages versionnés, métriques de marché (état de dérivée, écart de prix, capitalisation, bandes, slippage, retrait de liquidité et migrations, intégrité des courbes), pipeline du scanner avec jeux de données figés (normalisation, cinq étages, tri, paliers, rétrospective).

---

## Paliers de configuration

| Palier | Condition | Ce qui manque |
|---|---|---|
| **A** | RPC public seul | Nombre total de détenteurs, top 50 / 100, tranches de valeur, activités du créateur. Le RPC public peut aussi refuser `getTokenLargestAccounts` sur les gros tokens (HTTP 429). |
| **B** | `SOLANA_RPC_URL` = URL Helius | Rien d'essentiel. Solscan n'est jamais appelé. |
| **C** | + `SOLSCAN_API_KEY` | Solscan sert de repli (créateur / date de création introuvables on-chain) et de recoupement. Un appel à l'ajout d'un token, puis rien de récurrent si Helius est présent. |

---

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT`, `HOST` | `3000`, `0.0.0.0` | Écoute du backend |
| `DATABASE_PATH` | `./data/app.db` | Fichier SQLite |
| `LOG_LEVEL` | `info` | Niveau de log Pino |
| `CORS_ORIGIN` | vide | Origine autorisée en dev (`http://localhost:5173`). Vide en production derrière nginx. |
| `SOLANA_RPC_URL` | RPC public | URL RPC. Une URL Helius active le palier B. |
| `HELIUS_API_KEY` | vide | Clé pour l'API Enhanced Transactions (activités du créateur). Extraite de l'URL RPC si absente. |
| `HELIUS_MAX_HOLDER_PAGES` | `200` | Plafond de pages (1000 comptes chacune) par snapshot détenteurs |
| `SOLSCAN_API_KEY` | vide | Clé Solscan Pro, envoyée dans le header `token`. Jamais côté navigateur. |
| `SOLSCAN_MONTHLY_CU_BUDGET` | `1000000` | Budget mensuel : au-delà de 80 %, snapshots Solscan un jour sur deux |
| `DEXSCREENER_BASE_URL`, `JUPITER_PRICE_URL`, `JUPITER_QUOTE_URL`, `RUGCHECK_BASE_URL` | URLs publiques | Surcharge pour test uniquement |
| `GECKOTERMINAL_BASE_URL` | API publique | Voie principale du scanner, sans clé |
| `COINGECKO_DEMO_API_KEY` | vide | Optionnel, voie de secours du scanner quand la voie publique est limitée. 10 000 crédits par mois. |
| `KRAKEN_API_KEY`, `KRAKEN_API_SECRET` | vides | Optionnel, module Portefeuille (0.5.0). Clé dédiée avec la permission « Query Funds » **seule** et une date d'expiration. Le code n'appelle que l'endpoint des soldes. |
| `TPM_API_URL` (connecteur MCP seulement) | `http://localhost:3000/api` | Adresse de l'API lue par le connecteur Claude Desktop ; `http://localhost:8080/api` avec Docker |
| `CRON_MARKET_SNAPSHOT` | `*/15 * * * *` | Prix, volume, offre (sources gratuites) |
| `CRON_HOLDER_SNAPSHOT` | `0 6 * * *` | Détenteurs et concentration, une fois par jour |
| `CRON_ALERT_EVAL` | `* * * * *` | Évaluation des alertes |
| `JOBS_ENABLED` | `true` | Désactive tous les jobs si `false` |
| `NTFY_URL`, `NTFY_TOPIC`, `NTFY_TOKEN` | `https://ntfy.sh`, vide, vide | Canal ntfy |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | vide | Canal Telegram |
| `DISCORD_WEBHOOK_URL` | vide | Canal Discord |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW` | `120`, `1 minute` | Limite globale des routes internes |
| `RATE_LIMIT_EXPENSIVE_MAX` | `10` | Limite par minute sur les routes qui peuvent déclencher un appel externe (ajout, rafraîchissements forcés, test de notification) |
| `RENDERER_URL` | vide | URL du service de rendu sans tête (`http://renderer:3100` avec docker-compose). Vide : découverte des API JSON et mode rendu sans tête indisponibles, modes HTML et API JSON conservés. |
| `WATCH_USER_AGENT_CONTACT` | vide | Contact inséré dans le User-Agent des snapshots de sites |
| `CRYPTOPANIC_API_KEY` | vide | Optionnel, agrégateur d'actualités |
| `GITHUB_TOKEN` | vide | Optionnel, quota API GitHub |
| `X_BEARER_TOKEN` | vide | Optionnel, API X v2 payante. Sans elle : import d'un post par oEmbed officiel + saisie assistée |
| `VITE_API_BASE` | `/api` | Seule variable frontend. **Tout `VITE_*` est public** : n'y mettez jamais de secret. Le backend refuse de démarrer si `VITE_SOLSCAN_API_KEY` ou `VITE_HELIUS_API_KEY` est défini. |

---

## Stratégie de cache

| Donnée | TTL | Source |
|---|---|---|
| Métadonnées, autorités, santé | 24 h | RPC |
| Offre | 15 min | RPC |
| Prix, volume | 1 min | DexScreener + Jupiter |
| Détenteurs, concentration | 6 h (snapshot quotidien) | Helius, sinon Solscan, sinon RPC top 20 |
| Activités du créateur | 1 h | Helius Enhanced, sinon Solscan |
| LP lock | 24 h | RugCheck |
| Créateur, date de création | 1 an | RPC (Metaplex), Solscan en repli |
| Snapshots de pages (veille) | 6 h par source, en-têtes conditionnels | Site officiel, HTML / API JSON / rendu sans tête |
| Actualités (veille) | 1 h | RSS Google News, CryptoPanic, flux d'exchanges |
| Actions on-chain équipe (veille) | 15 min | Helius Enhanced Transactions |
| Slippage (cotation Jupiter) | 60 s par couple token / taille, un point par jour en historique | Jupiter Quote, formule x·y = k en repli sur pool à produit constant |
| Scanner : découverte | 5 min | GeckoTerminal nouveaux pools (48 h) + tendances |
| Scanner : re-vérification | 15 min chaud, 2 h tiède, 24 h froid | GeckoTerminal multi-pools, 30 adresses par appel |
| Scanner : enrichissement | RPC 24 h, info token 6 h, créateur 7 j | RPC, GeckoTerminal, Helius DAS |
| Portefeuille Kraken | 15 min en mémoire, un relevé conservé par jour | Kraken Balance (privé, lecture seule) + Ticker (public) |

Le cache est en mémoire et recopié dans la table `cache_entries` : un redémarrage ne rebrûle aucun quota. Le polling frontend (TanStack Query, `staleTime` aligné sur ces TTL) n'interroge que le backend.

---

## Arborescence

```
apps/api          Backend Fastify : config, db (migrations SQL, repositories), cache, datasources, services, jobs, routes
apps/web          Frontend Vue 3 : api, queries, stores, views, components, composables
apps/renderer     Service de rendu sans tête (Playwright, Chromium) pour la veille, conteneur séparé
packages/shared   Schémas Zod, types, règles de divergence, validation d'adresse
docs              Cadrage et matrice des sources
data              Volume SQLite (gitignoré)
```

---

## Limites connues

- La date de création est obtenue en remontant les signatures de la PDA de métadonnées (gratuit). Pour un token très ancien et très actif, elle peut rester inconnue sans Solscan.
- RugCheck est une heuristique tierce pour le verrouillage de liquidité : l'information est étiquetée comme telle.
- Les divergences nécessitent au moins deux snapshots quotidiens espacés de 2 jours : rien n'est calculable le premier jour, et c'est voulu.
- Web Push n'est pas implémenté ; ntfy couvre le besoin sans service worker ni clés VAPID.
- Le suivi du portefeuille Kraken (lecture seule) est prévu en v2.
