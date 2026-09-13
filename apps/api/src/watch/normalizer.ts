import { parseDocument } from 'htmlparser2';
import type { AnyNode, Element } from 'domhandler';
import { normalizeWhitespace } from './numbers.js';

export interface Line { path: string; text: string }

const SKIP = new Set(['script', 'style', 'noscript', 'svg', 'iframe', 'template', 'head', 'canvas', 'video', 'audio', 'object', 'embed']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'dl', 'dt', 'dd', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'figure', 'figcaption', 'form', 'fieldset', 'label', 'summary', 'details', 'address', 'hr', 'br']);
const HEADING = /^h([1-6])$/;

function isElement(n: AnyNode): n is Element {
  return n.type === 'tag' || n.type === 'script' || n.type === 'style';
}

/** HTML → lignes normalisées portant chacune le chemin des titres qui la précèdent. Sans navigateur. */
export function htmlToLines(html: string): { title: string | null; lines: Line[] } {
  const doc = parseDocument(html);
  const lines: Line[] = [];
  const headings: string[] = [];
  let title: string | null = null;
  const pathOf = () => headings.filter(Boolean).join(' > ');

  const inlineText = (node: AnyNode): string => {
    if (node.type === 'text') return node.data;
    if (!isElement(node)) return '';
    if (SKIP.has(node.name)) return '';
    if (node.name === 'br') return ' ';
    let s = '';
    for (const c of node.children) s += inlineText(c);
    if (node.name === 'a' && node.attribs?.href && !node.attribs.href.startsWith('#') && !node.attribs.href.startsWith('javascript:')) s += ` [${node.attribs.href}]`;
    if (node.name === 'img' && node.attribs?.alt) s += ` ${node.attribs.alt}`;
    return s;
  };
  const hasBlockChild = (el: Element): boolean => el.children.some((c) => isElement(c) && (BLOCK.has(c.name) || hasBlockChild(c)));
  const push = (text: string) => { const t = normalizeWhitespace(text); if (t) lines.push({ path: pathOf(), text: t }); };

  const walk = (node: AnyNode) => {
    if (node.type === 'text') { push(node.data); return; }
    if (!isElement(node)) return;
    if (SKIP.has(node.name)) return;
    if (node.name === 'title') return;
    const h = HEADING.exec(node.name);
    if (h) {
      const level = Number(h[1]);
      const text = normalizeWhitespace(inlineText(node));
      headings.length = level - 1;
      headings[level - 1] = text;
      push(text);
      return;
    }
    if (!BLOCK.has(node.name) && node.name !== 'body' && node.name !== 'html') { push(inlineText(node)); return; }
    if (!hasBlockChild(node)) { push(inlineText(node)); return; }
    let run = '';
    for (const c of node.children) {
      const blockish = isElement(c) && (BLOCK.has(c.name) || hasBlockChild(c) || HEADING.test(c.name));
      if (blockish) { push(run); run = ''; walk(c); }
      else run += inlineText(c);
    }
    push(run);
  };
  title = findTitle(doc.children);
  for (const n of doc.children) walk(n);
  return { title, lines };
}

/** Premier élément <title> du document, où qu'il soit. */
function findTitle(nodes: AnyNode[]): string | null {
  for (const n of nodes) {
    if (!isElement(n)) continue;
    if (n.name === 'title') {
      const t = normalizeWhitespace(n.children.map((x) => (x.type === 'text' ? x.data : '')).join(''));
      return t || null;
    }
    const inner = findTitle(n.children);
    if (inner) return inner;
  }
  return null;
}

/** Page rendue côté client : presque aucun texte lisible, ou une racine d'application vide. */
export function looksClientRendered(html: string, lines: Line[]): boolean {
  const text = lines.map((l) => l.text).join(' ');
  if (lines.length >= 5 && text.length >= 80) return false;
  const emptyRoot = /<div[^>]+id=["'](root|app|__next|__nuxt|___gatsby)["'][^>]*>\s*<\/div>/i.test(html);
  return emptyRoot || text.length < 80;
}

/** JSON → lignes « chemin de clés → valeur ». Les tableaux d'objets identifiés sont indexés par identifiant, pas par position. */
export function jsonToLines(value: unknown, pointer?: string | null): Line[] {
  let root = value;
  if (pointer) {
    for (const seg of pointer.split('/').filter(Boolean)) {
      const key = seg.replace(/~1/g, '/').replace(/~0/g, '~');
      if (root && typeof root === 'object') root = (root as Record<string, unknown>)[key];
      else { root = undefined; break; }
    }
  }
  const lines: Line[] = [];
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) {
      const ids = v.map((item) => (item && typeof item === 'object' ? idOf(item as Record<string, unknown>) : null));
      const allIdentified = v.length > 0 && ids.every((id) => id !== null);
      const order = v.map((_, i) => i);
      // Tableau d'objets identifiés : ordre par identifiant, un réordonnancement n'est pas un changement.
      if (allIdentified) order.sort((a, b) => String(ids[a]).localeCompare(String(ids[b])));
      for (const i of order) walk(v[i], `${path}/${allIdentified ? ids[i] : i}`);
    } else if (v && typeof v === 'object') {
      for (const k of Object.keys(v as object).sort()) walk((v as Record<string, unknown>)[k], `${path}/${k}`);
    } else {
      lines.push({ path: path || '/', text: v === null ? 'null' : normalizeWhitespace(String(v)) });
    }
  };
  walk(root, '');
  return lines;
}
function idOf(o: Record<string, unknown>): string | null {
  for (const k of ['id', 'key', 'slug', 'symbol', 'name', 'title']) {
    const v = o[k];
    if (typeof v === 'string' || typeof v === 'number') return String(v);
  }
  return null;
}
