import { getDivergenceRule, type Alert, type AlertType, type CreateAlertInput, type DivergenceId, type MarketSettings } from '@tpm/shared';
import type { SettingsService } from './settings.service.js';
import type { AlertRow } from '../db/repositories/alerts.repo.js';
import { nowS } from '../db/client.js';
import { AppContext, NotFoundError, ValidationError } from './context.js';
import type { DivergenceService } from './divergence.service.js';
import type { MarketService } from './market.service.js';
import type { NotifierHub } from './notify/notifier.js';
import type { TokenService } from './token.service.js';

const DIV_ALERT_TO_RULE: Partial<Record<AlertType, DivergenceId>> = {
  div_distribution: 'distribution',
  div_avg_position: 'avg_position',
  div_concentration_down_price_up: 'concentration_down_price_up',
  div_burn_slowdown: 'burn_slowdown',
  div_liquidity_withdrawal: 'liquidity_withdrawal',
  div_unconfirmed_rise: 'unconfirmed_rise',
  div_announced_burn_no_supply_change: 'announced_burn_no_supply_change',
};

export class AlertService {
  constructor(
    private readonly ctx: AppContext,
    private readonly tokens: TokenService,
    private readonly market: MarketService,
    private readonly divergences: DivergenceService,
    private readonly hub: NotifierHub,
    private readonly settings: SettingsService,
  ) {}

  list(tokenId?: number): Alert[] {
    return this.ctx.alerts.list(tokenId).map((r) => this.toAlert(r));
  }

  create(input: CreateAlertInput): Alert {
    this.tokens.require(input.tokenId);
    return this.toAlert(this.ctx.alerts.insert({ tokenId: input.tokenId, type: input.type, threshold: input.threshold, planId: null, cooldownS: input.cooldownS }));
  }

  update(id: number, patch: { enabled?: boolean; cooldownS?: number }): Alert {
    const r = this.ctx.alerts.update(id, patch);
    if (!r) throw new NotFoundError(`Alerte ${id} introuvable`);
    return this.toAlert(r);
  }

  delete(id: number): void {
    const r = this.ctx.alerts.byId(id);
    if (!r) throw new NotFoundError(`Alerte ${id} introuvable`);
    if (r.plan_id) throw new ValidationError('Les alertes dérivées d’un plan ne se suppriment pas : désactivez-les ou créez un nouveau plan.');
    this.ctx.alerts.delete(id);
  }

  /** Crée les alertes structurelles (divergences, écart de prix, retrait de liquidité) pour un token s'il ne les a pas encore. */
  ensureDivergenceAlerts(tokenId: number): void {
    for (const type of Object.keys(DIV_ALERT_TO_RULE) as AlertType[]) {
      if (!this.ctx.alerts.existsForToken(tokenId, type)) this.ctx.alerts.insert({ tokenId, type, threshold: null, planId: null, cooldownS: 24 * 3600 });
    }
    if (!this.ctx.alerts.existsForToken(tokenId, 'liq_withdrawal')) this.ctx.alerts.insert({ tokenId, type: 'liq_withdrawal', threshold: null, planId: null, cooldownS: this.marketCfg().liqWithdrawal.cooldownS });
    if (!this.ctx.alerts.existsForToken(tokenId, 'price_spread')) this.ctx.alerts.insert({ tokenId, type: 'price_spread', threshold: null, planId: null, cooldownS: 6 * 3600 });
  }

  private marketCfg(): MarketSettings {
    return this.settings.get<MarketSettings>('market');
  }

  async sendTest(): Promise<{ channel: string; ok: boolean; error: string | null }[]> {
    if (!this.hub.channels.length) throw new ValidationError('Aucun canal de notification configuré (NTFY_TOPIC, TELEGRAM_*, DISCORD_WEBHOOK_URL).');
    return this.hub.broadcast({ title: 'Test — surveillance Solana', message: 'Le canal fonctionne. Les alertes arriveront ici.', priority: 'low', tags: ['white_check_mark'] });
  }

