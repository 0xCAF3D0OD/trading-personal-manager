import type { LiquidityBand, SourceName, SummaryAnswer, SummaryState } from '@tpm/shared';
import { SUMMARY_PURPOSE } from '@tpm/shared';

/**
 * Les cinq questions de la lecture simple (docs/05, A.2), à partir de données déjà relevées.
 * Fonction pure : aucun appel réseau, aucun seuil nouveau, des phrases fixes.
 * Pas de score, pas de total : cinq réponses côte à côte.
 */
export interface SummaryInputs {
  health: { mintAuthority: string | null; freezeAuthority: string | null; extensions: string[]; checkedAt: number; ageDays: number | null; young: boolean; lpLocked: boolean | null; lpLockedPct: number | null; lpLockProtocol: string | null } | null;
  liquidity: { ratioPct: number | null; band: LiquidityBand | null; totalUsd: number | null; poolsCount: number; ts: number; source: SourceName } | null;
  slippage: { orderUsd: number; impactPct: number | null; ts: number } | null;
  holders: { top10Pct: number | null; holderCount: number | null; truncated: boolean; ts: number; source: SourceName; fullTierMissing: string | null; ageDays: number | null } | null;
  team: {
    creatorKnown: boolean; walletsCount: number; actionsAvailable: boolean; sells: number; transfersOut: number; lpRemovals: number;
    lastActionTs: number | null; claimsKept: number; claimsContradicted: number; claimsExpired: number; claimsPending: number;
  };
  divergences: { triggered: string[]; evaluated: number; insufficient: number; computedAt: number | null; priceChange24hPct: number | null };
}

/** Mêmes seuils que la coloration de la carte Liquidité : au-delà de 3 % on prévient, au-delà de 10 % c'est un risque. */
const SLIPPAGE_WARN_PCT = 3;
const SLIPPAGE_RISK_PCT = 10;

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
  const base = { id: 'trap' as const, question: 'Peut-on me piéger ?', purpose: SUMMARY_PURPOSE.trap, card: 'health', missing: null, source: 'rpc' as SourceName };
  if (!i.health) return { ...base, state: 'unknown', answer: 'Inconnu : la santé structurelle n’a pas encore été relevée.', short: 'inconnu', fetchedAt: null };
  const powers: string[] = [];
  if (i.health.mintAuthority) powers.push('créer de nouveaux tokens');
  if (i.health.freezeAuthority) powers.push('geler les comptes');
  for (const e of i.health.extensions) if (RISKY_EXT[e]) powers.push(RISKY_EXT[e]!);
  const young = i.health.young && i.health.ageDays !== null ? ` Token créé il y a ${i.health.ageDays} jour${i.health.ageDays > 1 ? 's' : ''} : trop jeune pour avoir un historique, ce qui est un risque en soi.` : '';
  if (!powers.length) {
    return { ...base, state: young ? 'warn' : 'ok', fetchedAt: i.health.checkedAt, short: young ? 'sain mais jeune' : 'sain', answer: `Non : l’équipe ne peut ni créer de tokens, ni geler les comptes, ni prélever de frais.${young}` };
  }
  const list = powers.length === 1 ? powers[0] : `${powers.slice(0, -1).join(', ')} et ${powers[powers.length - 1]}`;
  return { ...base, state: 'risk', fetchedAt: i.health.checkedAt, short: 'piège possible', answer: `Oui : l’équipe peut encore ${list}.${young}` };
}

