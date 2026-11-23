const { Given, When, Then, After } = require('@cucumber/cucumber');
const assert = require('assert');

const sources = world => {
    world.ran = [];
    const step = name => ({ rebuild: () => { world.ran.push(name); if (name === 'local ratings' && world.failRatings) throw new Error('ratings broke'); } });
    return { replayDb: step('replays'), ratingsDb: step('local ratings'), releases: step('releases'), glicko2Manager: step('glicko') };
};

Given('the local ratings step fails', function () { this.failRatings = true; });
const failures = async (world, stage) => (await world.dist('prometheus.js').rebuildFailuresTotal.get()).values.find(v => v.labels.stage === stage)?.value ?? 0;
After(function () { if (this.realNow) Date.now = this.realNow; });
const run = async (world, signature, force) => {
    world.failuresBefore = await failures(world, 'local ratings');
    try { await world.dist('replays/derivedData.js').rebuildDerivedData(sources(world), signature, force); }
    catch (error) { world.error = error; }
};
// Every scenario starts from a derived data state nobody computed yet: the module keeps it, so reset it.
const reset = world => world.dist('replays/derivedData.js').markDerivedDataCurrent('none');
Given('the derived data was computed for the replays {string}', function (signature) { this.dist('replays/derivedData.js').markDerivedDataCurrent(signature); });
Given('the derived data was computed for the replays {string} more than a day ago', function (signature) {
    this.dist('replays/derivedData.js').markDerivedDataCurrent(signature);
    this.realNow = Date.now; Date.now = () => this.realNow() + 25 * 3600 * 1000;
});
When('the derived data is rebuilt', async function () { reset(this); await run(this, 'x', true); });
When('the derived data is refreshed for the replays {string}', async function (signature) { await run(this, signature, false); });
When('the derived data is rebuilt by force for the replays {string}', async function (signature) { await run(this, signature, true); });
Then('no step ran', function () { assert.deepStrictEqual(this.ran, []); });
Then('the failure counter of the stage {string} went up by {int}', async function (stage, by) { assert.strictEqual(await failures(this, stage) - this.failuresBefore, by); });
When('the derived data is rebuilt while a timer is waiting', async function () {
    const server = sources(this);
    const original = server.glicko2Manager.rebuild;
    server.glicko2Manager.rebuild = () => { this.timerFiredBefore = this.ran.includes('timer'); original(); };
    setImmediate(() => setImmediate(() => this.ran.push('timer')));
    await this.dist('replays/derivedData.js').rebuildDerivedData(server, 't', true);
});
Then('the steps ran in this order: replays, local ratings, releases, glicko', function () { assert.deepStrictEqual(this.ran, ['replays', 'local ratings', 'releases', 'glicko']); });
Then('the timer fired before the last step ran', function () { assert.strictEqual(this.timerFiredBefore, true); });
Then('the rebuild is rejected with {string}', function (message) { assert.strictEqual(this.error?.message, message); });
Then('the releases and glicko steps did not run', function () { assert.deepStrictEqual(this.ran, ['replays', 'local ratings']); });
