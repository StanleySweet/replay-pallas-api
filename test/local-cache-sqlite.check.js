// SPDX-License-Identifier: MIT
// Proves the local-ratings caches live in SQLite (migrations/013): round trips, partial
// updates, the one-time import of the old JSON files, and the cascade from `replays`.
//
// Needs a build first. Run: node test/local-cache-sqlite.check.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const D = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'pallas-localcache-'));
process.chdir(SCRATCH);
fs.mkdirSync('dist/cache', { recursive: true });

const { EngineInstance } = require(path.join(ROOT, 'dist', 'types', 'Engine'));
const { LocalRatingsCache } = require(path.join(ROOT, 'dist', 'local-ratings', 'Cache'));

// The Up section of the real migration, so the test cannot drift from the schema.
const migration = fs.readFileSync(path.join(ROOT, 'src', 'migrations', '013-local-cache-tables.sql'), 'utf8');
const up = migration.slice(migration.indexOf('-- Up'), migration.indexOf('-- Down'));

const freshDb = () => {
    const db = new D(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE replays (id integer PRIMARY KEY, match_id text NOT NULL UNIQUE);');
    db.exec(up);
    db.exec("INSERT INTO replays (match_id) VALUES ('AAAA'), ('BBBB');");
    EngineInstance.SetDataBase(db);
    return db;
};

let passed = 0;
const check = (name, fn) => {
    try { fn(); passed++; console.log('  ok  ' + name); }
    catch (e) { console.log('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
};

const cache = new LocalRatingsCache();
const samples = {
    replayDatabase: { AAAA: [1, 'x', [2, 3]], BBBB: [4, 'y', []] },
    ratingsDatabase: { '90': [1500, 3], zed: [1400, 1] },
    historyDatabase: { '90': { '2026-01-01_0001': [1500, 2] }, zed: {} },
    aliasesDatabase: { primary: ['other', 'another'] },
};

for (const [tag, value] of Object.entries(samples)) {
    check(`${tag}: save then load returns the same object`, () => {
        freshDb();
        cache.save(tag, value);
        assert.deepStrictEqual(cache.load(tag), value);
    });
}

check('save replaces the previous content', () => {
    freshDb();
    cache.save('ratingsDatabase', samples.ratingsDatabase);
    cache.save('ratingsDatabase', { only: [1, 1] });
    assert.deepStrictEqual(cache.load('ratingsDatabase'), { only: [1, 1] });
});

check('merge adds and overwrites without dropping the others', () => {
    freshDb();
    cache.save('replayDatabase', { AAAA: [1] });
    cache.merge('replayDatabase', { AAAA: [9], BBBB: [2] });
    assert.deepStrictEqual(cache.load('replayDatabase'), { AAAA: [9], BBBB: [2] });
});

check('merge keeps the position of an overwritten key', () => {
    freshDb();
    cache.save('aliasesDatabase', { b: [], a: [] });
    cache.merge('aliasesDatabase', { b: ['x'] });
    assert.deepStrictEqual(Object.keys(cache.load('aliasesDatabase')), ['b', 'a']);
});

check('deleting a replay removes its cache row', () => {
    const db = freshDb();
    cache.save('replayDatabase', samples.replayDatabase);
    db.prepare("DELETE FROM replays WHERE match_id = 'AAAA'").run();
    assert.deepStrictEqual(Object.keys(cache.load('replayDatabase')), ['BBBB']);
});

check('an unknown tag loads empty and saves nothing', () => {
    freshDb();
    assert.deepStrictEqual(cache.load('nope'), {});
    assert.doesNotThrow(() => cache.save('nope', { a: 1 }));
});

check('with no database wired, load is empty and save is a no-op', () => {
    EngineInstance.SetDataBase(null);
    assert.deepStrictEqual(cache.load('replayDatabase'), {});
    assert.doesNotThrow(() => cache.save('replayDatabase', samples.replayDatabase));
});

check('the old JSON files are imported once, skipping replays that no longer exist', () => {
    freshDb();
    fs.writeFileSync('dist/cache/replayDatabase.json', JSON.stringify({ AAAA: [1], GONE: [2] }));
    fs.writeFileSync('dist/cache/aliasesDatabase.json', JSON.stringify(samples.aliasesDatabase));
    assert.deepStrictEqual(cache.load('replayDatabase'), { AAAA: [1] });
    assert.deepStrictEqual(cache.load('aliasesDatabase'), samples.aliasesDatabase);
    assert.ok(!fs.existsSync('dist/cache/replayDatabase.json'), 'file not retired');
    assert.ok(fs.existsSync('dist/cache/replayDatabase.json.migrated'), 'file not kept as .migrated');
    // A second load must not re-import a file that has been retired.
    assert.deepStrictEqual(cache.load('replayDatabase'), { AAAA: [1] });
});

check('a save retires a leftover JSON file so it can never be imported stale', () => {
    freshDb();
    fs.writeFileSync('dist/cache/ratingsDatabase.json', JSON.stringify({ stale: [1, 1] }));
    cache.save('ratingsDatabase', {});
    assert.deepStrictEqual(cache.load('ratingsDatabase'), {});
    assert.ok(!fs.existsSync('dist/cache/ratingsDatabase.json'));
});

fs.rmSync(SCRATCH, { recursive: true, force: true });
console.log(`\n${passed} passed`);
if (!process.exitCode)
    console.log('local-cache-sqlite: OK');
