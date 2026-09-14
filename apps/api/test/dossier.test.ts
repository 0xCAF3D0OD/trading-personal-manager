import { describe, expect, it } from 'vitest';
import { AI_REPORT_PROMPT, GLOSSARY } from '@tpm/shared';
import { buildDossier, type DossierInputs } from '../src/dossier/build.js';
import { mdToHtml, safeFilename, toStandaloneHtml } from '../src/dossier/export.js';

const now = 1_789_000_000;
function inputs(over: Partial<DossierInputs> = {}): DossierInputs {
  return {
    token: { symbol: 'EMBER', name: 'Embercurve', address: '5dvXTZ5qwgafnHtwu3Ls3QrWx1U4LQsFeCuJgkk4QEC6', program: 'spl-token', decimals: 6, createdAt: now - 90 * 86400, creatorAddress: null, addedAt: now - 3 * 86400 },
    tier: 'B',
    summary: {
      tokenId: 1, computedAt: now,
      answers: [
        { id: 'trap', question: 'Peut-on me piéger ?', purpose: 'Si oui, vous pouvez perdre sans que le prix bouge.', state: 'ok', answer: 'Non : l’équipe ne peut ni créer de tokens, ni geler les comptes, ni prélever de frais.', short: 'sain', source: 'rpc', fetchedAt: now, card: 'health', missing: null },
        { id: 'exit', question: 'Puis-je sortir ?', purpose: 'Un gain n’existe que si vous pouvez vendre.', state: 'warn', answer: 'Avec prudence : liquidité mince, 3,2 % de la capitalisation est disponible pour vendre sur 2 pools.', short: 'mince', source: 'dexscreener', fetchedAt: now, card: 'liquidity', missing: null },
        { id: 'holders', question: 'Qui tient le token ?', purpose: 'Quelques portefeuilles suffisent à effacer une hausse.', state: 'unknown', answer: 'Inconnu : aucun relevé des détenteurs pour l’instant.', short: 'inconnue', source: 'unavailable', fetchedAt: null, card: 'holders', missing: 'SOLANA_RPC_URL (URL Helius)' },
        { id: 'team', question: 'Que fait l’équipe ?', purpose: 'Une équipe qui vend annonce la suite.', state: 'unknown', answer: 'Créateur non identifiable et aucun portefeuille d’équipe déclaré : rien à observer sur la chaîne.', short: 'inconnu', source: 'local', fetchedAt: null, card: 'team', missing: null },
        { id: 'market', question: 'Le marché confirme-t-il l’histoire ?', purpose: 'Une hausse non confirmée tient rarement.', state: 'ok', answer: 'Aucune contradiction sur 5 règles évaluées.', short: 'cohérent', source: 'local', fetchedAt: now, card: 'divergences', missing: null },
      ],
    },
    health: null, market: null, supply: null, holders: null, creator: null,
    changes: [], claims: [], news: [], actions: [], divergences: [],
    plans: null, generatedAt: now, ...over,
  };
}
const plan = { id: 1, tokenId: 1, version: 1, supersedesPlanId: null, createdAt: now, entryPrice: 0.01, takeProfitPrice: 0.02, stopLossPrice: 0.005, amountUsd: 250, acceptsTotalLoss: true, note: 'note privée', riskRewardRatio: 2, maxLossUsd: 125, isCurrent: true };

describe('Dossier pour l’IA', () => {
  it('commence par la consigne, contient les cinq questions avec leur finalité, et le glossaire', () => {
    const md = buildDossier(inputs());
    expect(md.startsWith('# Dossier : EMBER (Embercurve)')).toBe(true);
    expect(md).toContain(AI_REPORT_PROMPT.split('\n')[0]);
    for (const q of ['Peut-on me piéger ?', 'Puis-je sortir ?', 'Qui tient le token ?', 'Que fait l’équipe ?', 'Le marché confirme-t-il l’histoire ?']) expect(md).toContain(q);
    expect(md).toContain('À quoi ça sert : Un gain n’existe que si vous pouvez vendre.');
    expect(md).toContain('variable manquante : SOLANA_RPC_URL (URL Helius)');
    for (const term of Object.keys(GLOSSARY).slice(0, 5)) expect(md).toContain(`**${term}**`);
    expect(md).toContain('aucune n\'est une recommandation');
  });

  it('exclut le plan par défaut et l’inclut sur demande, sans jamais contenir de clé', () => {
    const sans = buildDossier(inputs());
    expect(sans).not.toContain('Journal de discipline');
    expect(sans).not.toContain('note privée');
    const avec = buildDossier(inputs({ plans: [plan] }));
    expect(avec).toContain('## 10. Journal de discipline');
    expect(avec).toContain('note privée');
    expect(avec).not.toMatch(/api-key|HELIUS_API_KEY=|Bearer /);
  });

  it('dit « inconnu » ou « aucun » plutôt que d’inventer quand une section est vide', () => {
    const md = buildDossier(inputs());
    expect(md).toContain('## 3. Santé structurelle\n\nNon relevée.');
    expect(md).toContain('Aucune donnée de marché.');
    expect(md).toContain('Aucun relevé des détenteurs.');
    expect(md).toContain('Créateur non identifiable.');
    expect(md).toContain('Rien d’enregistré.');
  });
});

describe('Export partageable', () => {
  it('convertit le Markdown du dossier en HTML en échappant tout le texte', () => {
    const html = mdToHtml('# Titre\n\n> consigne\n\n## Section\n\n- point **fort** avec `code`\n- <script>alert(1)</script>\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nParagraphe final.');
    expect(html).toContain('<h1>Titre</h1>');
    expect(html).toContain('<blockquote>consigne</blockquote>');
    expect(html).toContain('<li>point <strong>fort</strong> avec <code>code</code></li>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>');
    expect(html).toContain('<p>Paragraphe final.</p>');
  });
  it('produit une page autonome sans ressource externe, avec titre, date et pied', () => {
    const page = toStandaloneHtml({ title: 'Rapport EMBER', subtitle: 'manuel · dossier abc', generatedAt: now, footer: 'aucune recommandation' }, buildDossier(inputs()));
    expect(page.startsWith('<!doctype html>')).toBe(true);
    expect(page).toContain('<title>Rapport EMBER</title>');
    expect(page).toContain('aucune recommandation');
    expect(page).not.toMatch(/<(script|link)\b/);
    expect(page).not.toMatch(/src="http|href="http[^"]*\.(css|js)/);
  });
  it('fabrique des noms de fichiers sûrs', () => {
    expect(safeFilename(['rapport', 'EMBER', '2026-09-14', 'manuel'], 'html')).toBe('rapport-ember-2026-09-14-manuel.html');
    expect(safeFilename(['dossier', 'Éclair/Été', null], 'md')).toBe('dossier-eclair-ete.md');
  });
});