  /**
   * Alerte événementielle (veille, on-chain) : pas de polling, le service appelant a déjà constaté le fait.
   * Une règle par token et par type est créée à la volée ; le silence est respecté sauf si `dedupeKey` désigne
   * un fait nouveau (par exemple l'identifiant d'un changement de page), auquel cas l'alerte part quand même.
   */
  async fireEvent(input: {
    tokenId: number; type: AlertType; ruleText: string; observed?: number | null; threshold?: number | null;
    payload?: unknown; priority?: 'low' | 'default' | 'high' | 'urgent'; cooldownS?: number; dedupeKey?: string;
  }): Promise<{ fired: boolean; reason?: string }> {
    let row = this.ctx.alerts.list(input.tokenId).find((a) => a.type === input.type);
    if (!row) row = this.ctx.alerts.insert({ tokenId: input.tokenId, type: input.type, threshold: null, planId: null, cooldownS: input.cooldownS ?? 6 * 3600 });
    if (row.enabled !== 1) return { fired: false, reason: 'désactivée' };
    const now = nowS();
    const inCooldown = !!row.last_fired_at && now - row.last_fired_at < row.cooldown_s;
    if (inCooldown && !input.dedupeKey) return { fired: false, reason: 'silence' };
    if (input.dedupeKey) {
      const recent = this.ctx.alerts.events(50, input.tokenId).find((e) => e.alertId === row!.id && (e.payload as { dedupeKey?: string } | null)?.dedupeKey === input.dedupeKey);
      if (recent) return { fired: false, reason: 'déjà envoyée' };
    }
    const token = this.ctx.tokens.byId(input.tokenId);
    const symbol = token?.symbol ?? token?.address.slice(0, 6) ?? '?';
    const payload = { ...(typeof input.payload === 'object' && input.payload ? input.payload : {}), dedupeKey: input.dedupeKey ?? null };
    const deliveries = await this.hub.broadcast({
      title: `${symbol} — ${labelOf(input.type)}`, message: input.ruleText, priority: input.priority ?? 'default', tags: [tagOf(input.type)],
    });
    this.ctx.alerts.insertEvent({ alertId: row.id, firedAt: now, observed: input.observed ?? null, threshold: input.threshold ?? null, ruleText: input.ruleText, payload, deliveredTo: deliveries });
    this.ctx.alerts.markFired(row.id, now);
    this.ctx.log.info({ alertId: row.id, type: input.type, token: symbol }, 'Alerte événementielle déclenchée');
    return { fired: true };
  }

  /** Job : évalue toutes les alertes actives hors période de silence. */
  async evaluateAll(): Promise<{ evaluated: number; fired: number }> {
    const now = nowS();
    const rows = this.ctx.alerts.listEnabled();
    let fired = 0;
    const divCache = new Map<number, ReturnType<DivergenceService['compute']>>();
    for (const a of rows) {
      if (a.last_fired_at && now - a.last_fired_at < a.cooldown_s) continue;
      try {
        const res = await this.check(a, divCache);
        if (res) {
          await this.fire(a, res.observed, res.payload);
          fired++;
        }
      } catch (err) {
        this.ctx.log.warn({ err: (err as Error).message, alertId: a.id }, 'Évaluation d’alerte échouée');
      }
    }
    return { evaluated: rows.length, fired };
  }

