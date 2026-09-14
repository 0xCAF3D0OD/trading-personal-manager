import { z } from 'zod';

/** Rapport d'IA conservé tel quel, daté, relié au dossier qui l'a produit. Jamais modifié (comme un plan du journal). */
export const AiReportProvider = z.enum(['manuel', 'anthropic', 'openai', 'ollama']);
export type AiReportProvider = z.infer<typeof AiReportProvider>;

export const AiReport = z.object({
  id: z.number(),
  tokenId: z.number(),
  createdAt: z.number(),
  provider: AiReportProvider,
  model: z.string().nullable(),
  /** Empreinte du dossier utilisé : relie le rapport aux données du moment. */
  dossierHash: z.string(),
  promptVersion: z.number(),
  content: z.string(),
  note: z.string().nullable(),
});
export type AiReport = z.infer<typeof AiReport>;

export const CreateAiReportInput = z.object({
  provider: AiReportProvider.default('manuel'),
  model: z.string().max(120).optional().nullable(),
  content: z.string().min(20).max(200_000),
  note: z.string().max(500).optional().nullable(),
  /** Empreinte affichée à côté du bouton « Copier le dossier » ; si absente, celle du dossier courant est prise. */
  dossierHash: z.string().max(64).optional().nullable(),
});
export type CreateAiReportInput = z.infer<typeof CreateAiReportInput>;

export const DossierView = z.object({
  tokenId: z.number(),
  generatedAt: z.number(),
  hash: z.string(),
  includesPlan: z.boolean(),
  markdown: z.string(),
});
export type DossierView = z.infer<typeof DossierView>;
