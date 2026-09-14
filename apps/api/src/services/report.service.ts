import type { AiReport, CreateAiReportInput } from '@tpm/shared';
import { AI_REPORT_PROMPT_VERSION } from '@tpm/shared';
import { AppContext } from './context.js';
import type { DossierService } from './dossier.service.js';
import type { TokenService } from './token.service.js';

/** Rapports d'IA collés à la main (B.3) ou, plus tard, générés côté serveur (B.4). Figés à l'enregistrement. */
export class ReportService {
  constructor(private readonly ctx: AppContext, private readonly tokens: TokenService, private readonly dossier: DossierService) {}

  list(tokenId: number): AiReport[] {
    this.tokens.require(tokenId);
    return this.ctx.reports.list(tokenId);
  }

  async create(tokenId: number, input: CreateAiReportInput): Promise<AiReport> {
    this.tokens.require(tokenId);
    const hash = input.dossierHash?.trim() || (await this.dossier.get(tokenId)).hash;
    return this.ctx.reports.insert({
      tokenId, provider: input.provider, model: input.model?.trim() || null, dossierHash: hash,
      promptVersion: AI_REPORT_PROMPT_VERSION, content: input.content.trim(), note: input.note?.trim() || null,
    });
  }
}