function exit(i: SummaryInputs, s: SummarySettings): SummaryAnswer {
  const base = { id: 'exit' as const, question: 'Puis-je sortir ?', purpose: SUMMARY_PURPOSE.exit, card: 'liquidity', missing: null };
  const l = i.liquidity;
  if (!l || l.ratioPct === null || !l.band) {
    return { ...base, state: 'unknown', source: l?.source ?? 'unavailable', fetchedAt: l?.ts ?? null, short: 'inconnu', answer: 'Inconnu : aucun relevé de liquidité rapporté à la capitalisation.' };
  }
  const slipPct = i.slippage?.impactPct ?? null;
  const slip = slipPct !== null
    ? ` Vendre ${usd(i.slippage!.orderUsd)} coûterait ${pct(slipPct, 1)}${slipPct >= SLIPPAGE_RISK_PCT ? ' : c’est le coût réel de la sortie, et il contredit le ratio' : ''}.`
    : ` Coût d’une vente de ${usd(s.summarySlippageOrderUsd)} non estimé : cliquez sur Estimer.`;
  const lock = i.health?.lpLocked === true
    ? ` Liquidité verrouillée${i.health.lpLockedPct !== null ? ` à ${pct(i.health.lpLockedPct, 0)}` : ''}${i.health.lpLockProtocol ? ` (${i.health.lpLockProtocol})` : ''}, date de déverrouillage inconnue.`
    : i.health?.lpLocked === false ? ' Liquidité non verrouillée : elle peut être retirée à tout moment.' : '';
  const ratio = `${pct(l.ratioPct, 1)} de la capitalisation (égale à la FDV : rien ne distingue des tokens verrouillés)`;
  // DexScreener plafonne la liste à 30 pools : au-delà, on le dit plutôt que de laisser croire à un compte exact.
  const where = l.poolsCount >= 30 ? ' sur les 30 pools les plus liquides (liste plafonnée par la source, hors plateformes centralisées)' : l.poolsCount > 1 ? ` sur ${l.poolsCount} pools` : ' dans le seul pool connu';
  let state: SummaryState = l.band === 'very_thin' ? 'risk' : l.band === 'thin' ? 'warn' : 'ok';
  let short = l.band === 'very_thin' ? 'très mince' : l.band === 'thin' ? 'mince' : l.band === 'correct' ? 'correcte' : 'confortable';
  // Le coût réel de la sortie prime sur le ratio : un ratio confortable avec 77 % de perte à la vente n'est pas « sans mal ».
  if (slipPct !== null && slipPct >= SLIPPAGE_RISK_PCT) { state = 'risk'; short = `sortie à ${pct(slipPct, 0)}`; }
  else if (slipPct !== null && slipPct >= SLIPPAGE_WARN_PCT && state === 'ok') { state = 'warn'; short = `sortie à ${pct(slipPct, 1)}`; }
  if (i.health?.lpLocked === false && state === 'ok') { state = 'warn'; short = 'non verrouillée'; }
  const head = state === 'risk'
    ? `Difficilement : ${l.band === 'very_thin' ? 'liquidité très mince, ' : ''}${ratio} est disponible pour vendre${where}.`
    : state === 'warn'
      ? `Avec prudence : ${l.band === 'thin' ? 'liquidité mince, ' : ''}${ratio} est disponible pour vendre${where}.`
      : `Oui, sans mal : ${ratio} est disponible pour vendre${where}.`;
  return { ...base, state, source: l.source, fetchedAt: l.ts, short, answer: head + slip + lock };
}

