import { postWithTimeout, type Notification, type Notifier } from './notifier.js';

export class DiscordNotifier implements Notifier {
  readonly channel = 'discord';
  constructor(private readonly webhookUrl: string) {}

  async send(n: Notification): Promise<void> {
    await postWithTimeout(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: `**${n.title}**\n${n.message}${n.url ? `\n${n.url}` : ''}` }),
    });
  }
}
