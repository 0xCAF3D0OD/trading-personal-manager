import type { TimelineItem } from '@tpm/shared';
import { nowS } from '../../db/client.js';
import { AppContext } from '../context.js';
import type { TokenService } from '../token.service.js';

/** Frise « dire vs faire » : annonces en haut, actions on-chain et changements de site en bas, même axe de temps. */
export class TimelineService {
  constructor(private readonly ctx: AppContext, private readonly tokens: TokenService) {}

  build(tokenId: number, days = 60): TimelineItem[] {
    this.tokens.require(tokenId);
    const since = nowS() - days * 86400;
    const items: TimelineItem[] = [];
    for (const c of this.ctx.claims.list(tokenId)) {
      if (c.publishedAt < since || c.origin === 'website') continue;
      items.push({ lane: 'said', kind: `claim:${c.type}`, ts: c.publishedAt, title: c.text.length > 140 ? `${c.text.slice(0, 140)}…` : c.text, detail: c.author, refType: 'claim', refId: c.id, url: c.url, status: c.status });
    }
    for (const n of this.ctx.news.list(tokenId, ['listing'])) {
      if (n.publishedAt < since) continue;
      items.push({ lane: 'said', kind: 'listing', ts: n.publishedAt, title: n.title, detail: n.domain, refType: 'news', refId: n.id, url: n.url, status: null });
    }
    for (const a of this.ctx.team.actions(tokenId, since, 500)) {
      items.push({
        lane: 'done', kind: `onchain:${a.kind}`, ts: a.ts,
        title: describeAction(a.kind, a.amount, a.counterpartyLabel, a.walletLabel),
        detail: `${a.walletAddress.slice(0, 4)}…${a.walletAddress.slice(-4)}`, refType: 'onchain', refId: a.id, url: `https://solscan.io/tx/${a.txSignature}`, status: null,
      });
    }
    for (const e of this.ctx.team.supplyEvents(tokenId, since)) {
      items.push({
        lane: 'done', kind: `supply:${e.kind}`, ts: e.tsTo,
        title: `${e.kind === 'burn' ? 'Offre en baisse' : 'Offre en hausse'} de ${Math.abs(e.deltaPct).toFixed(3)} % (${fmt(Math.abs(e.delta))} tokens)`,
        detail: `${fmt(e.supplyBefore)} → ${fmt(e.supplyAfter)}`, refType: 'supply', refId: e.id, url: null, status: null,
      });
    }
    for (const ch of this.ctx.watch.changes(tokenId, 300)) {
      if (ch.detectedAt < since || ch.severity === 'minor') continue;
      const first = ch.numericChanges[0];
      items.push({
        lane: 'done', kind: `change:${ch.severity}`, ts: ch.detectedAt,
        title: first ? `Site modifié : ${first.path || ch.sourceLabel} — ${first.before} → ${first.after}` : `Site modifié : ${ch.sourceLabel} (${ch.hunks.length} bloc(s))`,
        detail: ch.unannouncedFlag ? 'sans communication' : ch.announced ? 'annoncé' : null, refType: 'change', refId: ch.id, url: ch.sourceUrl, status: ch.severity,
      });
    }
    return items.sort((a, b) => b.ts - a.ts);
  }
}

function describeAction(kind: string, amount: number | null, counterpartyLabel: string | null, walletLabel: string | null): string {
  const who = walletLabel ? `Wallet ${walletLabel}` : 'Wallet équipe';
  const amt = amount !== null ? ` ${fmt(amount)} tokens` : '';
  switch (kind) {
    case 'transfer_out': return `${who} : transfert sortant${amt} vers ${counterpartyLabel ?? 'wallet'}`;
    case 'transfer_in': return `${who} : transfert entrant${amt} depuis ${counterpartyLabel ?? 'wallet'}`;
    case 'swap_sell': return `${who} : vente${amt} sur ${counterpartyLabel ?? 'DEX'}`;
    case 'swap_buy': return `${who} : achat${amt} sur ${counterpartyLabel ?? 'DEX'}`;
    case 'burn': return `${who} : burn${amt}`;
    case 'lp_add': return `${who} : ajout de liquidité`;
    case 'lp_remove': return `${who} : retrait de liquidité`;
    case 'mint': return `${who} : émission${amt}`;
    case 'authority_change': return `${who} : changement d’autorité`;
    default: return `${who} : ${kind}`;
  }
}
function fmt(v: number): string {
  return new Intl.NumberFormat('fr-FR', { notation: v >= 1e6 ? 'compact' : 'standard', maximumFractionDigits: 2 }).format(v);
}
