/** Extraction et normalisation des nombres dans un texte (fr / en), avec unité. */
export interface NumberMatch { value: number; unit: string | null; raw: string; index: number }

// Espaces insécables et fines : U+00A0, U+202F, U+2009, U+2007
const NBSP = /[\u00a0\u202f\u2009\u2007]/g;
const NUMBER_RE = /(?<![\w.])([-+]?\d(?:[\d\s.,]*\d)?)\s*(%|percent|pourcent|pour cent|\$|usd|usdc|sol\b|k\b|m\b|mn\b|b\b|bn\b|x\b)?/gi;

export function normalizeWhitespace(text: string): string {
  return text.replace(NBSP, ' ').replace(/\s+/g, ' ').trim();
}

/** Forme comparable : minuscules, sans ponctuation ni espaces. Deux textes égaux ici ne diffèrent que par la forme. */
export function comparableText(text: string): string {
  return normalizeWhitespace(text).toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');
}

function parseNumber(raw: string): number | null {
  let s = raw.replace(/\s/g, '');
  const sign = s.startsWith('-') ? -1 : 1;
  s = s.replace(/^[-+]/, '');
  const hasDot = s.includes('.'), hasComma = s.includes(',');
  if (hasDot && hasComma) {
    const decimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (hasComma) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (hasDot) {
    s = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  }
  const n = Number(s);
  return Number.isFinite(n) ? sign * n : null;
}

const UNIT_MAP: Record<string, { unit: string | null; mult: number }> = {
  '%': { unit: '%', mult: 1 }, percent: { unit: '%', mult: 1 }, pourcent: { unit: '%', mult: 1 }, 'pour cent': { unit: '%', mult: 1 },
  $: { unit: '$', mult: 1 }, usd: { unit: '$', mult: 1 }, usdc: { unit: '$', mult: 1 }, sol: { unit: 'SOL', mult: 1 },
  k: { unit: null, mult: 1e3 }, m: { unit: null, mult: 1e6 }, mn: { unit: null, mult: 1e6 }, b: { unit: null, mult: 1e9 }, bn: { unit: null, mult: 1e9 }, x: { unit: 'x', mult: 1 },
};

export function extractNumbers(text: string): NumberMatch[] {
  const out: NumberMatch[] = [];
  const src = text.replace(NBSP, ' ');
  for (const m of src.matchAll(NUMBER_RE)) {
    const rawNum = m[1] ?? '';
    const value = parseNumber(rawNum);
    if (value === null) continue;
    const u = (m[2] ?? '').toLowerCase();
    const info = u ? UNIT_MAP[u] : undefined;
    // Longues suites de chiffres sans unité (adresses, identifiants) : pas des métriques.
    if (!u && rawNum.replace(/\D/g, '').length > 12) continue;
    out.push({ value: value * (info?.mult ?? 1), unit: info?.unit ?? null, raw: m[0].trim(), index: m.index ?? 0 });
  }
  return out;
}

/** Clé de volatilité : chemin + texte avec les nombres remplacés. Une ligne dont seuls les chiffres bougent garde la même clé. */
export function volatileKey(path: string, text: string): string {
  return `${path}|${normalizeWhitespace(text).replace(/[-+]?\d[\d\s.,]*/g, '#').toLowerCase()}`;
}

export function formatValue(value: number, unit: string | null): string {
  const s = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  return unit ? `${s} ${unit}` : s;
}
