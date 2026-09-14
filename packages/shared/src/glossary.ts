/**
 * Glossaire partagé : une phrase par terme, affichée là où le mot apparaît (composant Terme côté web)
 * et reprise en fin de dossier (docs/05, partie B) pour que l'IA emploie les mêmes définitions.
 */
export const GLOSSARY: Record<string, string> = {
  'autorité de mint': 'Le droit de créer de nouveaux tokens. Tant qu’il existe, l’équipe peut diluer l’offre à volonté.',
  'autorité de freeze': 'Le droit de geler n’importe quel compte détenant le token, donc de bloquer vos ventes.',
  'frais de transfert': 'Prélèvement automatique à chaque transfert, possible avec le programme Token-2022. Vous perdez une part à chaque mouvement.',
  'Token-2022': 'La version récente du programme de tokens Solana, qui autorise des extensions comme les frais de transfert ou le délégué permanent.',
  'liquidité': 'L’argent réellement déposé dans le pool d’échange. C’est ce qui absorbe vos ventes : plus il est faible, plus vendre fait chuter le prix.',
  'pool': 'La réserve où s’échange le token contre SOL ou USDC sur un DEX. Un token peut avoir plusieurs pools.',
  'DEX': 'Plateforme d’échange décentralisée (Raydium, Orca, Meteora…) : les échanges passent par des pools, sans intermédiaire.',
  'CEX': 'Plateforme d’échange centralisée (Kraken, Binance…) : une entreprise tient vos fonds et exécute les ordres.',
  'slippage': 'La différence entre le prix affiché et le prix réellement obtenu quand vous vendez. Il grandit avec la taille de l’ordre et la faiblesse de la liquidité.',
  'capitalisation': 'Prix multiplié par le nombre de tokens émis. Une valeur théorique : personne ne pourrait vendre tout l’argent qu’elle représente.',
  'FDV': 'Valorisation entièrement diluée : prix multiplié par l’offre totale, y compris les tokens pas encore en circulation. Souvent substituée à la capitalisation par les sources.',
  'offre émise': 'Le nombre de tokens existant sur la chaîne, déjà net des burns effectués via le programme SPL.',
  'burn': 'Destruction définitive de tokens, qui réduit l’offre. Se fait par le programme ou par envoi vers une adresse dite incinérateur.',
  'incinérateur': 'Adresse dont personne ne possède la clé : ce qui y est envoyé est perdu pour toujours, donc retiré de l’offre.',
  'détenteur': 'Un portefeuille qui possède au moins un token. Le nombre de détenteurs est un indice de diffusion, pas de qualité.',
  'concentration': 'La part de l’offre détenue par les plus gros portefeuilles, pools et incinérateurs exclus. Plus elle est forte, plus une seule vente peut faire chuter le prix.',
  'créateur': 'Le portefeuille qui a créé le token, lu dans les métadonnées. Ses mouvements sont l’un des signaux les plus parlants.',
  'divergence': 'Deux séries qui devraient aller ensemble et qui se contredisent : par exemple un prix qui monte quand le volume baisse.',
  'dérivée': 'Le sens de la variation d’une variation : le mouvement de prix accélère-t-il ou s’éteint-il ?',
  'produit constant': 'Le mécanisme classique d’un pool (x·y = k) : le prix se déplace selon une formule connue, ce qui permet d’estimer le slippage.',
  'liquidité concentrée': 'Un pool où l’argent n’est déposé que sur une plage de prix. La formule classique ne s’applique pas, seule une simulation de route est fiable.',
  'RPC': 'Le point d’accès qui répond aux questions posées directement à la chaîne Solana. Palier A : public ; palier B : Helius.',
  'palier': 'Le niveau de sources configuré : A (RPC public), B (Helius), C (Solscan). Chaque palier débloque des données de plus.',
  'snapshot': 'Un relevé daté et conservé, pour comparer dans le temps. Marché toutes les 15 minutes, détenteurs une fois par jour.',
  'engagement': 'Une promesse de l’équipe, notée dans son texte original avec sa date, puis vérifiée sur la chaîne ou sur le site quand l’échéance arrive.',
  'volume': 'La valeur totale échangée sur 24 heures. Un volume énorme par rapport à la capitalisation signale souvent des robots ou du lavage.',
  'drapeau': 'Un signal d’attention du scanner, non éliminatoire : il est affiché avec sa valeur et son seuil, à vous d’en juger.',
};

/** Définition d'un terme, ou null s'il n'est pas dans le glossaire. Insensible à la casse. */
export function defineTerm(term: string): string | null {
  const key = Object.keys(GLOSSARY).find((k) => k.toLowerCase() === term.trim().toLowerCase());
  return key ? (GLOSSARY[key] ?? null) : null;
}
