import type { Claim, ClaimDraft, ClaimStatus, CreateClaimInput, ResolveClaimInput, WatchSettings } from '@tpm/shared';
import { nowS } from '../../db/client.js';
import { draftFromText, parseOembed } from '../../watch/claims-extract.js';
import { fetchPage } from '../../watch/fetcher.js';
import type { AlertService } from '../alert.service.js';
import { AppContext, NotFoundError, ValidationError } from '../context.js';
import type { SettingsService } from '../settings.service.js';
import type { TokenService } from '../token.service.js';

/** Journal des engagements : texte brut immuable, statut vérifiable, jamais de suppression. */
export class ClaimsService {
  constructor(
    private readonly ctx: AppContext,
    private readonly tokens: TokenService,
    private readonly settings: SettingsService,
    private readonly alerts: AlertService,
  ) {}

  private get cfg(): WatchSettings { return this.settings.get<WatchSettings>('watch'); }

  list(tokenId: number, status?: ClaimStatus): Claim[] {
    this.tokens.require(tokenId);
    return this.ctx.claims.list(tokenId, { status });
  }

  /** Analyse un texte collé : proposition de type, sous-type, nombres, échéance. Rien n'est enregistré. */
  draft(text: string, publishedAt: number | null, url: string | null): ClaimDraft {
    return draftFromText(text, publishedAt ?? nowS(), { url });
  }

  /** Import d'un post X par l'endpoint oEmbed officiel : texte intégral, auteur, date. Rien n'est enregistré. */
  async draftFromX(url: string): Promise<ClaimDraft> {
    if (!/^https?:\/\/(www\.)?(twitter|x)\.com\/[^/]+\/status\/\d+/.test(url)) throw new ValidationError('URL de post X attendue (x.com/<compte>/status/<id>).');
    const endpoint = `https://publish.twitter.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(url)}`;
    const r = await fetchPage(endpoint, { userAgent: 'trading-personal-manager/0.3 (+oEmbed)', accept: 'application/json', timeoutMs: 15_000 });
    if (r.status !== 'ok' || !r.body) throw new ValidationError(`oEmbed X indisponible (${r.error ?? r.status}). Collez le texte du post à la main.`);
    let o: { html: string; author_name?: string; author_url?: string; url?: string };
    try { o = JSON.parse(r.body); } catch { throw new ValidationError('Réponse oEmbed illisible.'); }
    const parsed = parseOembed(o);
    if (!parsed.text) throw new ValidationError('Le post ne contient pas de texte exploitable (image ou vidéo seule ?).');
    const d = draftFromText(parsed.text, parsed.publishedAt ?? nowS(), { url: parsed.url ?? url, author: parsed.author });
    return { ...d, publishedAt: parsed.publishedAt };
  }

  create(tokenId: number, input: CreateClaimInput): Claim {
    this.tokens.require(tokenId);
    if (input.url && this.ctx.claims.existsByUrl(tokenId, input.url)) throw new ValidationError('Un engagement existe déjà pour cette URL.');
    const d = draftFromText(input.text, input.publishedAt);
    const claim = this.ctx.claims.insert({
      tokenId, sourceId: input.sourceId ?? null, origin: input.origin, publishedAt: input.publishedAt, url: input.url ?? null, author: input.author ?? null,
      text: d.text, type: input.type, subtype: input.subtype ?? d.subtype, dueAt: input.dueAt ?? null, extractedNumbers: d.extractedNumbers,
      verificationKind: input.verificationKind ?? null, verificationRef: input.verificationRef ?? null,
    });
    return claim;
  }

  resolve(id: number, input: ResolveClaimInput): Claim {
    const c = this.ctx.claims.byId(id);
    if (!c) throw new NotFoundError(`Engagement ${id} introuvable`);
    if (c.status === input.status) throw new ValidationError('Statut inchangé.');
    return this.ctx.claims.resolve(id, input.status, 'manual', input.note);
  }

