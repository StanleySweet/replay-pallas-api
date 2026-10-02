// SPDX-License-Identifier: MIT
// Proves create_user refuses a nick that is already registered, whatever the casing, and
// that the ambiguous lobby-nick -> user lookup is pinned to a deterministic row.
//
// Background: POST /users is unauthenticated and users.nick has no UNIQUE constraint
// (migration 002, unlike lobby_players.nick in 003 which does). Duplicate registrations
// therefore existed until now: the local DB holds 3 rows for 'sanafur' and 2 for 'SaidRdz'.
// There are NO case-fold collisions in lobby_players (355 rows) or in the ratings cache
// (328 keys), so the split-nick premise did not hold; the reachable hole was duplicate
// registration of the same string.
//
// Run: node test/nick-identity.check.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const D = require('better-sqlite3');

const SRC = path.join(__dirname, '..', 'src');
const controller = fs.readFileSync(path.join(SRC, 'controllers', 'UserController.ts'), 'utf8');
const init = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8');
const migrations = path.join(SRC, 'migrations');

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

// ------------------------------------------------------------------ the guard exists
const createUser = controller.slice(controller.indexOf('const create_user'), controller.indexOf('const UserController'));

check('create_user refuses a nick that is already taken', () => {
    assert.ok(/SELECT id FROM users WHERE nick = @nick COLLATE NOCASE LIMIT 1/.test(createUser),
        'no case-insensitive taken-nick lookup');
    assert.ok(/if \(taken\)/.test(createUser), 'the lookup result is ignored');
    assert.ok(/reply\.code\(400\)/.test(createUser.slice(createUser.indexOf('if (taken)'))),
        'a refused registration does not answer 400');
});

check('the refusal happens BEFORE the insert', () => {
    assert.ok(
        createUser.indexOf('if (taken)') < createUser.indexOf('INSERT INTO users'),
        'the insert runs before the check, so the guard is decorative'
    );
});

check('the check compares against registered accounts, not lobby players', () => {
    // 355 lobby_players nicks have never registered an account and must stay registrable.
    const sql = createUser.match(/SELECT id FROM users[^;]+/)[0];
    assert.ok(!/lobby_players/.test(sql), 'the guard wrongly rejects nicks that only played a game');
});

check('registration is unauthenticated, so the guard is the only defence', () => {
    const route = controller.slice(controller.indexOf('fastify.post("/",'), controller.indexOf('fastify.get("/",'));
    assert.ok(route.includes('create_user'), 'cannot find the registration route');
    assert.ok(!/claims/i.test(route), 'the route appears to have gained a guard; update this check');
});

