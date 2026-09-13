import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { insertToken, testServices } from './helpers.js';

/** Petit site local dont on pilote le contenu : la page peut changer entre deux vérifications. */
function localSite() {
  let html = '';
  let json = '';
  let robots = 'User-agent: *\nDisallow: /prive/\n';
  const server: Server = createServer((req, res) => {
    if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(robots); }
    if (req.url?.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(json); }
    if (req.url?.startsWith('/prive/')) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<p>secret 99%</p>'); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  return {
    server,
    setHtml(h: string) { html = h; },
    setJson(j: unknown) { json = JSON.stringify(j); },
    setRobots(r: string) { robots = r; },
    listen(): Promise<string> {
      return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        resolve(`http://127.0.0.1:${addr.port}`);
      }));
    },
  };
}

const page = (share: number, extra = '') => `<html><head><title>Ember</title></head><body>
  <h1>Ember</h1><p>The community token on Solana.</p>
  <h2>Tokenomics</h2><p>${share}% of taxes are redistributed to holders</p><p>Buy tax: 5% · Sell tax: 5%</p>
  <h2>Stats</h2><p>Live price: 0.00${share}1 $</p>${extra}
</body></html>`;

describe('Veille : moteur de diff intégré', () => {
  const site = localSite();
  let base = '';
  beforeAll(async () => { base = await site.listen(); });
  afterAll(() => site.server.close());

  it('baseline, puis 80 % → 50 % : changement tokenomics, alerte immédiate, puis drapeau « sans communication » à échéance', async () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    site.setHtml(page(80));
    const src = await services.watchPages.createSource(tokenId, { kind: 'website', label: 'Tokenomics', url: `${base}/tokenomics` });
    // La découverte tourne hors requête : on la force pour le test.
    await services.watchPages.discover(src.id);
    let s = services.watchPages.sources(tokenId)[0]!;
    expect(s.mode).toBe('html');
    expect(s.lastStatus).toBe('ok');
    expect(services.watchPages.snapshots(s.id)).toHaveLength(1);

    // Rien n'a changé : pas de nouveau snapshot.
    await services.watchPages.checkNow(s.id);
    expect(services.watchPages.snapshots(s.id)).toHaveLength(1);
    expect(services.watchPages.sources(tokenId)[0]!.lastStatus).toBe('unchanged');

    // Changement de tokenomics.
    site.setHtml(page(50));
    await services.watchPages.checkNow(s.id);
    const changes = services.watchPages.changes(tokenId);
    expect(changes).toHaveLength(1);
    const c = changes[0]!;
    expect(c.severity).toBe('tokenomics');
    expect(c.numericChanges.some((n) => n.beforeValue === 80 && n.afterValue === 50 && n.path === 'Ember > Tokenomics')).toBe(true);
    expect(c.announced).toBe(false);
    expect(c.alertSentAt).not.toBeNull();
    const events = services.ctx.alerts.events(10, tokenId);
    expect(events[0]!.type).toBe('watch_tokenomics_change');
    expect(events[0]!.ruleText).toContain('80 % → 50 %');

    // Fenêtre d'association échue sans annonce : second signal, drapeau, engagement « contredit » créé.
    db.prepare('UPDATE page_changes SET announce_check_due_at = ? WHERE id = ?').run(1, c.id);
    const flagged = await services.watchPages.reviewUnannounced();
    expect(flagged).toBe(1);
    const after = services.watchPages.changes(tokenId)[0]!;
    expect(after.unannouncedFlag).toBe(true);
    expect(after.unannouncedAlertSentAt).not.toBeNull();
    const contradicted = services.claims.list(tokenId, 'contradicted');
    expect(contradicted).toHaveLength(1);
    expect(contradicted[0]!.text).toContain('80%');
    expect(services.ctx.alerts.events(10, tokenId)[0]!.type).toBe('watch_unannounced_change');
  });

  it('un engagement publié avant le changement et mentionnant la nouvelle valeur l’associe : pas de second signal', async () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    site.setHtml(page(80));
    const src = await services.watchPages.createSource(tokenId, { kind: 'website', label: 'Tokenomics', url: `${base}/t2` });
    await services.watchPages.discover(src.id);
    const now = Math.floor(Date.now() / 1000);
    services.claims.create(tokenId, { text: 'Starting today the holders share of taxes moves to 50%', publishedAt: now - 3600, type: 'tokenomics', origin: 'manual' });
    site.setHtml(page(50));
    await services.watchPages.checkNow(src.id);
    const c = services.watchPages.changes(tokenId)[0]!;
    expect(c.announced).toBe(true);
    expect(c.announcedClaimId).not.toBeNull();
    expect(c.announceCheckDueAt).toBeNull();
  });

  it('une ligne dont seuls les chiffres bougent devient volatile après trois passages et n’est plus un changement', async () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    site.setHtml(page(80));
    const src = await services.watchPages.createSource(tokenId, { kind: 'website', label: 'Accueil', url: `${base}/t3` });
    await services.watchPages.discover(src.id);
    for (const p of ['0.0091', '0.0092', '0.0093', '0.0094']) {
      site.setHtml(page(80).replace(/Live price: [^<]+/, `Live price: ${p} $`));
      await services.watchPages.checkNow(src.id);
    }
    const s = services.watchPages.sources(tokenId)[0]!;
    expect(s.volatileLines.length).toBe(1);
    expect(s.volatileLines[0]!.sample).toContain('Live price');
    const before = services.watchPages.changes(tokenId).length;
    site.setHtml(page(80).replace(/Live price: [^<]+/, 'Live price: 0.0095 $'));
    await services.watchPages.checkNow(src.id);
    expect(services.watchPages.changes(tokenId).length).toBe(before);
    expect(services.watchPages.sources(tokenId)[0]!.lastStatus).toBe('unchanged');
    // Retrait manuel de la ligne volatile : elle redevient surveillée.
    services.watchPages.updateSource(src.id, { removeVolatileKey: s.volatileLines[0]!.key });
    expect(services.watchPages.sources(tokenId)[0]!.volatileLines).toHaveLength(0);
  });

  it('mode API JSON : un changement de mode crée un snapshot de référence sans changement, puis 80 → 50 est détecté par chemin de clés', async () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    site.setHtml(page(80));
    site.setJson({ tokenomics: { tax: { holders: 80, lp: 20 } }, pools: [{ id: 'a', liq: 1 }, { id: 'b', liq: 2 }] });
    const src = await services.watchPages.createSource(tokenId, { kind: 'website', label: 'App', url: `${base}/t4` });
    await services.watchPages.discover(src.id);
    services.watchPages.updateSource(src.id, { mode: 'json_api', apiUrl: `${base}/api/config`, jsonPointer: '/tokenomics' });
    await services.watchPages.checkNow(src.id);
    expect(services.watchPages.changes(tokenId)).toHaveLength(0);
    expect(services.watchPages.sources(tokenId)[0]!.lastStatus).toBe('ok');
    site.setJson({ tokenomics: { tax: { holders: 50, lp: 20 } }, pools: [{ id: 'b', liq: 2 }, { id: 'a', liq: 1 }] });
    await services.watchPages.checkNow(src.id);
    const c = services.watchPages.changes(tokenId)[0]!;
    expect(c.severity).toBe('tokenomics');
    expect(c.numericChanges[0]).toMatchObject({ path: '/tax/holders', beforeValue: 80, afterValue: 50 });
  });

  it('robots.txt qui interdit le chemin : aucun snapshot, statut explicite', async () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    const src = await services.watchPages.createSource(tokenId, { kind: 'website', label: 'Privé', url: `${base}/prive/page` });
    await services.watchPages.discover(src.id);
    const s = services.watchPages.sources(tokenId)[0]!;
    expect(s.lastStatus).toBe('blocked_by_robots');
    expect(services.watchPages.snapshots(s.id)).toHaveLength(0);
  });

  it('page rendue côté client sans service de rendu : statut « choix de mode requis », pas de fausse détection', async () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    site.setHtml('<html><body><div id="root"></div><script src="/app.js"></script></body></html>');
    const src = await services.watchPages.createSource(tokenId, { kind: 'website', label: 'SPA', url: `${base}/spa` });
    await services.watchPages.discover(src.id);
    const s = services.watchPages.sources(tokenId)[0]!;
    expect(s.lastStatus).toBe('needs_mode_choice');
    expect(s.lastError).toContain('RENDERER_URL');
    expect(() => services.watchPages.updateSource(src.id, { mode: 'headless' })).toThrow(/renderer/);
  });
});

