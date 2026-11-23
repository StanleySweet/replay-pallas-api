// SPDX-License-Identifier: MIT
// Glicko is rated once over every replay and once per 0 A.D. release, and the readers keep the sets apart.
//
// Run: npx tsc -p tsconfig.json && node test/glicko-release.check.js
const assert = require('assert');
const path = require('path');
const D = require('better-sqlite3');
const { migrate } = require('../dist/migrate');
const { Glicko2Manager } = require('../dist/instant-glicko-2/Glicko2Manager');
const { ReplayRepository } = require('../dist/repositories/ReplayRepository');
const { PlayerRepository } = require('../dist/repositories/PlayerRepository');
const { LocalRatingsRepository } = require('../dist/repositories/LocalRatingsRepository');
const { packBlob } = require('../dist/replays/blobCodec');

const db = new D(':memory:');
migrate(db, path.join(__dirname, '..', 'src', 'migrations'));
db.pragma('foreign_keys = ON');
const replays = new ReplayRepository(db), players = new PlayerRepository(db), local = new LocalRatingsRepository(db);
const a = players.findOrCreateId('Alice'), b = players.findOrCreateId('Bob');

// Alice wins twice on 26, Bob wins once on 27.
const play = (id, date, release, winner) => {
    const seat = (name, lobby, team) => ({ Name: name, NameWithoutRating: name, LobbyUserId: lobby, Team: team, State: name === winner ? 'won' : 'defeated' });
    replays.insert({ matchId: id, metadata: packBlob(JSON.stringify({ matchID: id, settings: { PlayerData: [seat('Alice', a, 0), seat('Bob', b, 1)] } })), filedata: Buffer.from('f'), creationDate: date, gameRelease: release });
    replays.linkLobbyPlayer(id, a); replays.linkLobbyPlayer(id, b);
};
play('r1', '2026-01-01 10:00:00', 26, 'Alice');
play('r2', '2026-01-02 10:00:00', 26, 'Alice');
play('r3', '2026-01-03 10:00:00', 27, 'Bob');
new Glicko2Manager(db).rebuild();

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };
const last = rows => rows.reduce((x, y) => y.match_count >= x.match_count ? y : x);

check('three sets exist: all replays, release 26, release 27', () => {
    const sets = db.prepare('SELECT game_release r, COUNT(*) c FROM glicko2_rankings GROUP BY game_release ORDER BY game_release').all();
    assert.deepStrictEqual(sets.map(s => s.r), [null, 26, 27]);
});

check('each set only counts its own replays', () => {
    assert.strictEqual(last(players.glickoHistory(a, null)).match_count, 3);
    assert.strictEqual(last(players.glickoHistory(a, 26)).match_count, 2);
    assert.strictEqual(last(players.glickoHistory(a, 27)).match_count, 1);
});

check('the same player is rated differently on different releases', () => {
    assert.ok(last(players.glickoHistory(a, 26)).elo > last(players.glickoHistory(a, 27)).elo, 'Alice won on 26 and lost on 27');
});

check('the profile reads the matching set, and the default is every replay', () => {
    assert.strictEqual(local.latestGlicko('Alice').match_count, 3);
    assert.strictEqual(local.latestGlicko('Alice', 26).match_count, 2);
    assert.strictEqual(local.latestGlicko('Alice', 99), undefined);
});

check('a second rebuild gives the same rows, nothing doubled', () => {
    const before = db.prepare('SELECT COUNT(*) c FROM glicko2_rankings').get().c;
    new Glicko2Manager(db).rebuild();
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM glicko2_rankings').get().c, before);
});

console.log(passed + ' checks passed');