// ------------------------------------------------------------------ it works
const db = new D(':memory:');
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, nick TEXT NOT NULL, password TEXT, email TEXT, role INTEGER);
         CREATE TABLE lobby_players (id INTEGER PRIMARY KEY, nick TEXT NOT NULL UNIQUE);`);
db.prepare('INSERT INTO lobby_players (nick) VALUES (?)').run('Stranger');   // played, never registered
const insert = db.prepare('INSERT INTO users (nick, password, email, role) VALUES (@nick, @password, @email, @role)');

const register = nick => {
    const taken = db.prepare('SELECT id FROM users WHERE nick = @nick COLLATE NOCASE LIMIT 1').get({ nick });
    if (taken) return 400;
    insert.run({ nick, password: 'h', email: nick + '@x', role: 1 });
    return 201;
};

check('a fresh nick registers', () => assert.strictEqual(register('Newbie'), 201));
check('the same nick again is refused', () => assert.strictEqual(register('Newbie'), 400));
check('a different casing of a taken nick is refused', () => {
    assert.strictEqual(register('NEWBIE'), 400);
    assert.strictEqual(register('newbie'), 400);
});
check('a nick that only ever played a game can still register', () => {
    assert.strictEqual(register('Stranger'), 201);
    assert.strictEqual(register('stranger'), 400, 'but still only once, whatever the casing');
});
check('the guard did not create a duplicate', () => {
    assert.strictEqual(db.prepare('SELECT count(*) c FROM users WHERE lower(nick)=?').get('newbie').c, 1);
});

// ------------------------------------------------------------------ the ambiguous lookup
db.exec(`INSERT INTO users (nick, password, email, role) VALUES ('Sanafur','h1','a@x',1);
         INSERT INTO users (nick, password, email, role) VALUES ('Sanafur','h2','b@x',3);`);

check('the lobby-nick -> user lookup is deterministic', () => {
    assert.ok(
        /SELECT id, nick, role FROM users WHERE nick = @nick ORDER BY id LIMIT 1/.test(controller),
        'the lookup still has no ORDER BY, so it returns an arbitrary duplicate'
    );
    const rows = db.prepare('SELECT id, role FROM users WHERE nick = ? ORDER BY id LIMIT 1').all('Sanafur');
    const oldest = db.prepare('SELECT min(id) m FROM users WHERE nick = ?').get('Sanafur').m;
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].id, oldest, 'should pin to the oldest account of that nick');
});

check('the same ambiguity in the metrics Basic auth is left alone, deliberately', () => {
    // /metrics compares the bcrypt hash too, so a duplicate cannot escalate past the role
    // check. Changing it is out of scope for this fix, so only assert it is not silently
    // different from what we expect.
    assert.ok(/WHERE nick = @nick AND password = @password LIMIT 1/.test(init),
        'the metrics lookup changed; re-check whether that was intended');
});

// ------------------------------------------------------------------ the premise
const realDbPath = path.join(__dirname, '..', 'dist', 'cache', 'replay-pallas.sqlite3');
if (fs.existsSync(realDbPath)) {
    const real = new D(realDbPath, { readonly: true });
    check('the split-nick premise is false on the real database', () => {
        const lp = real.prepare('SELECT count(*) c, count(DISTINCT lower(nick)) d FROM lobby_players').get();
        assert.strictEqual(lp.c, lp.d, `lobby_players has ${lp.c - lp.d} case-fold collision(s)`);
    });
    check('the real duplicates are exact strings, not case variants', () => {
        const groups = real.prepare(`SELECT lower(nick) f, count(*) n, count(DISTINCT nick) v
                                      FROM users GROUP BY f HAVING n > 1`).all();
        for (const g of groups) {
            // v === 1 means every row in the group holds the exact same string, so these are
            // plain duplicate registrations. A v > 1 would mean genuine case variants, which
            // would need a different fix (canonicalising to one spelling).
            assert.strictEqual(g.v, 1,
                `${g.f} holds ${g.v} distinct spellings, so it needs canonicalising, not just a guard`);
        }
        assert.ok(groups.length > 0, 'expected the known duplicates to still be there');
        // And no hidden whitespace or non-ASCII anywhere that would defeat NOCASE.
        const dirty = real.prepare(`SELECT count(*) c FROM users WHERE nick <> trim(nick) OR nick GLOB '*[^ -~]*'`).get().c;
        assert.strictEqual(dirty, 0, `${dirty} nick(s) carry whitespace or non-ASCII`);
    });
    check('migration 002 is where the missing UNIQUE lives', () => {
        const sql = fs.readFileSync(path.join(migrations, '002-users.sql'), 'utf8');
        assert.ok(/"nick"\s+text\s+NOT NULL/i.test(sql), 'users.nick column not found');
        assert.ok(!/UNIQUE/i.test(sql.match(/"nick"[^\n]*/)[0]), 'users.nick already has UNIQUE');
        const lobby = fs.readFileSync(path.join(migrations, '003-lobby_users.sql'), 'utf8');
        assert.ok(/UNIQUE/i.test(lobby.match(/"nick"[^\n]*/)[0]), 'lobby_players.nick is not UNIQUE either');
    });
    real.close();
}

db.close();
console.log(`\n${passed} passed, ${process.exitCode ? '1 FAILED' : 'all green'}`);
