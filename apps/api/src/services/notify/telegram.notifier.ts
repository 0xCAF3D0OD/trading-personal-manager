import { postWithTimeout, type Notification, type Notifier } from './notifier.js';

export class TelegramNotifier implements Notifier {
  readonly channel = 'telegram';
  constructor(private readonly botToken: string, private readonly chatId: string) {}

  async send(n: Notification): Promise<void> {
    const text = `*${escapeMd(n.title)}*\n${escapeMd(n.message)}${n.url ? `\n${escapeMd(n.url)}` : ''}`;
    await postWithTimeout(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: this.chatId, text, parse_mode: 'MarkdownV2', disable_web_page_preview: true }),
    });
  }
}

function escapeMd(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}
