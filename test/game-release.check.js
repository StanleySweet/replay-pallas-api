// SPDX-License-Identifier: MIT
// Checks the 0 A.D. release is read from the metadata, stored, backfilled and filterable.
//
// Run: npx tsc -p tsconfig.json && node test/game-release.check.js
const assert = require('assert');
const path = require('path');
const D = require('better-sqlite3');
const { migrate } = require('../dist/migrate');
const { gameRelease, releaseOf, backfillGameRelease } = require('../dist/replays/gameRelease');
const { ReplayRepository } = require('../dist/repositories/ReplayRepository');
const { PlayerRepository } = require('../dist/repositories/PlayerRepository');
const { packBlob } = require('../dist/replays/blobCodec');

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

check('both numbering schemes give the same release', () => {
    assert.strictEqual(releaseOf('0.0.26'), 26);
    assert.strictEqual(releaseOf('0.26'), 26);
    assert.strictEqual(releaseOf('0.27.1'), 27);
    assert.strictEqual(releaseOf('0.28.0'), 28);
    assert.strictEqual(releaseOf('0.0.23'), 23);
});

check('garbage or an unknown numbering gives no release', () => {
    assert.strictEqual(releaseOf(''), null);
    assert.strictEqual(releaseOf('alpha'), null);
    assert.strictEqual(releaseOf('1.0.0'), null);
    assert.strictEqual(releaseOf('0.0.0'), null);
});

check('the 0ad mod wins, engine_version is the fallback, neither gives null', () => {
    const mods = [{ name: 'feldmap', version: '3.0.1' }, { name: '0ad', version: '0.28.0' }];
    assert.strictEqual(gameRelease({ mods, engine_version: '0.27.0' }), 28);
    assert.strictEqual(gameRelease({ mods: [], engine_version: '0.0.26' }), 26);
    assert.strictEqual(gameRelease({ mods: 'nonsense' }), null);
    assert.strictEqual(gameRelease({}), null);
});

const db = new D(':memory:');
migrate(db, path.join(__dirname, '..', 'src', 'migrations'));
const replays = new ReplayRepository(db);
const row = (id, metadata, release) => ({ matchId: id, metadata: packBlob(JSON.stringify(metadata)), filedata: Buffer.from('f'), creationDate: '2026-01-01 00:00:00', gameRelease: release });

check('rows stored without a release are found and filled by the backfill', () => {
    replays.insert(row('A', { mods: [{ name: '0ad', version: '0.27.0' }] }, 27));
    replays.insert(row('B', { mods: [{ name: '0ad', version: '0.0.26' }] }, 26));
    replays.insert(row('C', { nothing: true }, 0));
    db.prepare('UPDATE replays SET game_release = NULL').run();           // what existing rows look like after the migration
    assert.strictEqual(replays.withoutRelease().length, 3);
    assert.strictEqual(backfillGameRelease(replays), 3);
    assert.strictEqual(backfillGameRelease(replays), 0, 'a second run has nothing left to do');
    assert.deepStrictEqual(db.prepare('SELECT match_id, game_release FROM replays ORDER BY match_id').all().map(r => r.game_release), [27, 26, 0]);
});

check('matchIdsForRelease keeps one release only', () => {
    assert.deepStrictEqual([...replays.matchIdsForRelease(26)], ['B']);
    assert.deepStrictEqual([...replays.matchIdsForRelease(99)], []);
});


check('the release list counts replays per release, newest first, with the unknown one (0) last', () => {
    assert.deepStrictEqual(replays.releases(), [{ release: 27, replays: 1 }, { release: 26, replays: 1 }, { release: 0, replays: 1 }]);
});

check('the cached release list follows inserts, deletes and a release being set', () => {
    const before = replays.releases();
    assert.strictEqual(replays.releases(), before, 'a second call is served from the cache');
    replays.insert(row('D', { mods: [{ name: '0ad', version: '0.28.0' }] }, 28));
    assert.deepStrictEqual(replays.releases().map(r => r.release), [28, 27, 26, 0]);
    replays.setGameRelease('D', 27);
    assert.deepStrictEqual(replays.releases(), [{ release: 27, replays: 2 }, { release: 26, replays: 1 }, { release: 0, replays: 1 }]);
    replays.delete('D');
    assert.deepStrictEqual(replays.releases(), [{ release: 27, replays: 1 }, { release: 26, replays: 1 }, { release: 0, replays: 1 }]);
});

check('the metadata lists can be limited to one release', () => {
    assert.strictEqual(replays.allMetadataNewestFirst(null).length, 3);
    assert.deepStrictEqual(replays.allMetadataNewestFirst(26).map(r => r.match_id), ['B']);
    assert.deepStrictEqual(replays.latestMetadata(27).map(r => r.match_id), ['A']);
    db.prepare("INSERT INTO users (nick, password, email, role) VALUES ('u', 'h', 'u@x', 1)").run();
    replays.linkUploader(1, 'A'); replays.linkUploader(1, 'B');
    assert.deepStrictEqual(replays.metadataUploadedBy(1, 26).map(r => r.match_id), ['B']);
    assert.strictEqual(replays.metadataUploadedBy(1, null).length, 2);
});

check('a player page can be limited to one release', () => {
    const players = new PlayerRepository(db);
    const id = players.findOrCreateId('Alice');
    replays.linkLobbyPlayer('A', id); replays.linkLobbyPlayer('B', id);
    assert.strictEqual(players.replaysPage(id, false, 0).length, 2);
    assert.deepStrictEqual(players.replaysPage(id, false, 0, 26).map(r => r.match_id), ['B']);
    assert.strictEqual(players.replaysPage(id, false, 0, 99).length, 0);
});

console.log(passed + ' checks passed');
