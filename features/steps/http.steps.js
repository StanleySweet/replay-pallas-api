const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');
const AdmZip = require('adm-zip');

Given('a token with role {int}', async function (role) { this.token = await this.sign(role, 'admin', 1); });
Given('the token {string}', function (token) { this.token = token; });
When('a request without a token asks for {string}', async function (url) { this.token = undefined; await this.get(url); });
When('a request asks for {string}', async function (url) { await this.get(url); });
Then('the answer is {int}', function (status) { assert.strictEqual(this.last.status, status, JSON.stringify(this.last.body).slice(0, 300)); });
Then('the answer is not a server error', function () { assert.ok(this.last.status < 500, `status ${this.last.status}`); });

Then('the releases are {int} with {int} replay, {int} with {int} replays', function (a, na, b, nb) {
    assert.deepStrictEqual(this.last.body, [{ release: a, replays: na }, { release: b, replays: nb }]);
});
Then('the releases include {int} with {int} replay', function (release, count) {
    assert.deepStrictEqual(this.last.body.find(r => r.release === release), { release, replays: count });
});
Then('the list holds {int} replays', function (count) { assert.strictEqual(this.last.body.length, count); });
Then('the leaderboard lists {word}, {word}', function (a, b) { assert.deepStrictEqual(this.last.body.map(r => r.nick), [a, b]); });
Then('the leaderboard lists nobody', function () { assert.deepStrictEqual(this.last.body, []); });
Then('the account page lists {int} replays', function (count) { assert.strictEqual(this.last.body.replays.length, count); });

// ---- upload
When('a replay {string} played on {word} by {string} and {string} is uploaded', async function (id, version, a, b) {
    this.lastZip = this.zipOf(id, version, [a, b]);
    await this.upload(this.lastZip);
});
When('the same replay is uploaded again', async function () { this.first = this.last; await this.upload(this.lastZip); });
When('a zip with no replay in it is uploaded', async function () {
    const zip = new AdmZip();
    zip.addFile('readme.txt', Buffer.from('not a replay'));
    await this.upload(zip.toBuffer());
});
Then('the upload added {string}', function (id) {
    assert.strictEqual(this.last.status, 200, JSON.stringify(this.last.body));
    assert.deepStrictEqual(this.last.body.AddedReplays, [id]);
});
Then('the second upload added nothing', function () {
    assert.deepStrictEqual(this.first.body.AddedReplays.length, 1);
    assert.deepStrictEqual(this.last.body, { Success: false, AddedReplays: [] });
});
Then('nothing was added', function () { assert.deepStrictEqual(this.last.body?.AddedReplays ?? [], []); });
Then('the lobby players include {string} and {string}', function (a, b) {
    const nicks = this.last.body.map(p => p.nick ?? p.name);
    assert.ok(nicks.includes(a) && nicks.includes(b), nicks.join(','));
});
Then('downloading {string} gives back metadata.json and commands.txt', async function (id) {
    const response = await fetch(`${this.api}/replays/${id}/zip`, { headers: { authorization: `Bearer ${this.token}` } });
    // Contributors may not read: the download needs a reader at least, and a contributor is above that.
    assert.strictEqual(response.status, 200);
    const names = new AdmZip(Buffer.from(await response.arrayBuffer())).getEntries().map(e => e.entryName).sort();
    assert.deepStrictEqual(names, ['commands.txt', 'metadata.json']);
});

// ---- suppressed players
const PSEUDONYM = /Player~[0-9A-F]{8,}/;
// The zip the API serves for a replay, unpacked: every file of it as one text.
const unzipped = async (world, id) => {
    const response = await fetch(`${world.api}/replays/${id}/zip`, { headers: { authorization: `Bearer ${world.token}` } });
    assert.strictEqual(response.status, 200);
    return new AdmZip(Buffer.from(await response.arrayBuffer())).getEntries().map(e => e.getData().toString('utf8')).join('\n');
};
When('the files of {string} are downloaded', async function (id) { this.files = { ...this.files, [id]: await unzipped(this, id) }; });
Then('the files of {string} never mention {string}', function (id, nick) { assert.ok(!this.files[id].includes(nick), `found ${nick}`); });
Then('the files of {string} mention a pseudonym', function (id) { assert.match(this.files[id], PSEUDONYM); });
Then('the files of {string} and {string} hold the same pseudonym', function (a, b) { assert.strictEqual(this.files[a].match(PSEUDONYM)[0], this.files[b].match(PSEUDONYM)[0]); });
Then('the lobby players do not include {string}', function (nick) { assert.ok(!this.last.body.some(p => p.nick === nick)); });

const suppress = async (world, nick, person) => {
    world.last = await world.fetch('/replays/suppress', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nick, person }) });
    return world.last;
};
When('{string} is suppressed', async function (nick) { await suppress(this, nick); this.persons = { ...this.persons, [nick]: this.last.body.person }; });
When('{string} is suppressed as an alias of the person of {string}', async function (nick, other) { await suppress(this, nick, this.persons[other]); });
When('{string} is suppressed as an alias of person {int}', async function (nick, person) { await suppress(this, nick, person); });

