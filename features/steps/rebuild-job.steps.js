const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');
const D = require('better-sqlite3');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

Given('a database file holding {int} replays', function (count) {
    this.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'features-rebuild-'));
    this.file = path.join(this.directory, 'replay-pallas.sqlite3');
    const db = new D(this.file);
    this.dist('migrate.js').migrate(db, this.migrations);
    const replays = new (this.dist('repositories/ReplayRepository.js').ReplayRepository)(db);
    for (let i = 0; i < count; i++)
        this.uploadedReplay(replays, `J${i}`, '0.27.0', 2);
    db.close();
});

const start = world => {
    world.refreshed = 0;
    world.job = new (world.dist('replays/RebuildJob.js').MetadataRebuildJob)();
    world.started = world.job.start(world.file, () => { world.refreshed++; });
};
When('the rebuild is started', function () { start(this); });
When('the rebuild is started on a database that cannot be opened', function () { this.file = path.join(os.tmpdir(), 'features-missing-directory', 'nope.sqlite3'); start(this); });
When('the rebuild has finished', async function () {
    for (let i = 0; i < 600 && this.job.isRunning(); i++) await sleep(100);
    assert.ok(!this.job.isRunning(), 'the rebuild did not finish in time');
});

Then('it is accepted at once', function () { assert.strictEqual(this.started, true); assert.strictEqual(this.job.status.state, 'reading'); });
Then('a second start is refused while it runs', function () { assert.strictEqual(this.job.start(this.file, () => { this.refreshed += 100; }), false); });
Then('its status is done, with {int} of {int} replays', function (done, total) {
    assert.strictEqual(this.job.status.state, 'done');
    assert.strictEqual(this.job.status.done, done);
    assert.strictEqual(this.job.status.total, total);
    assert.ok(this.job.status.finishedAt);
});
Then('the caches were refreshed once it was done', function () { assert.strictEqual(this.refreshed, 1); });
Then('its status is failed, with a reason', function () { assert.strictEqual(this.job.status.state, 'failed'); assert.ok(this.job.status.error); });
Then('the caches were not refreshed', function () { assert.strictEqual(this.refreshed, 0); });
