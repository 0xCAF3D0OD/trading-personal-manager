/**
 * Règles de divergence : une seule source de vérité, partagée entre le backend
 * (calcul) et le frontend (affichage de la règle telle qu'elle est appliquée).
 * Pas de score agrégé : chaque règle est indépendante et affichée avec ses séries.
 */
export type DivergenceId =
  | 'distribution'
  | 'avg_position'
  | 'concentration_down_price_up'
  | 'burn_slowdown'
  | 'liquidity_withdrawal'
  | 'unconfirmed_rise'
  | 'announced_burn_no_supply_change';

export interface DivergenceRule {
  id: DivergenceId;
  label: string;
  /** Fenêtre d'observation en jours */
  windowDays: number;
  /** Phrase lisible de la règle, affichée telle quelle dans l'UI et dans les alertes */
  ruleText: string;
  params: Record<string, number>;
}

export const DIVERGENCE_RULES: readonly DivergenceRule[] = [
  {
    id: 'distribution',
    label: 'Distribution',
    windowDays: 7,
    ruleText:
      'Nombre de détenteurs en hausse d’au moins 5 % sur 7 jours ET capitalisation stable ou en baisse sur la même période.',
    params: { minHolderGrowthPct: 5, maxMcapChangePct: 0 },
  },
  {
    id: 'avg_position',
    label: 'Taille moyenne de position',
    windowDays: 7,
    ruleText:
      'Capitalisation divisée par nombre de détenteurs en baisse d’au moins 20 % sur 7 jours : les grosses lignes se fragmentent.',
    params: { maxAvgPositionChangePct: -20 },
  },
  {
    id: 'concentration_down_price_up',
    label: 'Concentration en baisse pendant une hausse',
    windowDays: 7,
    ruleText:
      'Part du top 10 en baisse d’au moins 3 points sur 7 jours ET prix en hausse d’au moins 10 % : les gros vendent possiblement à la foule.',
    params: { maxTop10DeltaPts: -3, minPriceChangePct: 10 },
  },
  {
    id: 'burn_slowdown',
    label: 'Burn qui ralentit',
    windowDays: 7,
    ruleText:
      'Quantité brûlée sur les 7 derniers jours inférieure à 50 % de celle des 7 jours précédents.',
    params: { maxRatioPct: 50 },
  },
  {
    id: 'liquidity_withdrawal',
    label: 'Retrait de liquidité',
    windowDays: 7,
    ruleText:
      'Ratio liquidité / capitalisation en baisse d’au moins 20 % sur 7 jours ET prix stable ou en hausse (au-dessus de −5 %) : des fournisseurs de liquidité retirent leurs fonds sans que le marché ne réagisse.',
    params: { ratioDropPct: 20, priceFloorPct: -5 },
  },
  {
    id: 'unconfirmed_rise',
    label: 'Hausse non confirmée par les flux',
    windowDays: 7,
    ruleText:
      'Volume 24 h (même source) en baisse d’au moins 30 % sur 7 jours ET prix en hausse d’au moins 15 % : la hausse ne s’appuie pas sur des échanges.',
    params: { volumeDropPct: 30, priceRisePct: 15 },
  },
  {
    id: 'announced_burn_no_supply_change',
    label: 'Burn annoncé sans baisse d’offre',
    windowDays: 7,
    ruleText:
      'Un engagement de burn est enregistré (en attente ou tenu) ET l’offre nette a baissé de moins de 0,1 % sur sa fenêtre : revenus taris, ou promesse non tenue.',
    params: { maxSupplyDropPct: 0.1 },
  },
] as const;

export function getDivergenceRule(id: DivergenceId): DivergenceRule {
  const rule = DIVERGENCE_RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`Règle de divergence inconnue : ${id}`);
  return rule;
}
