import { postWithTimeout, type Notification, type Notifier } from './notifier.js';

export class NtfyNotifier implements Notifier {
  readonly channel = 'ntfy';
  constructor(private readonly baseUrl: string, private readonly topic: string, private readonly token?: string) {}

  async send(n: Notification): Promise<void> {
    const headers: Record<string, string> = {
      Title: n.title,
      Priority: n.priority,
      'Content-Type': 'text/plain; charset=utf-8',
    };
    if (n.tags?.length) headers['Tags'] = n.tags.join(',');
    if (n.url) headers['Click'] = n.url;
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    await postWithTimeout(`${this.baseUrl.replace(/\/$/, '')}/${encodeURIComponent(this.topic)}`, {
      method: 'POST', headers, body: n.message,
    });
  }
}
