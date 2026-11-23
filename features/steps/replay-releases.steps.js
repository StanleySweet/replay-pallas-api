const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');

const release = (world, id, value) => world.replays.insert({
    matchId: id, metadata: world.dist('replays/blobCodec.js').packBlob('{}'), filedata: Buffer.from('f'),
    creationDate: '2026-01-01 00:00:00', gameRelease: value,
});
const ids = rows => rows.map(r => r.match_id).sort();

// ---- reading the release from a version
Given('a replay played on version {string}', function (version) { this.metadata = { mods: [{ name: '0ad', version }] }; });
Given('a replay whose 0ad mod is {word} and whose engine_version is {word}', function (mod, engine) { this.metadata = { mods: [{ name: '0ad', version: mod }], engine_version: engine }; });
Given('a replay with no 0ad mod and engine_version {word}', function (engine) { this.metadata = { mods: [{ name: 'feldmap', version: '3.0.1' }], engine_version: engine }; });
Given('a replay that does not say its version', function () { this.metadata = {}; });
Then('its release is {int}', function (expected) { assert.strictEqual(this.dist('replays/gameRelease.js').gameRelease(this.metadata), expected); });
Then('it has no release', function () { assert.strictEqual(this.dist('replays/gameRelease.js').gameRelease(this.metadata), null); });

// ---- filling in replays stored before the release was recorded
Given('these replays were stored without a release:', function (table) {
    const { packBlob } = this.dist('replays/blobCodec.js');
    for (const { id, version } of table.hashes()) {
        this.replays.insert({ matchId: id, metadata: packBlob(JSON.stringify(version ? { mods: [{ name: '0ad', version }] } : {})), filedata: Buffer.from('f'), creationDate: '2026-01-01 00:00:00', gameRelease: 0 });
    }
    this.db.prepare('UPDATE replays SET game_release = NULL').run();
});
When('the server starts', function () { this.filled = this.dist('replays/gameRelease.js').backfillGameRelease(this.replays); });
Then('the releases are:', function (table) {
    for (const { id, release: expected } of table.hashes())
        assert.strictEqual(this.db.prepare('SELECT game_release r FROM replays WHERE match_id = ?').get(id).r, Number(expected), id);
});
Then('starting the server again fills nothing', function () { assert.strictEqual(this.dist('replays/gameRelease.js').backfillGameRelease(this.replays), 0); });

// ---- the selector
Given('these replays are stored:', function (table) { for (const { id, release: value } of table.hashes()) release(this, id, Number(value)); });
Given('the selector has been shown', function () { this.replays.releases(); });
When('replay {string} played on release {int} is uploaded', function (id, value) { release(this, id, value); });
When('replay {string} is deleted', function (id) { this.replays.delete(id); });
Then('the selector offers:', function (table) {
    assert.deepStrictEqual(this.replays.releases(), table.hashes().map(r => ({ release: Number(r.release), replays: Number(r.replays) })));
});
Then('the selector offers releases {int}, {int}', function (a, b) { assert.deepStrictEqual(this.replays.releases().map(r => r.release), [a, b]); });
Then('the selector offers releases {int}', function (a) { assert.deepStrictEqual(this.replays.releases().map(r => r.release), [a]); });

// ---- limiting lists
Given('the user {string} uploaded replays {string} and {string}', function (nick, a, b) {
    this.users.create(nick, 'hash', `${nick}@example.org`, 1);
    const id = this.db.prepare('SELECT id FROM users WHERE nick = ?').get(nick).id;
    this.replays.linkUploader(id, a); this.replays.linkUploader(id, b);
    this.uploaders = { ...this.uploaders, [nick]: id };
});
Then('the replays of release {int} are {string}, {string}', function (value, a, b) { assert.deepStrictEqual(ids(this.replays.allMetadataNewestFirst(value)), [a, b]); });
Then('the replays of release {int} are none', function (value) { assert.deepStrictEqual(this.replays.allMetadataNewestFirst(value), []); });
Then('the replays uploaded by {string} on release {int} are {string}', function (nick, value, a) { assert.deepStrictEqual(ids(this.replays.metadataUploadedBy(this.uploaders[nick], value)), [a]); });
Then('without a release the replays uploaded by {string} are {string}, {string}', function (nick, a, b) { assert.deepStrictEqual(ids(this.replays.metadataUploadedBy(this.uploaders[nick], null)), [a, b]); });

// ---- player pages
Given('the player {string} played replays {string} and {string}', function (nick, a, b) {
    const id = this.players.findOrCreateId(nick);
    this.replays.linkLobbyPlayer(a, id); this.replays.linkLobbyPlayer(b, id);
    this.playerIds = { ...this.playerIds, [nick]: id };
});
Then('the player {string} has {int} replays', function (nick, count) { assert.strictEqual(this.players.replaysPage(this.playerIds[nick], false, 0).length, count); });
Then('the player {string} has replays {string} on release {int}', function (nick, a, value) { assert.deepStrictEqual(ids(this.players.replaysPage(this.playerIds[nick], false, 0, value)), [a]); });
