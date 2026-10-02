// SPDX-License-Identifier: MIT
// Proves the local-ratings cache version is tracked in SQLite, and that every path which
// should trigger a rebuild does, and every path which should not, does not.
//
// Background: the version used to live only in dist/cache/cacheVersion.json, and nothing
// wrote that file -- Cache.updateVersion() was deleted in f122d0d. A code version of 7
// therefore sat permanently against a stored 6 and every boot paid a full rebuild of all
// 491 replays, measured at 53s here, with the port already accepting connections that the
// blocked event loop could not answer. The version now lives in local_ratings_configuration,
// which migrations/004 already created and Engine.ConfigDB_* already speak to.
//
// Run: node test/cache-version-in-db.check.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const D = require('better-sqlite3');

const SRC = path.join(__dirname, '..', 'src');
const cacheSource = fs.readFileSync(path.join(SRC, 'local-ratings', 'Cache.ts'), 'utf8');
const utilitySource = fs.readFileSync(path.join(SRC, 'local-ratings', 'utilities', 'functions_utility.ts'), 'utf8');
const indexSource = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8');

let passed = 0;
const check = (name, fn) => {
    try {
        fn();
        passed++;
        console.log('  ok  ' + name);
    } catch (e) {
        console.log('FAIL  ' + name + '\n      ' + e.message);
        process.exitCode = 1;
    }
};

// ------------------------------------------------------------------ source shape
check('the version is read from SQLite, not from the sidecar', () => {
    const body = cacheSource.slice(cacheSource.indexOf('isUpdateRequired('), cacheSource.indexOf('markAsCurrent('));
    assert.ok(/ConfigDB_GetValue\(VERSION_SECTION, VERSION_KEY\)/.test(body),
        'isUpdateRequired does not read the database');
    assert.ok(!/ReadJSONFile\(this\.cacheVersionFile\)/.test(body),
        'isUpdateRequired still trusts the sidecar file');
});

check('an unwired database forces a rebuild', () => {
    const body = cacheSource.slice(cacheSource.indexOf('isUpdateRequired('), cacheSource.indexOf('markAsCurrent('));
    assert.ok(/if \(Engine\.database === null\)\s*\n\s*return true;/.test(body),
        'an absent database is not treated as stale');
});

check('the version is recorded only after both rebuilds return', () => {
    const block = utilitySource.slice(utilitySource.indexOf('if (replayDB.cache.isUpdateRequired())'), utilitySource.indexOf('else'));
    const iRebuild = block.indexOf('replayDB.rebuild()');
    const iRatings = block.indexOf('ratingsDB.rebuild()');
    const iMark = block.indexOf('markAsCurrent()');
    assert.ok(iRebuild !== -1 && iRatings !== -1 && iMark !== -1, 'rebuild or record step missing');
    assert.ok(iRebuild < iMark && iRatings < iMark,
        'markAsCurrent runs before a rebuild has persisted its file');
});

