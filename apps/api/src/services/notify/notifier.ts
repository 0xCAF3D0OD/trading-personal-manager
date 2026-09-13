export interface Notification {
  title: string;
  message: string;
  priority: 'low' | 'default' | 'high' | 'urgent';
  tags?: string[];
  url?: string;
}

export interface DeliveryResult {
  channel: string;
  ok: boolean;
  error: string | null;
}

export interface Notifier {
  readonly channel: string;
  send(n: Notification): Promise<void>;
}

/** Envoie sur tous les canaux configurés, sans qu'un échec en bloque un autre. */
export class NotifierHub {
  constructor(private readonly notifiers: Notifier[]) {}

  get channels(): string[] {
    return this.notifiers.map((n) => n.channel);
  }

  async broadcast(n: Notification): Promise<DeliveryResult[]> {
    return Promise.all(
      this.notifiers.map(async (notifier) => {
        try {
          await notifier.send(n);
          return { channel: notifier.channel, ok: true, error: null };
        } catch (err) {
          return { channel: notifier.channel, ok: false, error: (err as Error).message };
        }
      }),
    );
  }
}

export async function postWithTimeout(url: string, init: RequestInit, timeoutMs = 10_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} : ${(await res.text()).slice(0, 200)}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}
