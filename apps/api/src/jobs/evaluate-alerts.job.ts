import type { Services } from '../services/index.js';

export async function runAlertEvaluation(s: Services): Promise<string> {
  const r = await s.alerts.evaluateAll();
  return `${r.evaluated} évaluées, ${r.fired} déclenchées`;
}