  private async check(a: AlertRow, divCache: Map<number, ReturnType<DivergenceService['compute']>>): Promise<{ observed: number | null; payload: unknown } | null> {
    const rule = DIV_ALERT_TO_RULE[a.type];
    if (rule) {
      let list = divCache.get(a.token_id);
      if (!list) { list = this.divergences.compute(a.token_id); divCache.set(a.token_id, list); }
      const d = list.find((x) => x.id === rule);
      if (d?.status === 'triggered') return { observed: d.seriesA.changePct, payload: { explanation: d.explanation, seriesA: d.seriesA, seriesB: d.seriesB } };
      return null;
    }
    if (a.type === 'liq_withdrawal') {
      const r = this.market.liquidityWithdrawal(a.token_id);
      return r.triggered ? { observed: r.now?.ratioPct ?? null, payload: { explanation: r.reason, window: r.window } } : null;
    }
    if (a.type === 'price_spread') {
      const view = (await this.market.getView(a.token_id)).value;
      const p = view.price;
      return p.spreadConsecutiveOver >= this.marketCfg().priceSpreadAlertConsecutive
        ? { observed: p.spreadPct, payload: { explanation: `Écart DexScreener / Jupiter de ${p.spreadPct?.toFixed(2)} % sur ${p.spreadConsecutiveOver} relevés consécutifs : liquidité fragmentée ou routage défaillant, l’arbitrage ne fonctionne pas.` } }
        : null;
    }
    if (a.type === 'mint_authority_changed' || a.type === 'freeze_authority_changed') {
      const token = this.tokens.require(a.token_id);
      const stored = this.ctx.health.get(a.token_id);
      if (!stored) return null;
      const mint = (await this.tokens.getMintInfo(token.address)).value;
      const before = a.type === 'mint_authority_changed' ? stored.mint_authority : stored.freeze_authority;
      const after = a.type === 'mint_authority_changed' ? mint.mintAuthority : mint.freezeAuthority;
      return before !== after ? { observed: null, payload: { before, after } } : null;
    }
    if (a.threshold === null) return null;
    const view = (await this.market.getView(a.token_id)).value;
    const price = view.price.primary.value;
    if (price === null) return null;
    const payload = { price, source: view.price.primary.source, fetchedAt: view.price.primary.fetchedAt };
    switch (a.type) {
      case 'price_above':
      case 'plan_tp':
        return price >= a.threshold ? { observed: price, payload } : null;
      case 'price_below':
      case 'plan_sl':
      case 'plan_entry':
        return price <= a.threshold ? { observed: price, payload } : null;
      default:
        return null;
    }
  }

  private async fire(a: AlertRow, observed: number | null, payload: unknown): Promise<void> {
    const token = this.ctx.tokens.byId(a.token_id);
    const ruleText = this.ruleText(a);
    const symbol = token?.symbol ?? token?.address.slice(0, 6) ?? '?';
    const now = nowS();
    const message = [
      `Règle : ${ruleText}`,
      observed !== null ? `Constaté : ${fmt(observed)}` : null,
      a.threshold !== null ? `Seuil : ${fmt(a.threshold)}` : null,
      (payload as { explanation?: string })?.explanation ?? null,
    ].filter(Boolean).join('\n');
    const deliveries = await this.hub.broadcast({
      title: `${symbol} — ${labelOf(a.type)}`, message,
      priority: a.type === 'plan_sl' || a.type.endsWith('_changed') ? 'urgent' : a.type.startsWith('div_') ? 'default' : 'high',
      tags: [tagOf(a.type)],
    });
    this.ctx.alerts.insertEvent({ alertId: a.id, firedAt: now, observed, threshold: a.threshold, ruleText, payload, deliveredTo: deliveries });
    this.ctx.alerts.markFired(a.id, now);
    this.ctx.log.info({ alertId: a.id, type: a.type, token: symbol, deliveries }, 'Alerte déclenchée');
  }

