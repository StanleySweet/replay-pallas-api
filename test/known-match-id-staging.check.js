// SPDX-License-Identifier: MIT
// Proves Engine.GetNewReplays is safe when a known match_id contains SQL punctuation.
//
// Background: GetNewReplays used to splice the known ids into the statement as a literal
// NOT IN list. match_id comes from the matchID in uploaded replay metadata and nothing
// restricts its characters, so a replay whose matchID contains an apostrophe made this
// function throw. update() calls it on the boot path (update_LocalRatings runs on every
// start), so ONE such upload broke every subsequent boot. Fix: stage the ids in a TEMP
// table, which also lifts the SQLite host-parameter ceiling once the cache outgrows one
// batch's worth of bound parameters.
//
// Run: node test/known-match-id-staging.check.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const D = require('better-sqlite3');
const snappy = require('snappy');

const engineSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'types', 'Engine.ts'), 'utf8');

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
const newReplays = engineSource.slice(engineSource.indexOf('GetNewReplays('), engineSource.indexOf('GetReplays('));

check('known ids are no longer interpolated into SQL', () => {
    assert.ok(!/NOT IN \(\$\{/.test(newReplays),
        'a NOT IN list is still built by interpolation');
    assert.ok(!/existingIds\.map\(id => `'\$/.test(newReplays),
        'known ids are still quoted and joined into a string');
});

check('the staging table is created before the statements that touch it', () => {
    const exec = newReplays.indexOf('CREATE TEMP TABLE IF NOT EXISTS known_match_ids');
    const prep = newReplays.indexOf('prepare("DELETE FROM known_match_ids');
    assert.ok(exec !== -1 && prep !== -1, 'staging table or its statements are missing');
    // better-sqlite3 prepares eagerly and rejects a statement whose table is absent, so if the
    // create lands after the prepare the whole function throws on an empty database.
    assert.ok(exec < prep, 'the temp table is prepared before it is created');
});

check('SetDataBase drops the cached statements', () => {
    // The statements are bound to one connection's temp schema.
    assert.ok(/SetDataBase[\s\S]{0,200}stagingStatements = null/.test(engineSource),
        'staging statements survive a database swap');
});

// ------------------------------------------------------------------ behaviour
const { EngineInstance } = require('../dist/types/Engine');

const HOSTILE = "x') OR 1=1 --";
const DROPPER = "y'; DROP TABLE replays; --";

const metadata = (matchID) => snappy.compressSync(JSON.stringify({ matchID, timestamp: 1600000000, settings: { PlayerData: [] } }));

const freshDatabase = (ids) => {
    const db = new D(':memory:');
    db.exec('CREATE TABLE replays (match_id TEXT, metadata BLOB)');
    const insert = db.prepare('INSERT INTO replays (match_id, metadata) VALUES (?, ?)');
    for (const id of ids)
        insert.run(id, metadata(id));
    EngineInstance.SetDataBase(db);
    return db;
};

// GetNewReplays needs a database; guard against a stale connection from an earlier failure.
freshDatabase([HOSTILE, 'b1', 'b2', 'b3', 'b4', 'b5']);

check('a hostile known id no longer throws', () => {
    assert.doesNotThrow(() => EngineInstance.GetNewReplays([HOSTILE], 50, 0));
});

check('a hostile known id is still honoured as known', () => {
    const rows = EngineInstance.GetNewReplays([HOSTILE], 50, 0);
    assert.strictEqual(rows.length, 5, 'expected the 5 benign replays');
    assert.ok(!rows.some((r) => r.directory === HOSTILE), 'the known id was returned as new');
});

check('every id known returns nothing new', () => {
    const known = [HOSTILE, 'b1', 'b2', 'b3', 'b4', 'b5'];
    assert.strictEqual(EngineInstance.GetNewReplays(known, 50, 0).length, 0);
});

check('paging returns each replay exactly once', () => {
    const paged = [];
    for (let offset = 0; ; offset += 2) {
        const page = EngineInstance.GetNewReplays([], 2, offset);
        if (!page.length)
            break;
        paged.push(...page.map((r) => r.directory));
    }
    assert.strictEqual(paged.length, 6, 'paging lost rows');
    assert.strictEqual(new Set(paged).size, 6, 'paging duplicated rows');
});

check('a DROP TABLE attempt neither throws nor drops anything', () => {
    freshDatabase(['b1']);
    const conn = EngineInstance.database;
    conn.prepare('INSERT INTO replays (match_id, metadata) VALUES (?, ?)').run(DROPPER, metadata('d1'));

    assert.doesNotThrow(() => EngineInstance.GetNewReplays(['b1'], 50, 0));
    assert.strictEqual(conn.prepare('SELECT count(*) AS c FROM replays').get().c, 2, 'the replays table was actually dropped');
});

check('the staging table does not leak rows between calls', () => {
    freshDatabase([HOSTILE, 'b1', 'b2', 'b3', 'b4', 'b5']);
    const withB1 = EngineInstance.GetNewReplays(['b1'], 50, 0).length;
    const withNone = EngineInstance.GetNewReplays([], 50, 0).length;
    assert.strictEqual(withB1, 5, 'b1 was wrongly treated as known');
    assert.strictEqual(withNone, 6, 'a previous call leaked into the next one');
});

check('swapping the database does not reuse stale statements', () => {
    freshDatabase(['z1']);
    assert.strictEqual(EngineInstance.GetNewReplays([], 50, 0).length, 1, 'stale statements leaked across connections');
});

console.log(`\n${passed} passed`);
if (!process.exitCode)
    console.log('known-match-id-staging: OK');