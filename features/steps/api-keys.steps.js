const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');

const json = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// ---- over HTTP
Given('Alice is logged in with a token', async function () { this.token = await this.sign(1, 'Alice', 2); });
Given('the admin is logged in with a token', async function () { this.token = await this.sign(3, 'admin', 1); });
When('she makes a key named {string} for the role {int}', async function (label, role) {
    this.last = await this.fetch('/users/api-keys', json({ label, role }));
    if (this.last.status === 201) { this.key = this.last.body.key; this.keyId = this.last.body.id; this.keyOwnerToken = this.token; }
});
Then('the key starts with {string}', function (prefix) { assert.ok(this.key.startsWith(prefix), this.key); });
// A key is sent as the Bearer token, in place of the login.
const withKey = async (world, action) => {
    const login = world.token;
    world.token = world.key;
    try { return await action(); } finally { world.token = login; }
};
When('the key is used to ask for {string}', async function (url) { await withKey(this, () => this.get(url)); });
When('the key is used to make a key named {string} for the role {int}', async function (label, role) {
    this.last = await withKey(this, () => this.fetch('/users/api-keys', json({ label, role })));
});
When('she lists her keys', async function () { await this.get('/users/api-keys'); });
When('she deletes that key', async function () { this.last = await this.fetch(`/users/api-keys/${this.keyId}`, { method: 'DELETE' }); });
Then('the list holds the key {string} and no secret', function (label) {
    assert.ok(this.last.body.some(k => k.label === label), JSON.stringify(this.last.body));
    assert.ok(!JSON.stringify(this.last.body).includes('key'), JSON.stringify(this.last.body));
});

// ---- on the repository
let key;
Given('an account {string} with the role {int}', function (nick, role) { this.users.create(nick, '', `${nick}@example.org`, role); this.accounts = { ...this.accounts, [nick]: this.users.accountByNick(nick).id }; });
const day = 86400000;
Given('a key for {string} with the role {int} that expired yesterday', function (nick, role) { key = this.dist('users/apiKey.js').newApiKey(); this.users.createApiKey(this.accounts[nick], 't', this.dist('users/apiKey.js').hashApiKey(key), role, new Date(Date.now() - day).toISOString()); });
Given('a key for {string} with the role {int} that expires tomorrow', function (nick, role) { key = this.dist('users/apiKey.js').newApiKey(); this.users.createApiKey(this.accounts[nick], 't', this.dist('users/apiKey.js').hashApiKey(key), role, new Date(Date.now() + day).toISOString()); });
Given('a key for {string} with the role {int} that does not expire', function (nick, role) { key = this.dist('users/apiKey.js').newApiKey(); this.users.createApiKey(this.accounts[nick], 't', this.dist('users/apiKey.js').hashApiKey(key), role, null); });
When('{string} is lowered to the role {int}', function (nick, role) { this.users.setRole(this.accounts[nick], role); });
const claims = world => world.users.claimsForApiKey(world.dist('users/apiKey.js').hashApiKey(key));
Then('the key gives no claims', function () { assert.strictEqual(claims(this), undefined); });
Then('the key gives the role {int} to {string}', function (role, nick) { assert.deepStrictEqual(claims(this), { id: this.accounts[nick], nick, role }); });
Then('the key was never used', function () { assert.strictEqual(this.users.apiKeysOf(Object.values(this.accounts)[0])[0].last_used_at, null); });
When('the key is used', function () { claims(this); });
Then('the key was used just now', function () { assert.notStrictEqual(this.users.apiKeysOf(Object.values(this.accounts)[0])[0].last_used_at, null); });
When('she makes {int} keys', async function (count) {
    for (let i = 0; i < count; i++) {
        await this.fetch('/users/api-keys', json({ label: `key ${i}`, role: 2 })).then(r => { this.last = r; this.keyId = r.body.id; });
    }
});