  /** Job horaire : vérifications automatiques et échéances. Une résolution auto reste modifiable à la main. */
  async review(): Promise<{ reviewed: number; resolved: number }> {
    const cfg = this.cfg;
    const now = nowS();
    let resolved = 0;
    const pending = this.ctx.claims.pendingForReview();
    for (const c of pending) {
      try {
        const outcome = await this.verify(c, now, cfg);
        if (!outcome) continue;
        this.ctx.claims.resolve(c.id, outcome.status, 'auto', outcome.note);
        resolved++;
        if (outcome.status === 'contradicted') {
          await this.alerts.fireEvent({
            tokenId: c.tokenId, type: 'watch_claim_contradicted', priority: 'high', dedupeKey: `claim:${c.id}`, cooldownS: 0,
            ruleText: `Engagement contredit : « ${c.text.slice(0, 160)}${c.text.length > 160 ? '…' : ''} » (${new Date(c.publishedAt * 1000).toLocaleDateString('fr-FR')}). ${outcome.note}`,
            payload: { claimId: c.id },
          });
        }
      } catch (err) {
        this.ctx.log.warn({ err: (err as Error).message, claimId: c.id }, 'Vérification d’engagement échouée');
      }
    }
    return { reviewed: pending.length, resolved };
  }

  private async verify(c: Claim, now: number, cfg: WatchSettings): Promise<{ status: ClaimStatus; note: string } | null> {
    const due = c.dueAt;
    const overdue = due !== null && now > due;
    const tooOld = due === null && now - c.publishedAt > cfg.claimExpiryDays * 86400;

    if (c.verificationKind === 'supply_decrease') {
      const events = this.ctx.team.supplyEvents(c.tokenId, c.publishedAt, due ?? now);
      const burnedPct = -events.filter((e) => e.kind === 'burn').reduce((n, e) => n + e.deltaPct, 0);
      const burned = -events.filter((e) => e.kind === 'burn').reduce((n, e) => n + e.delta, 0);
      const target = c.extractedNumbers.find((n) => n.unit === '%') ?? c.extractedNumbers.find((n) => n.unit === null);
      if (!target) {
        if (burned > 0) return { status: 'kept', note: `Offre en baisse de ${burnedPct.toFixed(3)} % (${burned.toLocaleString('fr-FR')} tokens) depuis l’annonce.` };
        if (overdue || tooOld) return { status: 'contradicted', note: 'Aucune baisse de l’offre observée depuis l’annonce.' };
        return null;
      }
      const achieved = target.unit === '%' ? burnedPct : burned;
      const label = target.unit === '%' ? `${burnedPct.toFixed(3)} %` : `${burned.toLocaleString('fr-FR')} tokens`;
      if (achieved >= target.value * 0.9) return { status: 'kept', note: `Annoncé ${target.raw}, observé ${label} sur la série d’offre.` };
      if (overdue || tooOld) return { status: 'contradicted', note: `Annoncé ${target.raw}, observé ${label} à l’échéance.` };
      return null;
    }
    if (c.verificationKind === 'lp_lock') {
      const token = this.ctx.tokens.byId(c.tokenId);
      const rc = token ? this.ctx.cache.peekStale<{ lockedPct: number | null }>(`rugcheck:${token.address}`) : null;
      const pct = rc?.value?.lockedPct ?? null;
      const target = c.extractedNumbers.find((n) => n.unit === '%')?.value ?? 90;
      if (pct !== null && pct >= target) return { status: 'kept', note: `RugCheck indique ${pct.toFixed(1)} % de liquidité verrouillée.` };
      if ((overdue || tooOld) && pct !== null) return { status: 'contradicted', note: `RugCheck indique ${pct.toFixed(1)} % verrouillé, objectif ${target} %.` };
      return null;
    }
    if (c.verificationKind === 'page_content') {
      // Vérifié par le moteur de diff : un changement de page contredisant la valeur crée un engagement « contredit » lié.
      if (overdue || tooOld) return { status: 'expired', note: `Aucun changement de page contradictoire détecté en ${cfg.claimExpiryDays} jours ; considéré tenu par défaut, sans preuve positive.` };
      return null;
    }
    if (c.verificationKind === 'wallet_transfer') {
      const acts = this.ctx.team.actionsMatching(c.tokenId, ['transfer_out', 'transfer_in', 'burn', 'lp_add'], c.publishedAt, due ?? now);
      const ref = c.verificationRef?.trim();
      const hit = acts.find((a) => !ref || a.counterparty === ref || a.walletAddress === ref || a.txSignature === ref);
      if (hit) return { status: 'kept', note: `Transaction observée : ${hit.txSignature.slice(0, 12)}… (${hit.kind}).` };
      if (overdue || tooOld) return { status: 'contradicted', note: 'Aucune transaction correspondante sur les wallets équipe.' };
      return null;
    }
    if (overdue) return { status: 'expired', note: 'Échéance dépassée sans vérification automatique possible : à qualifier à la main.' };
    if (tooOld) return { status: 'expired', note: `Plus de ${cfg.claimExpiryDays} jours sans échéance ni vérification : expiré.` };
    return null;
  }
}
