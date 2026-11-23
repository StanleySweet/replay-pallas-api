// SPDX-License-Identifier: MIT
// Runs the repositories against the real migrations on an in-memory database.
//
// Run: npx tsc -p tsconfig.json && node test/repositories.check.js
const assert = require('assert');
const path = require('path');
const D = require('better-sqlite3');
const { migrate } = require('../dist/migrate');
const { ReplayRepository } = require('../dist/repositories/ReplayRepository');
const { PlayerRepository } = require('../dist/repositories/PlayerRepository');
const { UserRepository } = require('../dist/repositories/UserRepository');
const { GlickoRepository } = require('../dist/repositories/GlickoRepository');
const { LocalRatingsRepository } = require('../dist/repositories/LocalRatingsRepository');

const db = new D(':memory:');
migrate(db, path.join(__dirname, '..', 'src', 'migrations'));
db.pragma('foreign_keys = ON');
const replays = new ReplayRepository(db), players = new PlayerRepository(db), users = new UserRepository(db);
const glicko = new GlickoRepository(db), local = new LocalRatingsRepository(db);

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };
const row = id => ({ matchId: id, metadata: Buffer.from('m' + id), filedata: Buffer.from('f' + id), creationDate: '2026-01-01 00:00:00', gameRelease: 28 });

check('replays: insert, read back, count', () => {
    replays.insert(row('A')); replays.insert(row('B'));
    assert.strictEqual(replays.count(), 2);
    assert.strictEqual(replays.getFiles('A').filedata.toString(), 'fA');
    assert.strictEqual(replays.getDetails('B').metadata.toString(), 'mB');
    assert.strictEqual(replays.getFiles('nope'), undefined);
});

check('replays: a duplicate match id is refused by the database', () => {
    assert.throws(() => replays.insert(row('A')));
});

check('replays: existingMatchIds answers only for the ids asked, across chunks', () => {
    const ids = Array.from({ length: 1200 }, (_, i) => 'X' + i).concat(['A']);
    assert.deepStrictEqual([...replays.existingMatchIds(ids)], ['A']);
    assert.deepStrictEqual([...replays.existingMatchIds([])], []);
});

check('replays: update metadata and filedata', () => {
    replays.updateMetadata('A', Buffer.from('new'), '2026-02-02 00:00:00');
    replays.updateFiledata('A', Buffer.from('newf'));
    assert.strictEqual(replays.getDetails('A').metadata.toString(), 'new');
    assert.strictEqual(replays.getFiles('A').filedata.toString(), 'newf');
});

check('players: findOrCreateId is stable and does not duplicate', () => {
    const a = players.findOrCreateId('Alice');
    assert.strictEqual(players.findOrCreateId('Alice'), a);
    assert.notStrictEqual(players.findOrCreateId('Bob'), a);
    assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM lobby_players WHERE nick='Alice'").get().c, 1);
});

check('replays: lobby links are idempotent and ranking rows cascade on delete', () => {
    const alice = players.findOrCreateId('Alice');
    replays.linkLobbyPlayer('A', alice); replays.linkLobbyPlayer('A', alice);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM replay_lobby_player_link').get().c, 1);
    replays.addRankingHistory([{ match_id: 'A', lobby_player_id: alice, elo: 1200, date: '2026-01-01' }]);
    assert.deepStrictEqual(players.rankingHistory(alice), [{ elo: 1200, date: '2026-01-01' }]);
    assert.deepStrictEqual(local.nicksInReplay('A'), [{ nick: 'Alice' }]);
    replays.delete('A');
    assert.strictEqual(replays.getFiles('A'), undefined);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM replay_lobby_player_link').get().c, 0);
    assert.strictEqual(players.rankingHistory(alice).length, 0);
});

check('users: create, taken nick ignores case, oldest account wins', () => {
    users.create('Sana', 'h1', 'a@x', 1);
    assert.ok(users.isNickTaken('SANA'));
    assert.ok(!users.isNickTaken('Other'));
    users.create('Sana', 'h2', 'b@x', 3);
    const oldest = users.findOldestByNick('Sana');
    assert.strictEqual(oldest.role, 1);
    assert.strictEqual(users.findByCredentials('b@x', 'h2')[0].role, 3);
    assert.strictEqual(users.findByCredentials('b@x', 'wrong').length, 0);
});

check('users: uploader link, ownership and delete with links', () => {
    replays.linkUploader(oldestId(), 'B');
    replays.linkUploader(oldestId(), 'B');
    assert.ok(replays.isUploadedBy('B', oldestId()));
    assert.ok(!replays.isUploadedBy('B', 999));
    const [links, user] = users.deleteWithLinks(oldestId());
    assert.strictEqual(links.changes, 1);
    assert.strictEqual(user.changes, 1);
});
function oldestId() { return db.prepare("SELECT MIN(id) id FROM users WHERE nick='Sana'").get().id; }

check('users: statistics cache inserts once, then updates', () => {
    const p = players.findOrCreateId('Carol');
    const stats = (cpm) => ({ total_played_time: 1, match_count: 2, second_most_used_cmd: 'a', most_used_cmd: 'b', win_rate_ratio: 0.5, average_cpm: cpm, lobby_player_id: p, modification_date: '2999-01-01 00:00:00' });
    users.saveStatistics(stats(10)); users.saveStatistics(stats(20));
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM user_statistics_cache').get().c, 1);
    assert.strictEqual(users.freshStatistics(p).average_cpm, 20);
    assert.strictEqual(users.freshStatistics(p + 100), undefined);
});

check('glicko: save inserts then updates the same player and match count', () => {
    const p = players.findOrCreateId('Dave');
    const r = (elo) => ({ elo, deviation: 1, volatility: 0.06, lobby_player_id: p, preview_deviation: 1, match_count: 1, date: '2026-01-01' });
    glicko.save(r(1500)); glicko.save(r(1600));
    assert.strictEqual(glicko.all().length, 1);
    assert.strictEqual(glicko.all()[0].elo, 1600);
    assert.strictEqual(local.latestGlicko('Dave').elo, 1600);
    assert.ok(glicko.hasAny());
    glicko.clear();
    assert.ok(!glicko.hasAny());
});

check('local ratings: a hostile nick is bound, not executed', () => {
    players.findOrCreateId("x') OR 1=1 --");
    assert.strictEqual(local.playersByNicks(["x') OR 1=1 --"]).length, 1);
    assert.strictEqual(local.playersByNicks(["nobody"]).length, 0);
});

console.log(passed + ' checks passed');