check('the sidecar is still written for the previous build during rollout', () => {
    const body = cacheSource.slice(cacheSource.indexOf('markAsCurrent('));
    assert.ok(/WriteJSONFile\(this\.cacheVersionFile/.test(body),
        'a container on the previous build would rebuild again on every boot');
});

check('the port is opened after init_LocalRatings, not before', () => {
    const iListen = indexSource.indexOf('await server.listen(');
    const iInit = indexSource.indexOf('init_LocalRatings()');
    assert.ok(iListen !== -1 && iInit !== -1, 'listen or init call missing');
    assert.ok(iInit < iListen, 'the port still opens before the databases are ready');
    assert.ok(!/server\.listen\(\{[^}]*\}, async/.test(indexSource),
        'the listen callback still wraps the initialisation');
});

// ------------------------------------------------------------------ behaviour
// Cache.ts resolves dist/cache relatively, so behaviour is exercised against a scratch
// directory rather than the real caches.
const SCRATCH = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pallas-cachever-'));
process.chdir(SCRATCH);
fs.mkdirSync('dist/cache', { recursive: true });

const { EngineInstance } = require(path.join(SRC, '..', 'dist', 'types', 'Engine'));
const { LocalRatingsCache } = require(path.join(SRC, '..', 'dist', 'local-ratings', 'Cache'));

const SECTION = 'localratings';
const KEY = 'cacheversion';

const freshDb = () => {
    const db = new D(':memory:');
    db.exec(`CREATE TABLE local_ratings_configuration(
        id integer NOT NULL PRIMARY KEY, section text NOT NULL, key text NOT NULL,
        value text NOT NULL, modification_date timestamp, creation_date timestamp);`);
    EngineInstance.SetDataBase(db);
    return db;
};

const readRow = (db) => {
    const r = db.prepare('SELECT value FROM local_ratings_configuration WHERE section = ? AND key = ?').get(SECTION, KEY);
    return r ? r.value : null;
};

const cache = new LocalRatingsCache();
fs.writeFileSync(cache.cacheVersionFile, JSON.stringify({ version: 6 }));

check('a database with no version row reports a rebuild', () => {
    const db = freshDb();
    assert.strictEqual(readRow(db), null, 'precondition');
    assert.strictEqual(cache.isUpdateRequired(), true);
});

check('a matching version row reports no rebuild', () => {
    const db = freshDb();
    db.prepare('INSERT INTO local_ratings_configuration (section, key, value) VALUES (?,?,?)').run(SECTION, KEY, `${cache.version}`);
    assert.strictEqual(cache.isUpdateRequired(), false);
});

check('a version bumped in code reports a rebuild', () => {
    freshDb();
    assert.strictEqual(cache.isUpdateRequired(), true);
});

check('an older recorded version reports a rebuild', () => {
    const db = freshDb();
    db.prepare('INSERT INTO local_ratings_configuration (section, key, value) VALUES (?,?,?)').run(SECTION, KEY, '6');
    assert.strictEqual(cache.isUpdateRequired(), true);
});

check('an unparseable recorded version reports a rebuild rather than throwing', () => {
    const db = freshDb();
    db.prepare('INSERT INTO local_ratings_configuration (section, key, value) VALUES (?,?,?)').run(SECTION, KEY, 'not-a-number');
    assert.strictEqual(cache.isUpdateRequired(), true);
});

check('markAsCurrent records the version and refreshes the sidecar', () => {
    const db = freshDb();
    fs.writeFileSync(cache.cacheVersionFile, JSON.stringify({ version: 6 }));
    cache.markAsCurrent();
    assert.strictEqual(readRow(db), `${cache.version}`, 'row not written');
    assert.strictEqual(JSON.parse(fs.readFileSync(cache.cacheVersionFile, 'utf8')).version, cache.version, 'sidecar not refreshed');
    assert.strictEqual(cache.isUpdateRequired(), false, 'still stale after recording');
});

check('markAsCurrent is idempotent', () => {
    const db = freshDb();
    cache.markAsCurrent();
    cache.markAsCurrent();
    const rows = db.prepare('SELECT count(*) AS c FROM local_ratings_configuration WHERE section = ? AND key = ?').get(SECTION, KEY).c;
    assert.strictEqual(rows, 1, `expected one row, found ${rows}`);
    assert.strictEqual(cache.isUpdateRequired(), false);
});

check('markAsCurrent still refreshes the sidecar with no database wired', () => {
    EngineInstance.SetDataBase(null);
    fs.writeFileSync(cache.cacheVersionFile, JSON.stringify({ version: 6 }));
    assert.doesNotThrow(() => cache.markAsCurrent());
    assert.strictEqual(JSON.parse(fs.readFileSync(cache.cacheVersionFile, 'utf8')).version, cache.version);
    assert.strictEqual(cache.isUpdateRequired(), true, 'must still rebuild without a database');
});

fs.rmSync(SCRATCH, { recursive: true, force: true });

console.log(`\n${passed} passed`);
if (!process.exitCode)
    console.log('cache-version-in-db: OK');