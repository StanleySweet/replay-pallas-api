const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');

const lobbyTables = world => ({
    links: world.db.prepare('SELECT match_id m, lobby_player_id p FROM replay_lobby_player_link ORDER BY m, p').all(),
    ranking: world.db.prepare('SELECT match_id m, lobby_player_id p, elo FROM lobby_ranking_history ORDER BY m, p').all(),
});
const metadataOf = (world, id) => {
    try { return JSON.parse(world.dist('replays/blobCodec.js').unpackBlob(world.db.prepare('SELECT metadata FROM replays WHERE match_id = ?').get(id).metadata)); }
    catch { return null; }   // a replay whose metadata cannot be read
};

Given('these replays played by Alice, Bob and the AI Petra:', function (table) {
    for (const row of table.hashes()) this.uploadedReplay(this.replays, row.id, row.version, Number(row['alice orders']));
});
Given('a replay {string} whose stored metadata cannot be read', function (id) {
    this.replays.insert({ matchId: id, creationDate: '2026-01-02 00:00:00', gameRelease: 0, metadata: Buffer.from('not a blob'), filedata: Buffer.from('f') });
});
Given('{string} has an old link to the player {string}', function (id, nick) { this.replays.linkLobbyPlayer(id, this.players.findOrCreateId(nick)); });

const run = (world, onProgress) => {
    world.progress = [];
    world.result = world.dist('replays/rebuildMetadata.js').rebuildReplayMetadata(world.db, progress => { world.progress.push(progress); onProgress?.(progress); });
};
When('the metadata is rebuilt', function () {
    this.before = lobbyTables(this);
    this.duringReading = [];
    run(this, progress => { if (progress.phase === 'reading') this.duringReading.push(lobbyTables(this)); });
    this.first = { ...lobbyTables(this), metadata: this.db.prepare('SELECT match_id m, metadata FROM replays ORDER BY m').all().map(r => [r.m, metadataOf(this, r.m)]).filter(([, m]) => m) };
});
When('the metadata is rebuilt again', function () { run(this); });
When('the metadata is rebuilt and replay {string} is uploaded while it reads', function (id) {
    let uploaded = false;
    run(this, progress => {
        if (uploaded || progress.phase !== 'reading') return;
        uploaded = true;
        this.uploadedReplay(this.replays, id, '0.28.0', 1);
        this.replays.linkLobbyPlayer(id, this.players.findOrCreateId('Alice'));
        this.replays.linkLobbyPlayer(id, this.players.findOrCreateId('Bob'));
    });
});

Then('the metadata of {string} counts {int} orders for Alice', function (id, orders) { assert.strictEqual(metadataOf(this, id).settings.PlayerData[0].NumberOfCommands, orders); });
Then('the release of {string} is {int}', function (id, release) { assert.strictEqual(this.db.prepare('SELECT game_release r FROM replays WHERE match_id = ?').get(id).r, release); });
Then('the lobby players are {string} and {string} only', function (a, b) { assert.deepStrictEqual(this.db.prepare('SELECT nick FROM lobby_players ORDER BY nick').all().map(r => r.nick).filter(n => n !== 'Stale'), [a, b]); });
Then('{string} is linked to {string} and {string}', function (id, a, b) {
    const nicks = this.db.prepare('SELECT lp.nick n FROM replay_lobby_player_link l JOIN lobby_players lp ON lp.id = l.lobby_player_id WHERE l.match_id = ? ORDER BY n').all(id).map(r => r.n);
    assert.deepStrictEqual(nicks, [a, b].sort());
});
Then('Alice has a lobby rating of {int} in {string}', function (elo, id) {
    const alice = this.players.findOrCreateId('Alice');
    assert.strictEqual(this.db.prepare('SELECT elo FROM lobby_ranking_history WHERE match_id = ? AND lobby_player_id = ?').get(id, alice).elo, elo);
});
Then('{int} replay was skipped', function (count) { assert.strictEqual(this.result.skipped, count); });
Then('progress was reported, never going backwards, ending at {int} of {int} replays', function (done, total) {
    const reading = this.progress.filter(p => p.phase === 'reading').map(p => p.done);
    assert.deepStrictEqual(reading, [...reading].sort((a, b) => a - b));
    const last = this.progress[this.progress.length - 1];
    assert.strictEqual(last.phase, 'writing');
    assert.strictEqual(last.done, done);
    assert.strictEqual(last.total, total);
});
Then('the link tables did not change while the rebuild was reading', function () {
    assert.ok(this.duringReading.length > 0, 'no progress was reported while reading');
    for (const seen of this.duringReading) assert.deepStrictEqual(seen, this.before);
});
Then('{string} no longer has a link to {string}', function (id, nick) {
    const stale = this.players.findOrCreateId(nick);
    assert.strictEqual(this.db.prepare('SELECT COUNT(*) c FROM replay_lobby_player_link WHERE match_id = ? AND lobby_player_id = ?').get(id, stale).c, 0);
});
Then('the links, ranking history and metadata are the same as after the first rebuild', function () {
    const again = { ...lobbyTables(this), metadata: this.db.prepare('SELECT match_id m, metadata FROM replays ORDER BY m').all().map(r => [r.m, metadataOf(this, r.m)]).filter(([, m]) => m) };
    assert.deepStrictEqual(again, this.first);
});
