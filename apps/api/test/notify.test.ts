import { describe, expect, it } from 'vitest';
import { NtfyNotifier, ntfyPayload } from '../src/services/notify/ntfy.notifier.js';

describe('Notifications ntfy', () => {
  it('met le titre, le message et les étiquettes dans un corps JSON, même avec des caractères hors Latin-1', () => {
    const p = ntfyPayload('mon-sujet', { title: 'EMBER — Prix d’entrée atteint', message: 'Prix à 0,015 $ · règle « plan v2 »', priority: 'high', tags: ['bell'], url: 'http://localhost:8080/token/1' });
    expect(p).toEqual({ topic: 'mon-sujet', title: 'EMBER — Prix d’entrée atteint', message: 'Prix à 0,015 $ · règle « plan v2 »', priority: 4, tags: ['bell'], click: 'http://localhost:8080/token/1' });
    // Le titre contient un tiret long (U+2014) : impossible en en-tête HTTP, sans problème en JSON.
    expect(JSON.stringify(p)).toContain('\u2014'.normalize());
  });

  it('envoie à la racine du serveur en JSON, avec le jeton en Authorization', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init ?? {} }); return new Response('{}', { status: 200 }); }) as typeof fetch;
    try {
      await new NtfyNotifier('https://ntfy.sh/', 'sujet-secret', 'tk_123').send({ title: 'T — t', message: 'm', priority: 'default' });
    } finally { globalThis.fetch = orig; }
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://ntfy.sh');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toBe('Bearer tk_123');
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ topic: 'sujet-secret', title: 'T — t', priority: 3 });
    for (const v of Object.values(headers)) expect(/^[\x00-\xff]*$/.test(v)).toBe(true);
  });
});
