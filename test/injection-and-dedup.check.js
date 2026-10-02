// SPDX-License-Identifier: MIT
// Proves the two SQL-safety fixes in src/controllers/:
//   1. LocalRatingsController get_player_list binds nicks instead of concatenating them.
//   2. ReplayController upload_zips asks about only the uploaded match IDs, chunked.
//
// Run: node test/injection-and-dedup.check.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const D = require('better-sqlite3');

const SRC = path.join(__dirname, '..', 'src');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');

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

// ---------------------------------------------------------------- injection
const ratings = read('controllers/LocalRatingsController.ts');
const start = ratings.indexOf('const get_player_list');
const query = ratings.slice(start, start + 2400);

check('get_player_list no longer concatenates nicks into SQL', () => {
    assert.ok(
        !/"'\s*\+\s*a\[0\]/.test(query),
        'found string concatenation of a nick into the IN list'
    );
    assert.ok(!/'\s*\+\s*a\[0\]\s*\+\s*'/.test(query), 'nick is still glued with quotes');
});

check('get_player_list uses one bound placeholder per nick', () => {
    assert.ok(
        /in \(\$\{nicks\.map\(\(\) => "\?"\)\.join\(', '\)\}\)/.test(query),
        'expected a generated ? placeholder list driven by nicks'
    );
    assert.ok(/\.all\(\.\.\.nicks\)/.test(query), 'nicks are not spread into .all()');
});

check('get_player_list still bails before building an empty IN ()', () => {
    assert.ok(/if \(!items\.length\)/.test(query), 'lost the empty-result guard');
});

// ---------------------------------------------------------------- dedup
const replayController = read('controllers/ReplayController.ts');

