import { postWithTimeout, type Notification, type Notifier } from './notifier.js';

/** ntfy attend une priorité numérique dans le mode JSON : 1 (min) à 5 (max). */
const PRIORITY: Record<Notification['priority'], number> = { low: 2, default: 3, high: 4, urgent: 5 };

/**
 * Charge utile JSON de ntfy. On n'utilise plus les en-têtes HTTP (`Title`, `Tags`…) : un en-tête n'accepte que
 * des caractères Latin-1, et un titre comme « EMBER — Prix d'entrée atteint » faisait échouer chaque envoi
 * (« Cannot convert argument to a ByteString »). Le corps JSON accepte tout l'UTF-8.
 */
export function ntfyPayload(topic: string, n: Notification): Record<string, unknown> {
  const payload: Record<string, unknown> = { topic, title: n.title, message: n.message, priority: PRIORITY[n.priority] ?? 3 };
  if (n.tags?.length) payload.tags = n.tags;
  if (n.url) payload.click = n.url;
  return payload;
}

export class NtfyNotifier implements Notifier {
  readonly channel = 'ntfy';
  constructor(private readonly baseUrl: string, private readonly topic: string, private readonly token?: string) {}

  async send(n: Notification): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    // Mode JSON : la requête vise la racine du serveur, le sujet est dans le corps.
    await postWithTimeout(this.baseUrl.replace(/\/$/, ''), { method: 'POST', headers, body: JSON.stringify(ntfyPayload(this.topic, n)) });
  }
}
