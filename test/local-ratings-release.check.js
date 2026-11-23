// SPDX-License-Identifier: MIT
// Local ratings per 0 A.D. release: one set per release next to the set over every replay.
//
// Run from replay-pallas-api/ (options.json is read by relative path):
//   npx tsc -p tsconfig.json && node test/local-ratings-release.check.js
const assert = require('assert');
const path = require('path');
const D = require('better-sqlite3');
const { migrate } = require('../dist/migrate');
const { EngineInstance } = require('../dist/types/Engine');
const { LocalRatingsSettingsManager } = require('../dist/local-ratings/Settings');
const { LocalRatingsCache } = require('../dist/local-ratings/Cache');
const { LocalRatingsMinifier } = require('../dist/local-ratings/Minifier');
const { LocalRatingsReleases } = require('../dist/local-ratings/Releases');
const { LocalRatingsRatingsDB } = require('../dist/local-ratings/RatingsDB');
const { ReplayRepository } = require('../dist/repositories/ReplayRepository');
const { packBlob } = require('../dist/replays/blobCodec');
const options = require('../src/local-ratings/types/options.json');

const db = new D(':memory:');
migrate(db, path.join(__dirname, '..', 'src', 'migrations'));
db.pragma('foreign_keys = ON');
EngineInstance.SetDataBase(db);
new LocalRatingsSettingsManager().createDefaultSettingsIfNotExist();

// One score weight is enough to give players different ratings.
const weightKey = options.find(group => group.label === 'Score Weights').options[0].config;
EngineInstance.ConfigDB_CreateValue('user', weightKey, '1');
const scoreName = weightKey.replace('localratings.weight.', '');

const replays = new ReplayRepository(db);
const store = (id, release) => replays.insert({ matchId: id, metadata: packBlob('{}'), filedata: Buffer.from('f'), creationDate: '2026-01-01 00:00:00', gameRelease: release });
const replay = (id, aliceScore, bobScore) => ({
    isValid: true, directory: id, date: '2026-01-01', players: ['Alice', 'Bob'], civs: ['athen', 'spart'],
    scores: [{ [scoreName]: aliceScore }, { [scoreName]: bobScore }], mods: [], duration: 1800, startingResources: 300,
    populationCap: 300, worldPopulation: false, hasAiPlayers: false, cheatsEnabled: false, revealedMap: false, exploredMap: false,
    nomad: false, teamsSize: { 0: 1, 1: 1 }, mapName: 'm',
});
// Alice does better on release 26, Bob on release 27. r0 is on an unknown release.
const all = { r1: replay('r1', 300, 100), r2: replay('r2', 300, 100), r3: replay('r3', 100, 300), r0: replay('r0', 500, 100) };
store('r1', 26); store('r2', 26); store('r3', 27); store('r0', 0);

const cache = new LocalRatingsCache();
const releases = new LocalRatingsReleases(cache, new LocalRatingsMinifier(), replays, { replayDatabase: all });

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

// A set over every replay, which the release sets must not touch.
cache.save('ratingsDatabase', { Pooled: { rating: 1, matches: 1 } });

check('a set is computed per release, none for the unknown one', () => {
    releases.load();
    assert.deepStrictEqual([...releases.byRelease.keys()].sort(), [26, 27]);
});

check('each set only rates its own replays', () => {
    assert.strictEqual(releases.get(26).ratingsDatabase.Alice.matches, 2);
    assert.strictEqual(releases.get(27).ratingsDatabase.Alice.matches, 1);
    assert.ok(releases.get(26).ratingsDatabase.Alice.rating > releases.get(26).ratingsDatabase.Bob.rating);
    assert.ok(releases.get(27).ratingsDatabase.Alice.rating < releases.get(27).ratingsDatabase.Bob.rating);
});

check('the sets are stored under their release and the set over every replay is untouched', () => {
    assert.deepStrictEqual(db.prepare('SELECT scope, COUNT(*) c FROM local_ratings GROUP BY scope ORDER BY scope').all().map(r => r.scope), [0, 26, 27]);
    assert.deepStrictEqual(Object.keys(cache.load('ratingsDatabase')), ['Pooled']);
    assert.ok('Alice' in cache.load('ratingsDatabase', 26));
});

check('a restart reads the stored sets instead of computing them again', () => {
    const again = new LocalRatingsReleases(cache, new LocalRatingsMinifier(), replays, { replayDatabase: {} });   // would be empty if it recomputed
    again.load();
    assert.strictEqual(again.get(26).ratingsDatabase.Alice.matches, 2);
});

check('a new replay only reaches the set of its release', () => {
    store('r4', 27);
    releases.merge({ r4: replay('r4', 100, 300) });
    assert.strictEqual(releases.get(27).ratingsDatabase.Alice.matches, 2);
    assert.strictEqual(releases.get(26).ratingsDatabase.Alice.matches, 2);
    const reloaded = new LocalRatingsRatingsDB(cache, new LocalRatingsMinifier(), 27);   // what a restart reads back
    reloaded.load();
    assert.strictEqual(reloaded.ratingsDatabase.Alice.matches, 2);
});

check('rebuild drops the release that has no replay left', () => {
    replays.delete('r3'); replays.delete('r4');
    releases.rebuild();
    assert.deepStrictEqual([...releases.byRelease.keys()], [26]);
});

console.log(passed + ' checks passed');