When('the stored replays are erased', async function () { this.last = await this.fetch('/replays/erase', { method: 'POST' }); });
Then('the lobby players include one pseudonym', function () { assert.strictEqual(this.last.body.filter(p => /^Player~[0-9A-F]{8,}$/.test(p.nick)).length >= 1, true); });

// ---- login and registration
const post = (world, url, body, from) => world.fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(from ? { 'x-forwarded-for': from } : {}) }, body: JSON.stringify(body) });
When('{string} logs in with the password {string}', async function (email, password) { this.last = await post(this, '/users/token', { email, password }); });
When('{string} logs in with the password {string} and the old hash {string}', async function (email, password, legacy) { this.last = await post(this, '/users/token', { email, password, legacy }); });
When('{string} registers as {string} with the password {string}', async function (email, nick, password) { this.last = await post(this, '/users/', { email, nick, password }); });
When('{string} logs in {int} times with a wrong password', async function (email, times) {
    this.answers = [];
    for (let i = 0; i < times; i++)
        this.answers.push((await post(this, '/users/token', { email, password: 'wrong' })).status);
});
// The same, from a client behind the proxy: its address is the one the proxy puts in X-Forwarded-For.
When('a visitor at {string} logs in {int} times with a wrong password', async function (from, times) {
    this.answers = [];
    for (let i = 0; i < times; i++)
        this.answers.push((await post(this, '/users/token', { email: 'carl@example.org', password: 'wrong' }, from)).status);
});
When('a visitor at {string} logs in with a wrong password', async function (from) { this.last = await post(this, '/users/token', { email: 'carl@example.org', password: 'wrong' }, from); });
Then('one of the answers is {int}', function (status) { assert.ok(this.answers.includes(status), this.answers.join(',')); });

// ---- the session cookie
const jose = require('jose');
const ORIGIN = 'https://replay-pallas.wildfiregames.ovh';
// A request as a browser makes it: the cookie and an Origin, no Authorization header.
const asBrowser = async (world, url, origin, options = {}) => {
    const response = await fetch(world.api + url, { ...options, headers: { origin, ...(world.cookieValue ? { cookie: `pallas_token=${world.cookieValue}` } : {}), ...(options.headers ?? {}) } });
    const text = await response.text();
    world.lastHeaders = response.headers;
    let body = text;
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    return world.last = { status: response.status, body };
};
const takeCookie = (world, response) => { world.setCookie = response.headers.get('set-cookie') ?? ''; world.cookieValue = world.setCookie.match(/pallas_token=([^;]*)/)?.[1]; };
const browserLogin = async function (email, password) {
    const response = await fetch(this.api + '/users/token', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.20' }, body: JSON.stringify({ email, password, legacy: 'hash' }) });
    takeCookie(this, response);
    this.last = { status: response.status, body: await response.json().catch(() => null) };
};
When('{string} logs in with the password {string} for the cookie', browserLogin);
Given('Alice is logged in in a browser', async function () { await browserLogin.call(this, 'alice@example.org', 'alice-pw'); });
Then('the cookie is httpOnly, secure and same-site', function () { assert.match(this.setCookie, /^pallas_token=[^;]+; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=7200$/); });
When('a browser from {string} asks for {string} with its cookie', async function (origin, url) { await asBrowser(this, url, origin); });
When('a browser from {string} changes something with its cookie', async function (origin) {
    await asBrowser(this, '/replays/suppress', origin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nick: 'nobody' }) });
});
Then('the answer is not {int}', function (status) { assert.notStrictEqual(this.last.status, status); });
When('a browser from {string} sends a preflight', async function (origin) {
    const response = await fetch(this.api + '/replays/releases', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } });
    this.preflight = { allowOrigin: response.headers.get('access-control-allow-origin'), credentials: response.headers.get('access-control-allow-credentials') };
});
Then('no origin is allowed', function () { assert.strictEqual(this.preflight.allowOrigin, null); });
Then('that origin is allowed with credentials', function () { assert.deepStrictEqual(this.preflight, { allowOrigin: ORIGIN, credentials: 'true' }); });
When('the browser logs out', async function () {
    const response = await fetch(this.api + '/users/logout', { method: 'POST', headers: { origin: ORIGIN } });
    this.setCookie = response.headers.get('set-cookie') ?? '';
    this.last = { status: response.status, body: null };
});
Then('the cookie is cleared', function () { assert.match(this.setCookie, /^pallas_token=; .*Max-Age=0$/); });
Given('a cookie that has {int} minutes left', async function (minutes) {
    this.cookieValue = await new jose.SignJWT({ role: 1, nick: 'Alice', id: 2 }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt()
        .setIssuer('https://replay-pallas-api.wildfiregames.ovh').setAudience('https://replay-pallas-api.wildfiregames.ovh')
        .setExpirationTime(`${minutes}m`).sign(new TextEncoder().encode('smoke-secret'));
});
Then('the cookie is renewed', function () { assert.match(this.lastHeaders.get('set-cookie') ?? '', /^pallas_token=[^;]+; HttpOnly/); });
