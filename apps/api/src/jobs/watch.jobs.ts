import type { Services } from '../services/index.js';

export async function runWatchPages(s: Services): Promise<string> {
  const r = await s.watchPages.runDue();
  return `${r.checked} source(s) vérifiée(s), ${r.changed} changement(s)`;
}

export async function runWatchNews(s: Services): Promise<string> {
  const r = await s.news.runAll();
  return `${r.tokens} token(s), ${r.inserted} actualité(s) nouvelle(s)`;
}

export async function runWatchOnchain(s: Services): Promise<string> {
  const r = await s.onchain.runAll();
  return `${r.actions} action(s) on-chain, ${r.supplyEvents} variation(s) d’offre${s.onchain.available ? '' : ' (Helius absent : wallets non collectés)'}`;
}

export async function runWatchReview(s: Services): Promise<string> {
  const flagged = await s.watchPages.reviewUnannounced();
  const claims = await s.claims.review();
  return `${flagged} changement(s) sans communication, ${claims.resolved}/${claims.reviewed} engagement(s) résolu(s)`;
}

export async function runWatchMaintenance(s: Services): Promise<string> {
  const r = s.watchPages.maintenance();
  return `${r.rawPurged} corps bruts purgés, ${r.checksPurged} relevés purgés`;
}
