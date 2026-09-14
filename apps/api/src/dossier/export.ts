/**
 * Export partageable (docs/05, B.6) : un rapport ou un dossier en fichier Markdown, ou en page HTML autonome
 * (aucune ressource externe, imprimable en PDF depuis le navigateur). Convertisseur Markdown minimal, sans dépendance :
 * titres, listes, tableaux, gras, code, citations, paragraphes. Tout le texte est échappé.
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" rel="noopener">$2</a>');
}

export function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  const flushList = (items: string[], ordered: boolean) => { if (items.length) out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((x) => `<li>${x}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`); };
  while (i < lines.length) {
    const line = lines[i] as string;
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { const n = h[1]!.length; out.push(`<h${n}>${inline(h[2]!)}</h${n}>`); i++; continue; }
    if (/^---+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (line.startsWith('>')) {
      const q: string[] = [];
      while (i < lines.length && (lines[i] as string).startsWith('>')) { q.push(inline((lines[i] as string).replace(/^>\s?/, ''))); i++; }
      out.push(`<blockquote>${q.join('<br>')}</blockquote>`); continue;
    }
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] as string).startsWith('|')) { rows.push((lines[i] as string).replace(/^\||\|$/g, '').split('|').map((c) => c.trim())); i++; }
      const body = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
      const [head, ...rest] = body;
      if (head) out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rest.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i] as string) || /^\s*\d+[.)]\s+/.test(lines[i] as string))) {
        let item = (lines[i] as string).replace(/^\s*([-*]|\d+[.)])\s+/, '');
        i++;
        // Lignes de continuation indentées (sous-éléments) : rattachées à l'élément courant.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i] as string) && !/^\s*([-*]|\d+[.)])\s+/.test((lines[i] as string).trimStart()) ) { item += ` ${(lines[i] as string).trim()}`; i++; }
        while (i < lines.length && /^\s{2,}([-*]|\d+[.)])\s+/.test(lines[i] as string)) { item += `<br>&nbsp;&nbsp;– ${inline((lines[i] as string).replace(/^\s*([-*]|\d+[.)])\s+/, ''))}`; i++; }
        items.push(item.includes('<br>') ? item.replace(/^([^<]*)/, (m) => inline(m)) : inline(item));
      }
      flushList(items, ordered); continue;
    }
    if (line.startsWith('```')) {
      const code: string[] = []; i++;
      while (i < lines.length && !(lines[i] as string).startsWith('```')) { code.push(lines[i] as string); i++; }
      i++; out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); continue;
    }
    const p: string[] = [];
    while (i < lines.length && (lines[i] as string).trim() && !/^(#{1,6}\s|>|\||\s*[-*]\s|\s*\d+[.)]\s|```|---)/.test(lines[i] as string)) { p.push(lines[i] as string); i++; }
    out.push(`<p>${inline(p.join(' '))}</p>`);
  }
  return out.join('\n');
}

export interface ExportMeta { title: string; subtitle: string; generatedAt: number; footer: string }

/** Page HTML autonome : styles intégrés, aucune ressource externe, feuille d'impression pour le PDF. */
export function toStandaloneHtml(meta: ExportMeta, markdown: string): string {
  const date = new Date(meta.generatedAt * 1000).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.title)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 2rem 1.25rem 3rem; font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1b1f27; background: #fff; }
  main { max-width: 820px; margin: 0 auto; }
  header { border-bottom: 1px solid #d9dee7; padding-bottom: .75rem; margin-bottom: 1.5rem; }
  header h1 { margin: 0 0 .25rem; font-size: 1.5rem; }
  header p { margin: 0; color: #525b6b; font-size: .9rem; }
  h1, h2, h3, h4 { line-height: 1.25; margin: 1.4em 0 .5em; }
  h2 { font-size: 1.2rem; border-bottom: 1px solid #eef1f5; padding-bottom: .25rem; }
  h3 { font-size: 1.02rem; }
  p, ul, ol { margin: .5em 0; }
  li { margin: .2em 0; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .88em; background: #eef1f5; padding: 0 .25em; border-radius: 4px; }
  pre { background: #eef1f5; padding: .75rem; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; }
  blockquote { margin: .75rem 0; padding: .5rem .9rem; border-left: 3px solid #2f5fd6; background: #f6f7f9; color: #333; font-size: .92rem; }
  table { border-collapse: collapse; width: 100%; margin: .5rem 0; font-size: .9rem; }
  th, td { text-align: left; padding: .35rem .5rem; border-bottom: 1px solid #d9dee7; vertical-align: top; }
  th { font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; color: #8a93a3; }
  hr { border: 0; border-top: 1px solid #d9dee7; margin: 1.5rem 0; }
  footer { margin-top: 2rem; padding-top: .75rem; border-top: 1px solid #d9dee7; color: #525b6b; font-size: .85rem; }
  .print-hint { color: #8a93a3; font-size: .8rem; }
  @media print { body { padding: 0; } .print-hint { display: none; } a { color: inherit; text-decoration: none; } }
</style>
</head>
<body>
<main>
<header>
  <h1>${escapeHtml(meta.title)}</h1>
  <p>${escapeHtml(meta.subtitle)} · ${escapeHtml(date)}</p>
  <p class="print-hint">Pour un PDF : imprimer cette page et choisir « Enregistrer au format PDF ».</p>
</header>
${mdToHtml(markdown)}
<footer>${escapeHtml(meta.footer)}</footer>
</main>
</body>
</html>
`;
}

/** Nom de fichier sûr : ASCII, minuscules, tirets. */
export function safeFilename(parts: (string | null | undefined)[], ext: string): string {
  const base = parts.filter(Boolean).join('-').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'export';
  return `${base}.${ext}`;
}