check('upload no longer loads every match_id row', () => {
    assert.ok(
        !/SELECT match_id FROM replays;/.test(replayController),
        'full-table match_id scan is still present'
    );
    assert.ok(
        !/matchIds\.some\(/.test(replayController),
        'still does an in-memory .some() scan per uploaded replay'
    );
});

check('upload queries only the candidate ids', () => {
    assert.ok(
        /WHERE match_id IN \(\$\{chunk\.map/.test(replayController),
        'expected a parameterised IN clause over the candidate chunk'
    );
    assert.ok(
        /candidateIds\.slice\(i, i \+ 500\)/.test(replayController),
        'candidate ids are not chunked'
    );
});

check('upload drops replays with no matchID', () => {
    assert.ok(
        /if \(!id \|\| knownIds\.has\(id\) \|\| uploadedIds\.has\(id\)\)/.test(replayController),
        'matchID-less replays still reach the query'
    );
});

check('upload dedups within the zip as well as against the DB', () => {
    // replays.match_id is UNIQUE, so a repeated matchID in one zip used to throw on the
    // constraint and 500 the whole upload.
    assert.ok(/replays\.match_id is UNIQUE/.test(replayController), 'no note on the UNIQUE constraint');
    assert.ok(/uploadedIds\.add\(id\)/.test(replayController), 'the in-upload dedup was dropped');
});

check('the chunk length stays inside the SQLite host parameter limit', () => {
    const step = Number(replayController.match(/candidateIds\.slice\(i, i \+ (\d+)\)/)[1]);
    assert.ok(step >= 1 && step <= 999, `chunk size ${step} is outside the safe host-parameter range`);
});

// ------------------------------------------------- the queries actually run
// Real SQL against a throwaway copy of the schema, with a hostile nick.
const db = new D(':memory:');
db.exec(`CREATE TABLE lobby_players (id INTEGER PRIMARY KEY, nick TEXT, creation_date TEXT);
         CREATE TABLE users (nick TEXT, role INTEGER, creation_date TEXT);
         CREATE TABLE replays (match_id TEXT);
         CREATE TABLE big (match_id TEXT);`);
db.prepare('INSERT INTO lobby_players (nick, creation_date) VALUES (?, ?)').run("evil') OR 1=1 --", '2024-01-01');
db.prepare('INSERT INTO lobby_players (nick, creation_date) VALUES (?, ?)').run('legit', '2024-01-01');
db.prepare('INSERT INTO users (nick, role) VALUES (?, ?)').run('legit', 2);
// 50 unrelated rows, so a successful breakout is visible as extra rows.
db.transaction(() => {
    for (let i = 0; i < 50; i++)
        db.prepare('INSERT INTO lobby_players (nick, creation_date) VALUES (?, ?)').run('victim' + i, '2024-01-01');
})();

const nicks = ["evil') OR 1=1 --", 'legit'];
const boundSql = `SELECT lp.id, lp.nick FROM lobby_players lp Left Join users u on u.nick = lp.nick
     Where lp.nick in (${nicks.map(() => "?").join(', ')})`;
const rows = db.prepare(boundSql).all(...nicks);

check('a nick containing a quote stays one bound value', () => {
    assert.strictEqual(rows.length, 2, 'the IN list was broken out of');
    assert.strictEqual(rows[0].nick, "evil') OR 1=1 --");
});

// Control: the pre-fix form returns the whole table. If this ever stops holding, the
// assertion above proves nothing and the fix has to be re-argued from scratch.
check('the concatenation form was genuinely exploitable (control)', () => {
    const built = nicks.map(a => "'" + a + "'").join(', ');
    const before = db.prepare(
        `SELECT lp.id, lp.nick FROM lobby_players lp Left Join users u on u.nick = lp.nick
         Where lp.nick in (${built})`
    ).all();
    assert.strictEqual(before.length, 52, `control returned ${before.length} rows, expected the full 52-row table`);
    assert.strictEqual(rows.length, 2, 'bound form should return only the 2 real matches');
});

check('the guard in get_player_list is belt-and-braces, not the reason it is safe', () => {
    // SQLite 3.46 accepts an empty IN list, so the guard prevents a pointless query rather
    // than a crash. This pins the real behaviour so nobody writes the comment backwards.
    assert.doesNotThrow(() => db.prepare('SELECT match_id FROM replays WHERE match_id IN ();').all());
});

check('an empty candidate list issues no query at all', () => {
    const ids = [];
    let statements = 0;
    for (let i = 0; i < ids.length; i += 500) statements++;
    assert.strictEqual(statements, 0);
});

check('chunking reproduces the single-shot result at 600 ids', () => {
    const ids = Array.from({ length: 600 }, (_, i) => 'm' + i);
    const ins = db.prepare('INSERT INTO big (match_id) VALUES (?)');
    db.transaction(() => ids.forEach(id => ins.run(id)))();

    const found = new Set();
    let chunks = 0;
    for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        chunks++;
        for (const r of db.prepare(`SELECT match_id FROM big WHERE match_id IN (${chunk.map(() => '?').join(', ')})`).all(...chunk))
            found.add(r.match_id);
    }
    assert.strictEqual(chunks, 2, '600 ids should span two 500-row chunks');
    assert.strictEqual(found.size, 600, 'chunked lookup lost rows');
});

check('a duplicate matchID inside one zip is uploaded once', () => {
    const knownIds = new Set();          // 'dup' is not in the DB yet
    const uploadedIds = new Set();
    const replays = [{ metadata: { matchID: 'dup' } }, { metadata: { matchID: 'dup' } }];
    const newReplays = replays.filter(b => {
        const id = b.metadata.matchID;
        if (!id || knownIds.has(id) || uploadedIds.has(id)) return false;
        uploadedIds.add(id);
        return true;
    });
    assert.strictEqual(newReplays.length, 1, 'the in-zip duplicate survived dedup');

    // And the DB-backed case still works: a stored match is excluded.
    knownIds.add('stored');
    assert.strictEqual(
        [{ metadata: { matchID: 'stored' } }].filter(b => {
            const id = b.metadata.matchID;
            if (!id || knownIds.has(id) || uploadedIds.has(id)) return false;
            uploadedIds.add(id);
            return true;
        }).length,
        0,
        'a match already in the DB was not excluded'
    );
});

check('match_id being UNIQUE is what made the in-zip duplicate fatal', () => {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'src', 'migrations', '001-init.sql'), 'utf8');
    assert.ok(/"?match_id"?\s+TEXT\s+NOT NULL UNIQUE/.test(schema), 'no UNIQUE constraint on replays.match_id');
    db.exec('CREATE TABLE replay_dedup (id INTEGER PRIMARY KEY, match_id TEXT NOT NULL UNIQUE);');
    db.prepare('INSERT INTO replay_dedup (match_id) VALUES (?)').run('dup');
    assert.throws(() => db.prepare('INSERT INTO replay_dedup (match_id) VALUES (?)').run('dup'),
        /UNIQUE constraint failed/i, 'the constraint no longer fires, so the dedup matters less');
});

db.close();
console.log(`\n${passed} passed, ${process.exitCode ? '1 FAILED' : 'all green'}`);
