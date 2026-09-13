import type { Env } from '../../config/env.js';
import { DiscordNotifier } from './discord.notifier.js';
import { NotifierHub, type Notifier } from './notifier.js';
import { NtfyNotifier } from './ntfy.notifier.js';
import { TelegramNotifier } from './telegram.notifier.js';

export function buildNotifierHub(env: Env): NotifierHub {
  const list: Notifier[] = [];
  if (env.NTFY_URL && env.NTFY_TOPIC) list.push(new NtfyNotifier(env.NTFY_URL, env.NTFY_TOPIC, env.NTFY_TOKEN));
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) list.push(new TelegramNotifier(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID));
  if (env.DISCORD_WEBHOOK_URL) list.push(new DiscordNotifier(env.DISCORD_WEBHOOK_URL));
  return new NotifierHub(list);
}
export { NotifierHub } from './notifier.js';
