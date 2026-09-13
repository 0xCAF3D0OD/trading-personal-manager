/** Lecture minimale de robots.txt : la règle la plus longue qui correspond l'emporte (allow ou disallow). */
export function isAllowedByRobots(robotsTxt: string | null, path: string, uaToken: string): boolean {
  if (!robotsTxt) return true;
  const groups: { agents: string[]; rules: { allow: boolean; pattern: string }[] }[] = [];
  let current: { agents: string[]; rules: { allow: boolean; pattern: string }[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === 'allow' || field === 'disallow') && current) {
      current.rules.push({ allow: field === 'allow', pattern: value });
      lastWasAgent = false;
    } else lastWasAgent = false;
  }
  const ua = uaToken.toLowerCase();
  let group = groups.find((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  if (!group) group = groups.find((g) => g.agents.includes('*'));
  if (!group) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const r of group.rules) {
    if (r.pattern === '') continue;
    if (matchPattern(r.pattern, path)) {
      const len = r.pattern.length;
      if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
    }
  }
  return best ? best.allow : true;
}

function matchPattern(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const p = anchored ? pattern.slice(0, -1) : pattern;
  const esc = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${esc}${anchored ? '$' : ''}`).test(path);
}
