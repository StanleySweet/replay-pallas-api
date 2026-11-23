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

console.log(passed + ' checks passed');