function holders(i: SummaryInputs, s: SummarySettings): SummaryAnswer {
  const base = { id: 'holders' as const, question: 'Qui tient le token ?', purpose: SUMMARY_PURPOSE.holders, card: 'holders' };
  const h = i.holders;
  if (!h || h.top10Pct === null) {
    return { ...base, state: 'unknown', source: h?.source ?? 'unavailable', fetchedAt: h?.ts ?? null, missing: h?.fullTierMissing ?? null, short: 'inconnue', answer: 'Inconnu : aucun relevé des détenteurs pour l’instant. Le premier est pris à l’ajout, puis chaque jour.' };
  }
  const top = pct(h.top10Pct, 1);
  const youngNote = h.ageDays !== null && h.ageDays < 30 && (h.holderCount ?? 0) >= 1000 ? ` Sur un token de ${h.ageDays} jour${h.ageDays > 1 ? 's' : ''}, une répartition aussi régulière peut aussi venir de portefeuilles créés en série : à recouper avec l’activité de l’équipe.` : '';
  const count = h.holderCount !== null ? ` sur ${new Intl.NumberFormat('fr-FR').format(h.holderCount)} détenteurs` : '';
  if (h.truncated) {
    return { ...base, state: 'partial', source: h.source, fetchedAt: h.ts, missing: h.fullTierMissing, short: 'partielle', answer: `Partielle : seuls les vingt premiers portefeuilles sont connus, ils détiennent au moins ${top}. Le palier Helius donne la liste complète.` };
  }
  if (h.top10Pct > s.summaryTop10ConcentratedPct) {
    return { ...base, state: 'risk', source: h.source, fetchedAt: h.ts, missing: null, short: 'concentrée', answer: `Concentrée : les dix premiers portefeuilles détiennent ${top}${count}, une seule vente peut faire chuter le prix.` };
  }
  return { ...base, state: youngNote ? 'warn' : 'ok', source: h.source, fetchedAt: h.ts, missing: null, short: youngNote ? 'répartie, jeune' : 'répartie', answer: `Répartie : les dix premiers portefeuilles détiennent ${top}${count}.${youngNote}` };
}

function team(i: SummaryInputs): SummaryAnswer {
  const base = { id: 'team' as const, question: 'Que fait l’équipe ?', purpose: SUMMARY_PURPOSE.team, card: 'team', missing: null };
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
  const base = { id: 'market' as const, question: 'Le marché confirme-t-il l’histoire ?', purpose: SUMMARY_PURPOSE.market, card: 'divergences', missing: null, source: 'local' as SourceName };
  const d = i.divergences;
  // Le mouvement de prix du jour est un fait que la synthèse ne doit pas cacher derrière « cohérent ».
  const move = d.priceChange24hPct !== null ? ` Sur 24 h, le prix fait ${d.priceChange24hPct >= 0 ? '+' : ''}${pct(d.priceChange24hPct, 1)}.` : '';
  const bigMove = d.priceChange24hPct !== null && Math.abs(d.priceChange24hPct) >= 30;
  const moveShort = bigMove ? `${d.priceChange24hPct! >= 0 ? '+' : ''}${pct(d.priceChange24hPct!, 0)} / 24 h` : '';
  // Une règle vide de sens sur un token neuf (burn annoncé sans engagement) peut être « ok » à elle seule : on exige au moins deux règles réellement évaluées.
  if (d.evaluated === 0 || d.evaluated - d.insufficient <= 1) {
    return { ...base, state: bigMove ? 'warn' : 'unknown', fetchedAt: d.computedAt, short: bigMove ? moveShort : 'trop tôt', answer: `Trop tôt : les divergences demandent plusieurs jours de relevés quotidiens.${move}` };
  }
  if (!d.triggered.length) {
    return { ...base, state: bigMove ? 'warn' : 'ok', fetchedAt: d.computedAt, short: bigMove ? `cohérent, ${moveShort}` : 'cohérent', answer: `Aucune contradiction entre prix, volume, liquidité et détenteurs sur ${d.evaluated - d.insufficient} règle${d.evaluated - d.insufficient > 1 ? 's' : ''} évaluée${d.evaluated - d.insufficient > 1 ? 's' : ''}.${move}` };
  }
  const n = d.triggered.length;
  return { ...base, state: n >= 2 ? 'risk' : 'warn', fetchedAt: d.computedAt, short: `${n} contradiction${n > 1 ? 's' : ''}`, answer: `${n} contradiction${n > 1 ? 's' : ''} : ${d.triggered.map((x) => x.toLowerCase()).join(' ; ')}.${move}` };
}

export function buildSummary(i: SummaryInputs, s: SummarySettings): SummaryAnswer[] {
  return [trap(i), exit(i, s), holders(i, s), team(i), market(i)];
}
