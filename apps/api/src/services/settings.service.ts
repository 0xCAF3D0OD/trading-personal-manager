import { MARKET_DEFAULTS, MARKET_DEFAULTS_VERSION, MarketSettings, SCANNER_DEFAULTS, SCANNER_DEFAULTS_VERSION, ScannerSettings, UI_DEFAULTS, UI_DEFAULTS_VERSION, UiSettings, WATCH_DEFAULTS, WATCH_DEFAULTS_VERSION, WatchSettings, type SettingsEnvelope } from '@tpm/shared';
import type { ZodTypeAny } from 'zod';
import { AppContext, NotFoundError, ValidationError } from './context.js';

interface ModuleDef { schema: ZodTypeAny; defaults: unknown; version: number }

/** Réglages versionnés par module : défauts en code, chaque écriture insère une ligne, remise à zéro par module. */
export class SettingsService {
  private readonly modules: Record<string, ModuleDef> = {
    watch: { schema: WatchSettings, defaults: WATCH_DEFAULTS, version: WATCH_DEFAULTS_VERSION },
    market: { schema: MarketSettings, defaults: MARKET_DEFAULTS, version: MARKET_DEFAULTS_VERSION },
    scanner: { schema: ScannerSettings, defaults: SCANNER_DEFAULTS, version: SCANNER_DEFAULTS_VERSION },
    ui: { schema: UiSettings, defaults: UI_DEFAULTS, version: UI_DEFAULTS_VERSION },
  };
  private readonly cache = new Map<string, { id: number; value: unknown }>();

  constructor(private readonly ctx: AppContext) {}

  private def(module: string): ModuleDef {
    const d = this.modules[module];
    if (!d) throw new NotFoundError(`Module de réglages inconnu : ${module}`);
    return d;
  }

  get<T = unknown>(module: string): T {
    const def = this.def(module);
    const row = this.ctx.settings.latest(module);
    if (!row) {
      const inserted = this.ctx.settings.insert(module, def.defaults, def.version, true, 'Défauts initiaux');
      this.cache.set(module, { id: inserted.id, value: def.defaults });
      return def.defaults as T;
    }
    const cached = this.cache.get(module);
    if (cached && cached.id === row.id) return cached.value as T;
    let parsed: unknown;
    try {
      // Les clés absentes (ajoutées par une version plus récente des défauts) reprennent la valeur par défaut.
      parsed = def.schema.parse({ ...(def.defaults as object), ...JSON.parse(row.settings) });
    } catch {
      parsed = def.defaults;
    }
    this.cache.set(module, { id: row.id, value: parsed });
    return parsed as T;
  }

  envelope(module: string): SettingsEnvelope {
    const def = this.def(module);
    const value = this.get(module);
    const row = this.ctx.settings.latest(module)!;
    return {
      module, settings: value, defaultsVersion: row.defaults_version, codeDefaultsVersion: def.version, isDefault: row.is_default === 1, updatedAt: row.created_at,
      history: this.ctx.settings.history(module).map((h) => ({ id: h.id, createdAt: h.created_at, isDefault: h.is_default === 1, note: h.note })),
    };
  }

  update(module: string, input: unknown, note: string | null): SettingsEnvelope {
    const def = this.def(module);
    const parsed = def.schema.safeParse(input);
    if (!parsed.success) throw new ValidationError('Réglages invalides', parsed.error.flatten());
    this.ctx.settings.insert(module, parsed.data, def.version, false, note);
    this.cache.delete(module);
    return this.envelope(module);
  }

  reset(module: string): SettingsEnvelope {
    const def = this.def(module);
    this.ctx.settings.insert(module, def.defaults, def.version, true, 'Remise aux défauts');
    this.cache.delete(module);
    return this.envelope(module);
  }
}
