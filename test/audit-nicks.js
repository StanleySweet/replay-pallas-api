// SPDX-License-Identifier: MIT
// Audits the nicks of a real database: the duplicates the registration guard has to cope with.
// Not part of the test suite, because the answer depends on the data it is pointed at.
//
// Run: node test/audit-nicks.js [path/to/replay-pallas.sqlite3]
const assert = require('assert');
const path = require('path');
const D = require('better-sqlite3');

const file = process.argv[2] || path.join(__dirname, '..', 'dist', 'cache', 'replay-pallas.sqlite3');
const db = new D(file, { readonly: true });
let failed = 0;
const audit = (name, fn) => {
    try { const note = fn(); console.log('  ok    ' + name + (note ? ' (' + note + ')' : '')); }
    catch (e) { failed++; console.log('  FAIL  ' + name + '\n        ' + e.message); }
};

audit('no two lobby players differ only by case', () => {
    const lp = db.prepare('SELECT count(*) c, count(DISTINCT lower(nick)) d FROM lobby_players').get();
    assert.strictEqual(lp.c, lp.d, `lobby_players has ${lp.c - lp.d} case-fold collision(s)`);
    return lp.c + ' players';
});

audit('registered duplicates are exact strings, not case variants', () => {
    const groups = db.prepare('SELECT lower(nick) f, count(*) n, count(DISTINCT nick) v FROM users GROUP BY f HAVING n > 1').all();
    for (const g of groups)
        assert.strictEqual(g.v, 1, `${g.f} holds ${g.v} distinct spellings, so it needs canonicalising, not just a guard`);
    return groups.length ? groups.length + ' nick(s) registered more than once' : 'no duplicates';
});

audit('no nick carries whitespace or non-ASCII that would defeat NOCASE', () => {
    const dirty = db.prepare("SELECT count(*) c FROM users WHERE nick <> trim(nick) OR nick GLOB '*[^ -~]*'").get().c;
    assert.strictEqual(dirty, 0, `${dirty} nick(s) carry whitespace or non-ASCII`);
});

process.exit(failed ? 1 : 0);
