// SPDX-License-Identifier: MIT
// Checks the migration runner that replaced the `sqlite` package.
//
// Run: npx tsc -p tsconfig.json && node test/migrate.check.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const D = require('better-sqlite3');
const { migrate } = require('../dist/migrate');

const REAL = path.join(__dirname, '..', 'src', 'migrations');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-'));
const write = (dir, name, sql) => fs.writeFileSync(path.join(dir, name), sql);

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

check('applies every real migration once, and nothing the second time', () => {
    const db = new D(':memory:');
    const first = migrate(db, REAL);
    assert.strictEqual(first.length, fs.readdirSync(REAL).length);
    assert.deepStrictEqual(migrate(db, REAL), []);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM migrations').get().c, first.length);
});

check('a database migrated by the old runner only gets the newer files', () => {
    const old = tmp();
    for (const f of fs.readdirSync(REAL).slice(0, 12)) fs.copyFileSync(path.join(REAL, f), path.join(old, f));
    const db = new D(':memory:');
    assert.strictEqual(migrate(db, old).length, 12);
    assert.deepStrictEqual(migrate(db, REAL), fs.readdirSync(REAL).sort().slice(12).map(f => f.replace(/^\d+-|\.sql$/g, '')));
});

check('a failing migration leaves no table and no row', () => {
    const dir = tmp();
    write(dir, '001-ok.sql', '-- Up\nCREATE TABLE a (x);\n-- Down\nDROP TABLE a;');
    write(dir, '002-bad.sql', '-- Up\nCREATE TABLE b (x);\nINSERT INTO missing VALUES (1);\n-- Down\nDROP TABLE b;');
    const db = new D(':memory:');
    assert.throws(() => migrate(db, dir));
    assert.deepStrictEqual(db.prepare('SELECT id FROM migrations').all().map(r => r.id), [1]);
    assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name = 'b'").get().c, 0);
});

check('dropping a parent table does not cascade, and foreign keys come back on', () => {
    const dir = tmp();
    write(dir, '001-init.sql', '-- Up\nCREATE TABLE parent (id INTEGER PRIMARY KEY);\nCREATE TABLE child (id INTEGER PRIMARY KEY, p INTEGER REFERENCES parent(id) ON DELETE CASCADE);\nINSERT INTO parent VALUES (1);\nINSERT INTO child VALUES (1, 1);\n-- Down\nDROP TABLE child;');
    write(dir, '002-rebuild.sql', '-- Up\nCREATE TABLE parent_new (id INTEGER PRIMARY KEY);\nINSERT INTO parent_new SELECT id FROM parent;\nDROP TABLE parent;\nALTER TABLE parent_new RENAME TO parent;\n-- Down\nSELECT 1;');
    const db = new D(':memory:');
    assert.strictEqual(db.pragma('foreign_keys', { simple: true }), 1);
    migrate(db, dir);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM child').get().c, 1);
    assert.strictEqual(db.pragma('foreign_keys', { simple: true }), 1);
});

console.log(passed + ' checks passed');
