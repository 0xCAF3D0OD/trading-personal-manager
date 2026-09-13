import type { Hunk } from '@tpm/shared';
import type { VolatileEntry } from '../db/repositories/watch.repo.js';
import type { Line } from './normalizer.js';
import { volatileKey } from './numbers.js';

/** Une ligne dont seuls les chiffres ont changé lors de `threshold` vérifications consécutives est volatile. */
export function updateVolatility(entries: VolatileEntry[], hunks: Hunk[], threshold: number, now: number): VolatileEntry[] {
  const map = new Map(entries.map((e) => [e.key, { ...e }]));
  const changedKeys = new Set<string>();
  for (const h of hunks) {
    if (h.op !== 'changed' || h.before === null || h.after === null) continue;
    const kb = volatileKey(h.path, h.before), ka = volatileKey(h.path, h.after);
    if (kb !== ka) continue;
    changedKeys.add(kb);
    const e = map.get(kb) ?? { key: kb, sample: h.after, changes: 0, lastChangedAt: 0, volatile: false };
    e.changes += 1;
    e.sample = h.after;
    e.lastChangedAt = now;
    if (e.changes >= threshold) e.volatile = true;
    map.set(kb, e);
  }
  // Une ligne stable lors de ce passage repart de zéro si elle n'était pas encore volatile.
  for (const e of map.values()) if (!changedKeys.has(e.key) && !e.volatile) e.changes = 0;
  return [...map.values()].filter((e) => e.volatile || e.changes > 0);
}

export function filterVolatile(lines: Line[], entries: VolatileEntry[]): Line[] {
  const keys = new Set(entries.filter((e) => e.volatile).map((e) => e.key));
  if (!keys.size) return lines;
  return lines.filter((l) => !keys.has(volatileKey(l.path, l.text)));
}

export function removeVolatile(entries: VolatileEntry[], key: string): VolatileEntry[] {
  return entries.filter((e) => e.key !== key);
}
