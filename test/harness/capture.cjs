// Boots nothing: talks to a running API and writes normalized responses to OUT. See README.md.
const fs = require('fs'), crypto = require('crypto'), path = require('path');
const API = process.env.API, OUT = process.env.OUT, API_NODE = path.join(__dirname, '..', '..') + path.sep;
const { createRequire } = require('module'); const req = createRequire(API_NODE + 'package.json');
const jose = req('jose'); const AdmZip = req('adm-zip');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = v => Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, norm(v[k])])) : v;
(async () => {
  for (let i = 0; i < 400; i++) { try { if ((await fetch(API + '/swagger/json')).ok) break; } catch {} await sleep(1000); }
  const token = await new jose.SignJWT({ role: 3, nick: 'harness', id: 1 }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt()
    .setIssuer('https://replay-pallas-api.wildfiregames.ovh').setAudience('https://replay-pallas-api.wildfiregames.ovh').setExpirationTime('2h').sign(new TextEncoder().encode(process.env.JOSE_SECRET));
  fs.mkdirSync(OUT, { recursive: true });
  const mid = process.env.MID, lid = process.env.LID;
  const gets = ['/replays/latest-list-items', '/replays/all-list-items', '/replays/my-list-items', '/replays/latest', '/replays/all', '/replays/my-replays', `/replays/${mid}`,
    '/users', '/users/latest', '/users/GetDetails/1', `/users/GetDetailsByLobbyUserId/${lid}`, '/users/1', '/lobby-users', '/local-ratings/users', '/local-ratings/aliases', '/local-ratings/options', '/local-ratings/glicko-ratings', '/replays/all-list-items?release=26', '/replays/all-list-items?release=23', '/replays/all-list-items?release=99', '/replays/latest-list-items?release=26', '/local-ratings/users?release=26', '/local-ratings/users?release=23', '/local-ratings/users?release=99', '/local-ratings/glicko-ratings?release=26', '/users/GetDetailsByLobbyUserId/'+lid+'?release=26'];
  const summary = {};
  for (const p of gets) {
    const r = await fetch(API + p, { headers: { authorization: 'Bearer ' + token } });
    const t = await r.text(); let body = t; try { body = JSON.stringify(norm(JSON.parse(t)), null, 1); } catch {}
    fs.writeFileSync(path.join(OUT, p.replace(/[^\w]+/g, '_') + '.json'), body);
    summary[p] = r.status + ' ' + body.length;
  }
  const z = await fetch(`${API}/replays/${mid}/zip`, { headers: { authorization: 'Bearer ' + token } });
  const zip = new AdmZip(Buffer.from(await z.arrayBuffer()));
  summary['zip'] = z.status + ' ' + zip.getEntries().map(e => e.entryName + ':' + crypto.createHash('sha256').update(e.getData()).digest('hex').slice(0, 12)).join(',');
  if (process.env.REBUILD) {
    const H = { headers: { authorization: 'Bearer ' + token } };
    const started = await fetch(API + '/replays/rebuild-replay-metadata', H); summary['rebuild start'] = started.status + ' ' + (await started.json()).state;
    const second = await fetch(API + '/replays/rebuild-replay-metadata', H); summary['second start while running'] = second.status;
    // The API must keep answering while the worker runs: poll the status and a plain route, timing each.
    let probes = 0, slowest = 0; const states = new Set(); let finalStatus;
    for (;;) {
      const t0 = Date.now(); const st = await (await fetch(API + '/replays/rebuild-status', H)).json(); await fetch(API + '/swagger/json');
      probes++; slowest = Math.max(slowest, Date.now() - t0); states.add(st.state);
      if (st.state === 'done' || st.state === 'failed') { finalStatus = st; break; }
      await sleep(200);
    }
    summary['rebuild final'] = JSON.stringify({ state: finalStatus.state, done: finalStatus.done, total: finalStatus.total, skipped: finalStatus.skipped, error: finalStatus.error });
    summary['while running'] = JSON.stringify({ probes, slowestMs: slowest, statesSeen: [...states] });
    const zip2 = new AdmZip(Buffer.from(await (await fetch(`${API}/replays/${mid}/zip`, H)).arrayBuffer()));
    summary['zip after rebuild'] = zip2.getEntries().map(e => e.entryName + ':' + crypto.createHash('sha256').update(e.getData()).digest('hex').slice(0, 12)).join(',');
    for (const p of ['/replays/rebuild-lobby-rank-history', '/replays/rebuild-glicko-rank-history']) {
      const r = await fetch(API + p, H); summary[p] = r.status; await sleep(3000);
    }
    for (const p of ['/replays/latest', `/replays/${mid}`, '/users/GetDetailsByLobbyUserId/' + lid, '/local-ratings/glicko-ratings']) {
      const r = await fetch(API + p, { headers: { authorization: 'Bearer ' + token } }); const t = await r.text(); let body = t; try { body = JSON.stringify(norm(JSON.parse(t)), null, 1); } catch {}
      fs.writeFileSync(path.join(OUT, 'after_rebuild' + p.replace(/[^\w]+/g, '_') + '.json'), body); summary['after' + p] = r.status + ' ' + body.length;
    }
  }
  fs.writeFileSync(path.join(OUT, '_summary.json'), JSON.stringify(summary, null, 1)); console.log(JSON.stringify(summary, null, 1));
})();
