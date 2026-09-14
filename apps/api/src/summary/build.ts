import type { LiquidityBand, SourceName, SummaryAnswer, SummaryState } from '@tpm/shared';

/**
 * Les cinq questions de la lecture simple (docs/05, A.2), à partir de données déjà relevées.
 * Fonction pure : aucun appel réseau, aucun seuil nouveau, des phrases fixes.
 * Pas de score, pas de total : cinq réponses côte à côte.
 */
export interface SummaryInputs {
  health: { mintAuthority: string | null; freezeAuthority: string | null; extensions: string[]; checkedAt: number } | null;
  liquidity: { ratioPct: number | null; band: LiquidityBand | null; mainPoolUsd: number | null; ts: number; source: SourceName } | null;
  slippage: { orderUsd: number; impactPct: number | null; ts: number } | null;
  holders: { top10Pct: number | null; holderCount: number | null; truncated: boolean; ts: number; source: SourceName; fullTierMissing: string | null } | null;
  team: {
    creatorKnown: boolean; walletsCount: number; actionsAvailable: boolean; sells: number; transfersOut: number; lpRemovals: number;
    lastActionTs: number | null; claimsKept: number; claimsContradicted: number; claimsExpired: number; claimsPending: number;
  };
  divergences: { triggered: string[]; evaluated: number; insufficient: number; computedAt: number | null };
}

export interface SummarySettings { summaryTop10ConcentratedPct: number; summarySlippageOrderUsd: number }

const RISKY_EXT: Record<string, string> = {
  transferFeeConfig: 'prélever des frais à chaque transfert',
  permanentDelegate: 'déplacer ou brûler vos tokens sans votre signature',
  transferHook: 'bloquer ou taxer chaque transfert via un programme externe',
  defaultAccountState: 'geler les nouveaux comptes par défaut',
  nonTransferable: 'interdire tout transfert',
};