  ruleText(a: AlertRow): string {
    const plan = a.plan_id ? this.ctx.plans.byId(a.plan_id) : null;
    const planRef = plan ? ` (plan v${plan.version} enregistré le ${new Date(plan.createdAt * 1000).toLocaleDateString('fr-FR')})` : '';
    switch (a.type) {
      case 'price_above': return `Prix au-dessus de ${fmt(a.threshold)}`;
      case 'price_below': return `Prix en dessous de ${fmt(a.threshold)}`;
      case 'price_spread': return `Écart entre DexScreener et Jupiter supérieur à ${this.marketCfg().priceSpreadWarnPct} % sur ${this.marketCfg().priceSpreadAlertConsecutive} relevés consécutifs.`;
      case 'liq_withdrawal': return `Ratio liquidité / capitalisation en baisse de ${this.marketCfg().liqWithdrawal.ratioDropPct24h} % sur 24 h (ou liquidité du pool −${this.marketCfg().liqWithdrawal.liqDropPct6h} % sur 6 h) pendant que le prix reste au-dessus de ${this.marketCfg().liqWithdrawal.priceFloorPct} %.`;
      case 'scanner_clean_candidate': return 'Un token passe les cinq filtres structurels du scanner sans aucun drapeau, toutes vérifications faites. Une seule fois par token.';
      case 'plan_tp': return `Sortie en gain fixée à ${fmt(a.threshold)}${planRef}`;
      case 'plan_sl': return `Sortie en perte fixée à ${fmt(a.threshold)}${planRef} — la règle que vous vous étiez fixée est atteinte.`;
      case 'plan_entry': return `Prix d’entrée cible ${fmt(a.threshold)} atteint${planRef}`;
      case 'mint_authority_changed': return 'L’autorité de mint a changé depuis la dernière vérification.';
      case 'freeze_authority_changed': return 'L’autorité de freeze a changé depuis la dernière vérification.';
      default: {
        const rule = DIV_ALERT_TO_RULE[a.type];
        return rule ? getDivergenceRule(rule).ruleText : a.type;
      }
    }
  }

  private toAlert(r: AlertRow): Alert {
    return {
      id: r.id, tokenId: r.token_id, type: r.type, threshold: r.threshold, planId: r.plan_id,
      enabled: r.enabled === 1, cooldownS: r.cooldown_s, lastFiredAt: r.last_fired_at, createdAt: r.created_at,
      ruleText: this.ruleText(r),
    };
  }
}

function fmt(v: number | null): string {
  if (v === null) return '—';
  return v < 0.01 ? `${v.toPrecision(4)} $` : `${v.toFixed(4)} $`;
}
function labelOf(t: AlertType): string {
  const m: Record<AlertType, string> = {
    price_above: 'Prix au-dessus du seuil', price_below: 'Prix sous le seuil',
    plan_tp: 'Objectif de gain atteint', plan_sl: 'Stop de perte atteint', plan_entry: 'Prix d’entrée atteint',
    div_distribution: 'Divergence : distribution', div_avg_position: 'Divergence : position moyenne',
    div_concentration_down_price_up: 'Divergence : concentration vs prix', div_burn_slowdown: 'Divergence : burn qui ralentit',
    mint_authority_changed: 'Autorité de mint modifiée', freeze_authority_changed: 'Autorité de freeze modifiée',
    watch_tokenomics_change: 'Tokenomics modifiées sur le site', watch_content_change: 'Contenu du site modifié',
    watch_unannounced_change: 'Modifié sans communication', watch_claim_contradicted: 'Engagement contredit',
    watch_claim_due: 'Engagement arrivé à échéance', team_transfer_to_exchange: 'Transfert équipe vers un exchange',
    team_lp_remove: 'Retrait de liquidité par l’équipe', team_sell: 'Vente par l’équipe',
    price_spread: 'Écart de prix persistant entre sources', liq_withdrawal: 'Retrait de liquidité',
    div_liquidity_withdrawal: 'Divergence : retrait de liquidité', div_unconfirmed_rise: 'Divergence : hausse non confirmée',
    div_announced_burn_no_supply_change: 'Divergence : burn annoncé sans baisse d’offre',
    scanner_clean_candidate: 'Scanner : candidat sans drapeau',
  };
  return m[t];
}
function tagOf(t: AlertType): string {
  if (t === 'plan_sl' || t.endsWith('_changed') || t === 'watch_tokenomics_change' || t === 'watch_unannounced_change' || t.startsWith('team_') || t === 'liq_withdrawal') return 'rotating_light';
  if (t.startsWith('watch_')) return 'mag';
  if (t === 'plan_tp') return 'moneybag';
  if (t.startsWith('div_')) return 'warning';
  return 'bell';
}
