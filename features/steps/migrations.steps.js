const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const D = require('better-sqlite3');

const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), 'features-migrate-'));
const write = (dir, name, sql) => fs.writeFileSync(path.join(dir, name), sql);
const names = dir => fs.readdirSync(dir).sort().map(f => f.replace(/^\d+-|\.sql$/g, ''));

Given('an empty database', function () { this.target = new D(':memory:'); this.directory = this.migrations; });
Given('a database migrated up to migration {int}', function (last) {
    this.directory = scratch();
    for (const file of fs.readdirSync(this.migrations).sort().slice(0, last)) fs.copyFileSync(path.join(this.migrations, file), path.join(this.directory, file));
    this.target = new D(':memory:');
    this.dist('migrate.js').migrate(this.target, this.directory);
    this.directory = this.migrations;
    this.upTo = last;
});
Given('a migration that creates a table and then fails', function () {
    this.directory = scratch();
    write(this.directory, '001-ok.sql', '-- Up\nCREATE TABLE a (x);\n-- Down\nDROP TABLE a;');
    write(this.directory, '002-bad.sql', '-- Up\nCREATE TABLE b (x);\nINSERT INTO missing VALUES (1);\n-- Down\nDROP TABLE b;');
    this.target = new D(':memory:');
});
Given('a child table that cascades from a parent table, holding one row each', function () {
    this.directory = scratch();
    write(this.directory, '001-init.sql', '-- Up\nCREATE TABLE parent (id INTEGER PRIMARY KEY);\nCREATE TABLE child (id INTEGER PRIMARY KEY, p INTEGER REFERENCES parent(id) ON DELETE CASCADE);\nINSERT INTO parent VALUES (1);\nINSERT INTO child VALUES (1, 1);\n-- Down\nDROP TABLE child;');
    this.target = new D(':memory:');
    this.target.pragma('foreign_keys = ON');
    this.dist('migrate.js').migrate(this.target, this.directory);
});

When('the migrations are applied', function () {
    try { this.applied = this.dist('migrate.js').migrate(this.target, this.directory); }
    catch (error) { this.error = error; }
});
When('a migration drops and recreates the parent table', function () {
    write(this.directory, '002-rebuild.sql', '-- Up\nCREATE TABLE parent_new (id INTEGER PRIMARY KEY);\nINSERT INTO parent_new SELECT id FROM parent;\nDROP TABLE parent;\nALTER TABLE parent_new RENAME TO parent;\n-- Down\nSELECT 1;');
    this.dist('migrate.js').migrate(this.target, this.directory);
});

Then('every migration file is recorded', function () { assert.strictEqual(this.applied.length, fs.readdirSync(this.migrations).length); });
Then('applying them again does nothing', function () { assert.deepStrictEqual(this.dist('migrate.js').migrate(this.target, this.directory), []); });
Then('only the files after migration {int} are applied', function (last) { assert.deepStrictEqual(this.applied, names(this.migrations).slice(last)); });
Then('the migration is refused', function () { assert.ok(this.error, 'the failing migration was accepted'); });
Then('neither its table nor a record of it exists', function () {
    assert.deepStrictEqual(this.target.prepare('SELECT id FROM migrations').all().map(r => r.id), [1]);
    assert.strictEqual(this.target.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name = 'b'").get().c, 0);
});
Then('the child row is still there', function () { assert.strictEqual(this.target.prepare('SELECT COUNT(*) c FROM child').get().c, 1); });
Then('foreign keys are on again', function () { assert.strictEqual(this.target.pragma('foreign_keys', { simple: true }), 1); });