const pct = (v: number, d = 0) => `${v.toFixed(d).replace('.', ',')} %`;
const usd = (v: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)} $`;

function trap(i: SummaryInputs): SummaryAnswer {
  const base = { id: 'trap' as const, question: 'Peut-on me piéger ?', card: 'health', missing: null, source: 'rpc' as SourceName };
  if (!i.health) return { ...base, state: 'unknown', answer: 'Inconnu : la santé structurelle n’a pas encore été relevée.', short: 'inconnu', fetchedAt: null };
  const powers: string[] = [];
  if (i.health.mintAuthority) powers.push('créer de nouveaux tokens');
  if (i.health.freezeAuthority) powers.push('geler les comptes');
  for (const e of i.health.extensions) if (RISKY_EXT[e]) powers.push(RISKY_EXT[e]!);
  if (!powers.length) {
    return { ...base, state: 'ok', fetchedAt: i.health.checkedAt, short: 'sain', answer: 'Non : l’équipe ne peut ni créer de tokens, ni geler les comptes, ni prélever de frais.' };
  }
  const list = powers.length === 1 ? powers[0] : `${powers.slice(0, -1).join(', ')} et ${powers[powers.length - 1]}`;
  return { ...base, state: 'risk', fetchedAt: i.health.checkedAt, short: 'piège possible', answer: `Oui : l’équipe peut encore ${list}.` };
}

function exit(i: SummaryInputs, s: SummarySettings): SummaryAnswer {
  const base = { id: 'exit' as const, question: 'Puis-je sortir ?', card: 'liquidity', missing: null };
  const l = i.liquidity;
  if (!l || l.ratioPct === null || !l.band) {
    return { ...base, state: 'unknown', source: l?.source ?? 'unavailable', fetchedAt: l?.ts ?? null, short: 'inconnu', answer: 'Inconnu : aucun relevé de liquidité rapporté à la capitalisation.' };
  }
  const slip = i.slippage && i.slippage.impactPct !== null
    ? ` Vendre ${usd(i.slippage.orderUsd)} coûterait ${pct(i.slippage.impactPct, 1)}.`
    : ` Coût d’une vente de ${usd(s.summarySlippageOrderUsd)} non estimé : cliquez sur Estimer.`;
  const ratio = pct(l.ratioPct, 1);
  const state: SummaryState = l.band === 'very_thin' ? 'risk' : l.band === 'thin' ? 'warn' : 'ok';
  const short = l.band === 'very_thin' ? 'très mince' : l.band === 'thin' ? 'mince' : l.band === 'correct' ? 'correcte' : 'confortable';
  const head = l.band === 'very_thin'
    ? `Difficilement : liquidité très mince, ${ratio} de la capitalisation est disponible.`
    : l.band === 'thin'
      ? `Avec prudence : liquidité mince, ${ratio} de la capitalisation est disponible.`
      : `Oui, sans mal : ${ratio} de la capitalisation est disponible dans le pool principal.`;
  return { ...base, state, source: l.source, fetchedAt: l.ts, short, answer: head + slip };
}

function holders(i: SummaryInputs, s: SummarySettings): SummaryAnswer {
  const base = { id: 'holders' as const, question: 'Qui tient le token ?', card: 'holders' };
  const h = i.holders;
  if (!h || h.top10Pct === null) {
    return { ...base, state: 'unknown', source: h?.source ?? 'unavailable', fetchedAt: h?.ts ?? null, missing: h?.fullTierMissing ?? null, short: 'inconnue', answer: 'Inconnu : aucun relevé des détenteurs pour l’instant. Le premier est pris à l’ajout, puis chaque jour.' };
  }
  const top = pct(h.top10Pct, 0);
  const count = h.holderCount !== null ? ` sur ${new Intl.NumberFormat('fr-FR').format(h.holderCount)} détenteurs` : '';
  if (h.truncated) {
    return { ...base, state: 'partial', source: h.source, fetchedAt: h.ts, missing: h.fullTierMissing, short: 'partielle', answer: `Partielle : seuls les vingt premiers portefeuilles sont connus, ils détiennent au moins ${top}. Le palier Helius donne la liste complète.` };
  }
  if (h.top10Pct > s.summaryTop10ConcentratedPct) {
    return { ...base, state: 'risk', source: h.source, fetchedAt: h.ts, missing: null, short: 'concentrée', answer: `Concentrée : les dix premiers portefeuilles détiennent ${top}${count}, une seule vente peut faire chuter le prix.` };
  }
  return { ...base, state: 'ok', source: h.source, fetchedAt: h.ts, missing: null, short: 'répartie', answer: `Répartie : les dix premiers portefeuilles détiennent ${top}${count}.` };
}

function team(i: SummaryInputs): SummaryAnswer {
  const base = { id: 'team' as const, question: 'Que fait l’équipe ?', card: 'team', missing: null };
  const t = i.team;
  const resolved = t.claimsKept + t.claimsContradicted + t.claimsExpired;
  const claims = resolved > 0
    ? ` ${t.claimsKept} engagement${t.claimsKept > 1 ? 's' : ''} tenu${t.claimsKept > 1 ? 's' : ''} sur ${resolved}${t.claimsContradicted ? `, ${t.claimsContradicted} contredit${t.claimsContradicted > 1 ? 's' : ''}` : ''}${t.claimsExpired ? `, ${t.claimsExpired} expiré${t.claimsExpired > 1 ? 's' : ''} sans preuve` : ''}.`
    : t.claimsPending > 0 ? ` ${t.claimsPending} engagement${t.claimsPending > 1 ? 's' : ''} en attente d’échéance.` : '';
  if (!t.creatorKnown && t.walletsCount === 0) {
    return { ...base, state: resolved && t.claimsContradicted ? 'warn' : 'unknown', source: 'local', fetchedAt: null, short: t.claimsContradicted ? 'promesse non tenue' : 'inconnu', answer: `Créateur non identifiable et aucun portefeuille d’équipe déclaré : rien à observer sur la chaîne.${claims}` };
  }
  if (!t.actionsAvailable) {
    return { ...base, state: 'unknown', source: 'unavailable', fetchedAt: null, missing: 'HELIUS_API_KEY', short: 'non observée', answer: `Les mouvements des portefeuilles ne sont pas lus dans la configuration actuelle (clé Helius absente).${claims}` };
  }
  const moves: string[] = [];
  if (t.sells) moves.push(`${t.sells} vente${t.sells > 1 ? 's' : ''}`);
  if (t.transfersOut) moves.push(`${t.transfersOut} transfert${t.transfersOut > 1 ? 's' : ''} sortant${t.transfersOut > 1 ? 's' : ''}`);
  if (t.lpRemovals) moves.push(`${t.lpRemovals} retrait${t.lpRemovals > 1 ? 's' : ''} de liquidité`);
  if (!moves.length) {
    return { ...base, state: t.claimsContradicted ? 'warn' : 'ok', source: 'helius', fetchedAt: t.lastActionTs, short: t.claimsContradicted ? 'promesse non tenue' : 'calme', answer: `Rien de notable sur 30 jours : aucune vente ni retrait des ${t.walletsCount} portefeuille${t.walletsCount > 1 ? 's' : ''} suivi${t.walletsCount > 1 ? 's' : ''}.${claims}` };
  }
  return { ...base, state: 'warn', source: 'helius', fetchedAt: t.lastActionTs, short: 'active', answer: `À surveiller : ${moves.join(', ')} depuis les portefeuilles d’équipe en 30 jours.${claims}` };
}

function market(i: SummaryInputs): SummaryAnswer {
  const base = { id: 'market' as const, question: 'Le marché confirme-t-il l’histoire ?', card: 'divergences', missing: null, source: 'local' as SourceName };
  const d = i.divergences;
  if (d.evaluated === 0 || d.insufficient === d.evaluated) {
    return { ...base, state: 'unknown', fetchedAt: d.computedAt, short: 'trop tôt', answer: 'Trop tôt : les divergences demandent plusieurs jours de relevés quotidiens.' };
  }
  if (!d.triggered.length) {
    return { ...base, state: 'ok', fetchedAt: d.computedAt, short: 'cohérent', answer: `Aucune contradiction entre prix, volume, liquidité et détenteurs sur ${d.evaluated - d.insufficient} règle${d.evaluated - d.insufficient > 1 ? 's' : ''} évaluée${d.evaluated - d.insufficient > 1 ? 's' : ''}.` };
  }
  const n = d.triggered.length;
  return { ...base, state: n >= 2 ? 'risk' : 'warn', fetchedAt: d.computedAt, short: `${n} contradiction${n > 1 ? 's' : ''}`, answer: `${n} contradiction${n > 1 ? 's' : ''} : ${d.triggered.map((x) => x.toLowerCase()).join(' ; ')}.` };
}

export function buildSummary(i: SummaryInputs, s: SummarySettings): SummaryAnswer[] {
  return [trap(i), exit(i, s), holders(i, s), team(i), market(i)];
}