describe('Veille : engagements et réglages', () => {
  it('propose un brouillon, enregistre un engagement immuable, vérifie un burn par la série d’offre', async () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    const now = Math.floor(Date.now() / 1000);
    const draft = services.claims.draft('We will burn 5% of the supply within 7 days', now - 3 * 86400, null);
    expect(draft.subtype).toBe('burn');
    expect(draft.verificationKind).toBe('supply_decrease');
    const claim = services.claims.create(tokenId, { text: draft.text, publishedAt: draft.publishedAt!, type: draft.type, subtype: draft.subtype, dueAt: draft.dueAt, verificationKind: draft.verificationKind, origin: 'manual' });
    expect(() => db.prepare('UPDATE claims SET text = ? WHERE id = ?').run('autre', claim.id)).toThrow(/immuable/);
    expect(() => db.prepare('DELETE FROM claims WHERE id = ?').run(claim.id)).toThrow(/suppriment/);

    // Série d'offre : −5,2 % depuis l'annonce → tenu.
    const ins = db.prepare(`INSERT INTO market_snapshots (token_id, ts, price_source, supply_circ, supply_source) VALUES (?, ?, 'dexscreener', ?, 'rpc')`);
    ins.run(tokenId, now - 2 * 86400, 1_000_000);
    ins.run(tokenId, now - 86400, 948_000);
    expect(services.onchain.deriveSupplyEvents(tokenId)).toBe(1);
    const r = await services.claims.review();
    expect(r.resolved).toBe(1);
    const kept = services.claims.list(tokenId, 'kept');
    expect(kept).toHaveLength(1);
    expect(kept[0]!.resolvedBy).toBe('auto');
    // Une résolution automatique reste modifiable à la main, avec note.
    const manual = services.claims.resolve(kept[0]!.id, { status: 'contradicted', note: 'Le burn venait d’un autre wallet, pas du protocole.' });
    expect(manual.resolvedBy).toBe('manual');
  });

  it('un burn annoncé non observé à l’échéance est contredit et notifié', async () => {
    const { db, services } = testServices();
    const tokenId = insertToken(db);
    const now = Math.floor(Date.now() / 1000);
    services.claims.create(tokenId, { text: 'Burn of 10% of supply this week', publishedAt: now - 10 * 86400, dueAt: now - 86400, type: 'tokenomics', subtype: 'burn', verificationKind: 'supply_decrease', origin: 'manual' });
    const ins = db.prepare(`INSERT INTO market_snapshots (token_id, ts, price_source, supply_circ, supply_source) VALUES (?, ?, 'dexscreener', ?, 'rpc')`);
    ins.run(tokenId, now - 9 * 86400, 1_000_000);
    ins.run(tokenId, now - 2 * 86400, 999_000);
    services.onchain.deriveSupplyEvents(tokenId);
    await services.claims.review();
    expect(services.claims.list(tokenId, 'contradicted')).toHaveLength(1);
    expect(services.ctx.alerts.events(5, tokenId)[0]!.type).toBe('watch_claim_contradicted');
  });

  it('réglages : défauts versionnés, mise à jour validée, remise à zéro par module', () => {
    const { services } = testServices();
    const env = services.settings.envelope('watch');
    expect(env.isDefault).toBe(true);
    expect((env.settings as { associationWindowH: number }).associationWindowH).toBe(48);
    const upd = services.settings.update('watch', { ...(env.settings as object), associationWindowH: 72 }, 'test');
    expect((upd.settings as { associationWindowH: number }).associationWindowH).toBe(72);
    expect(upd.isDefault).toBe(false);
    expect(() => services.settings.update('watch', { ...(env.settings as object), associationWindowH: -1 }, null)).toThrow();
    const reset = services.settings.reset('watch');
    expect(reset.isDefault).toBe(true);
    expect(reset.history.length).toBe(3);
  });
});
