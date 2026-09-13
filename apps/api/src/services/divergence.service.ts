import { DIVERGENCE_RULES, type Divergence, type DivergenceSeries, type SeriesPoint } from '@tpm/shared';
import { nowS } from '../db/client.js';
import { AppContext } from './context.js';
import type { TokenService } from './token.service.js';

interface DailyRow { day: string; ts: number; price: number | null; mcap: number | null; supply: number | null; holders: number | null; top10: number | null }

export class DivergenceService {
  constructor(private readonly ctx: AppContext, private readonly tokens: TokenService) {}

  compute(tokenId: number): Divergence[] {
    this.tokens.require(tokenId);
    const rows = this.dailyRows(tokenId, 31);
    return DIVERGENCE_RULES.map((rule) => this.evaluate(rule.id, rows));
  }

  /** Une ligne par jour : dernier snapshot marché du jour + snapshot détenteurs du jour. */
  dailyRows(tokenId: number, days: number): DailyRow[] {
    const since = nowS() - days * 86400;
    const market = this.ctx.snapshots.marketDaily(tokenId, since);
    const holders = new Map(this.ctx.snapshots.holderHistory(tokenId, since).map((h) => [h.day, h]));
    const byDay = new Map<string, DailyRow>();
    for (const m of market) {
      byDay.set(m.day, { day: m.day, ts: m.ts, price: m.priceUsd, mcap: m.marketCapUsd, supply: m.supplyCirc, holders: null, top10: null });
    }
    for (const [day, h] of holders) {
      const row = byDay.get(day) ?? { day, ts: h.ts, price: null, mcap: null, supply: null, holders: null, top10: null };
      row.holders = h.holderCount;
      row.top10 = h.top10Pct;
      byDay.set(day, row);
    }
    return [...byDay.values()].sort((a, b) => a.ts - b.ts);
  }

