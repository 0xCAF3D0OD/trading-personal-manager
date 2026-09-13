import type { HealthItem, SourceName, Status, TokenHealth } from '@tpm/shared';
import { TTL } from '../cache/ttl-policy.js';
import type { LpLockInfo } from '../datasources/types.js';
import { nowS } from '../db/client.js';
import type { TokenRow } from '../db/repositories/tokens.repo.js';
import { AppContext } from './context.js';
import type { TokenService } from './token.service.js';

const RISKY_EXTENSIONS: Record<string, string> = {
  permanentDelegate: 'Un délégué permanent peut transférer ou brûler vos tokens sans votre signature.',
  transferHook: 'Un programme externe s’exécute à chaque transfert : il peut bloquer ou taxer.',
  transferFeeConfig: 'Frais prélevés à chaque transfert (Token-2022).',
  defaultAccountState: 'Les nouveaux comptes peuvent être gelés par défaut.',
  nonTransferable: 'Token non transférable.',
  confidentialTransferMint: 'Transferts confidentiels : audit plus difficile.',
  mintCloseAuthority: 'Le mint peut être fermé par une autorité.',
};

export class HealthService {
  constructor(private readonly ctx: AppContext, private readonly tokens: TokenService) {}

  async get(tokenId: number, force = false): Promise<{ value: TokenHealth; fetchedAt: number; cached: boolean; source: SourceName }> {
    const token = this.tokens.require(tokenId);
    const stored = this.ctx.health.get(tokenId);
    const now = nowS();
    if (!force && stored && now - stored.checked_at < TTL.health) {
      return { value: this.build(token, stored), fetchedAt: stored.checked_at, cached: true, source: 'local' };
    }
    if (force) {
      this.ctx.cache.invalidate(`rpc:mint:${token.address}`);
      this.ctx.cache.invalidate(`rugcheck:${token.address}`);
    }
    const mint = (await this.tokens.getMintInfo(token.address)).value;
    let lp: LpLockInfo = { locked: null, lockedPct: null, protocol: null, source: 'unavailable', detail: null };
    try {
      const hit = await this.ctx.cache.getOrFetch(`rugcheck:${token.address}`, TTL.lpLock, async () => ({
        value: await this.ctx.sources.rugcheck.getLpLock(token.address),
        source: 'rugcheck',
      }));
      lp = hit.value;
    } catch (err) {
      this.ctx.log.warn({ err: (err as Error).message }, 'RugCheck indisponible');
    }
    // Créateur : retente si manquant
    if (!token.creator_address || !token.created_at) {
      const c = await this.tokens.resolveCreator(token.address);
      this.ctx.tokens.updateMeta(token.id, {
        creator_address: token.creator_address ?? c.creator, creator_source: token.creator_source ?? (c.creator ? c.source : null),
        created_at: token.created_at ?? c.createdAt, created_at_source: token.created_at_source ?? (c.createdAt ? c.source : null),
      });
    }
    const row = {
      token_id: tokenId,
      mint_authority: mint.mintAuthority,
      freeze_authority: mint.freezeAuthority,
      token2022_extensions: JSON.stringify(mint.extensions),
      lp_locked: lp.locked === null ? null : lp.locked ? 1 : 0,
      lp_locked_pct: lp.lockedPct,
      lp_lock_protocol: lp.protocol,
      lp_lock_source: lp.source,
      checked_at: now,
    };
    this.ctx.health.upsert(row);
    const fresh = this.tokens.require(tokenId);
    return { value: this.build(fresh, row), fetchedAt: now, cached: false, source: 'rpc' };
  }

  private build(token: TokenRow, h: {
    mint_authority: string | null; freeze_authority: string | null; token2022_extensions: string;
    lp_locked: number | null; lp_locked_pct: number | null; lp_lock_protocol: string | null; lp_lock_source: string; checked_at: number;
  }): TokenHealth {
    const extensions: string[] = safeArr(h.token2022_extensions);
    const items: HealthItem[] = [];
    const item = (key: string, label: string, status: Status, value: string | null, detail: string | null, source: SourceName) =>
      items.push({ key, label, status, value, detail, source });

    item('mint_authority', 'Autorité de mint',
      h.mint_authority ? 'risk' : 'ok',
      h.mint_authority ? 'Présente' : 'Révoquée',
      h.mint_authority ? `L’adresse ${h.mint_authority} peut créer de nouveaux tokens et diluer l’offre.` : 'Personne ne peut plus émettre de nouveaux tokens.',
      'rpc');
    item('freeze_authority', 'Autorité de freeze',
      h.freeze_authority ? 'risk' : 'ok',
      h.freeze_authority ? 'Présente' : 'Absente',
      h.freeze_authority ? `L’adresse ${h.freeze_authority} peut geler n’importe quel compte, donc empêcher la vente.` : 'Aucun compte ne peut être gelé.',
      'rpc');
    const risky = extensions.filter((e) => RISKY_EXTENSIONS[e]);
    item('program', 'Programme',
      token.program === 'token-2022' ? (risky.length ? 'risk' : 'warning') : 'ok',
      token.program === 'token-2022' ? 'Token-2022' : 'SPL Token classique',
      token.program === 'token-2022'
        ? (extensions.length ? `Extensions : ${extensions.join(', ')}` : 'Aucune extension active')
        : null,
      'rpc');
    for (const e of risky) item(`ext_${e}`, `Extension ${e}`, 'risk', 'Active', RISKY_EXTENSIONS[e] ?? null, 'rpc');

    item('creator', 'Créateur',
      token.creator_address ? 'ok' : 'unknown',
      token.creator_address, token.creator_address ? null : 'Non résolu : métadonnées Metaplex absentes et pas de repli Solscan.',
      (token.creator_source as SourceName | null) ?? 'unavailable');
    item('created_at', 'Date de création',
      token.created_at ? (nowS() - token.created_at < 7 * 86400 ? 'warning' : 'ok') : 'unknown',
      token.created_at ? new Date(token.created_at * 1000).toISOString() : null,
      token.created_at && nowS() - token.created_at < 7 * 86400 ? 'Token de moins de 7 jours : historique trop court pour juger quoi que ce soit.' : null,
      (token.created_at_source as SourceName | null) ?? 'unavailable');
    item('lp_lock', 'Liquidité verrouillée',
      h.lp_locked === null ? 'unknown' : h.lp_locked ? 'ok' : h.lp_locked_pct !== null && h.lp_locked_pct > 50 ? 'warning' : 'risk',
      h.lp_locked_pct !== null ? `${h.lp_locked_pct.toFixed(1)} %` : null,
      h.lp_locked === null ? 'Information indisponible (RugCheck n’a pas répondu ou ne connaît pas ce token).'
        : `${h.lp_lock_protocol ?? 'protocole inconnu'} — heuristique tierce, à recouper.`,
      h.lp_lock_source as SourceName);

    return {
      tokenId: token.id, checkedAt: h.checked_at,
      mintAuthority: h.mint_authority, freezeAuthority: h.freeze_authority,
      program: token.program, token2022Extensions: extensions,
      creatorAddress: token.creator_address, creatorSource: (token.creator_source as SourceName | null) ?? 'unavailable',
      createdAt: token.created_at, createdAtSource: (token.created_at_source as SourceName | null) ?? 'unavailable',
      lpLocked: h.lp_locked === null ? null : h.lp_locked === 1, lpLockedPct: h.lp_locked_pct,
      lpLockProtocol: h.lp_lock_protocol, lpLockSource: h.lp_lock_source as SourceName,
      items,
    };
  }
}

function safeArr(s: string): string[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