  private evaluate(id: (typeof DIVERGENCE_RULES)[number]['id'], rows: DailyRow[]): Divergence {
    const rule = DIVERGENCE_RULES.find((r) => r.id === id)!;
    const computedAt = nowS();
    const base = { id: rule.id, label: rule.label, ruleText: rule.ruleText, windowDays: rule.windowDays, computedAt };
    const w = window(rows, rule.windowDays);

    switch (id) {
      case 'distribution': {
        const a = series('Détenteurs', 'comptes', w, (r) => r.holders);
        const b = series('Capitalisation', 'USD', w, (r) => r.mcap);
        if (a.changePct === null || b.changePct === null) return { ...base, ...insufficient(a, b) };
        const hit = a.changePct >= rule.params.minHolderGrowthPct! && b.changePct <= rule.params.maxMcapChangePct!;
        return {
          ...base, seriesA: a, seriesB: b, status: hit ? 'triggered' : 'ok',
          explanation: `Détenteurs ${fmtPct(a.changePct)} et capitalisation ${fmtPct(b.changePct)} sur ${rule.windowDays} j.` +
            (hit ? ' Plus de porteurs pour une valeur qui ne monte pas : profil de distribution.' : ''),
        };
      }
      case 'avg_position': {
        const a = series('Position moyenne (capi / détenteurs)', 'USD', w, (r) => (r.mcap !== null && r.holders ? r.mcap / r.holders : null));
        const b = series('Détenteurs', 'comptes', w, (r) => r.holders);
        if (a.changePct === null) return { ...base, ...insufficient(a, b) };
        const hit = a.changePct <= rule.params.maxAvgPositionChangePct!;
        return {
          ...base, seriesA: a, seriesB: b, status: hit ? 'triggered' : 'ok',
          explanation: `Position moyenne ${fmtPct(a.changePct)} sur ${rule.windowDays} j.` + (hit ? ' Les grosses lignes se fragmentent.' : ''),
        };
      }
      case 'concentration_down_price_up': {
        const a = series('Part du top 10', 'points de %', w, (r) => r.top10);
        const b = series('Prix', 'USD', w, (r) => r.price);
        if (a.changeAbs === null || b.changePct === null) return { ...base, ...insufficient(a, b) };
        const hit = a.changeAbs <= rule.params.maxTop10DeltaPts! && b.changePct >= rule.params.minPriceChangePct!;
        return {
          ...base, seriesA: a, seriesB: b, status: hit ? 'triggered' : 'ok',
          explanation: `Top 10 ${a.changeAbs >= 0 ? '+' : ''}${a.changeAbs.toFixed(2)} pts et prix ${fmtPct(b.changePct)} sur ${rule.windowDays} j.` +
            (hit ? ' Les gros allègent pendant que le prix monte : distribution possible vers la foule.' : ''),
        };
      }
      case 'burn_slowdown': {
        const w14 = window(rows, rule.windowDays * 2);
        const burnedDaily: SeriesPoint[] = [];
        for (let i = 1; i < w14.length; i++) {
          const prev = w14[i - 1]!.supply, cur = w14[i]!.supply;
          burnedDaily.push({ ts: w14[i]!.ts, value: prev !== null && cur !== null ? prev - cur : null });
        }
        const supplySeries: DivergenceSeries = series('Offre', 'tokens', w14, (r) => r.supply);
        const cutoff = computedAt - rule.windowDays * 86400;
        const recent = burnedDaily.filter((p) => p.ts >= cutoff && p.value !== null);
        const previous = burnedDaily.filter((p) => p.ts < cutoff && p.value !== null);
        const a: DivergenceSeries = { label: 'Brûlé par jour', unit: 'tokens', points: burnedDaily, changePct: null, changeAbs: null };
        if (recent.length < 3 || previous.length < 3) {
          return { ...base, seriesA: a, seriesB: supplySeries, status: 'insufficient_data', explanation: `Il faut au moins ${rule.windowDays * 2} jours d’historique d’offre.` };
        }
        const sumRecent = recent.reduce((n, p) => n + (p.value as number), 0);
        const sumPrev = previous.reduce((n, p) => n + (p.value as number), 0);
        if (sumPrev <= 0) {
          return { ...base, seriesA: a, seriesB: supplySeries, status: 'ok', explanation: 'Aucun burn observé sur la période précédente : rien à comparer.' };
        }
        const ratio = (sumRecent / sumPrev) * 100;
        a.changePct = ratio - 100;
        const hit = ratio < rule.params.maxRatioPct!;
        return {
          ...base, seriesA: a, seriesB: supplySeries, status: hit ? 'triggered' : 'ok',
          explanation: `Brûlé ${fmtNum(sumRecent)} sur 7 j contre ${fmtNum(sumPrev)} les 7 j précédents (${ratio.toFixed(0)} %).` +
            (hit ? ' Le mécanisme de redistribution s’essouffle.' : ''),
        };
      }
    }
  }
}

function window(rows: DailyRow[], days: number): DailyRow[] {
  const cutoff = nowS() - (days + 1) * 86400;
  return rows.filter((r) => r.ts >= cutoff);
}

function series(label: string, unit: string, rows: DailyRow[], pick: (r: DailyRow) => number | null): DivergenceSeries {
  const points: SeriesPoint[] = rows.map((r) => ({ ts: r.ts, value: pick(r) }));
  const valid = points.filter((p) => p.value !== null);
  const first = valid[0], last = valid[valid.length - 1];
  const span = first && last ? last.ts - first.ts : 0;
  const enough = first && last && first !== last && span >= 2 * 86400;
  return {
    label, unit, points,
    changePct: enough && (first!.value as number) !== 0 ? (((last!.value as number) - (first!.value as number)) / Math.abs(first!.value as number)) * 100 : null,
    changeAbs: enough ? (last!.value as number) - (first!.value as number) : null,
  };
}

function insufficient(a: DivergenceSeries, b: DivergenceSeries) {
  return {
    seriesA: a, seriesB: b, status: 'insufficient_data' as const,
    explanation: 'Historique insuffisant : il faut au moins deux snapshots quotidiens espacés de 2 jours ou plus pour chaque série.',
  };
}
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} %`;
const fmtNum = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v);
