const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');

const sources = world => {
    world.ran = [];
    const step = name => ({ rebuild: () => { world.ran.push(name); if (name === 'local ratings' && world.failRatings) throw new Error('ratings broke'); } });
    return { replayDb: step('replays'), ratingsDb: step('local ratings'), releases: step('releases'), glicko2Manager: step('glicko') };
};

Given('the local ratings step fails', function () { this.failRatings = true; });
When('the derived data is rebuilt', async function () {
    try { await this.dist('replays/derivedData.js').rebuildDerivedData(sources(this)); }
    catch (error) { this.error = error; }
});
When('the derived data is rebuilt while a timer is waiting', async function () {
    const server = sources(this);
    const original = server.glicko2Manager.rebuild;
    server.glicko2Manager.rebuild = () => { this.timerFiredBefore = this.ran.includes('timer'); original(); };
    setImmediate(() => setImmediate(() => this.ran.push('timer')));
    await this.dist('replays/derivedData.js').rebuildDerivedData(server);
});
Then('the steps ran in this order: replays, local ratings, releases, glicko', function () { assert.deepStrictEqual(this.ran, ['replays', 'local ratings', 'releases', 'glicko']); });
Then('the timer fired before the last step ran', function () { assert.strictEqual(this.timerFiredBefore, true); });
Then('the rebuild is rejected with {string}', function (message) { assert.strictEqual(this.error?.message, message); });
Then('the releases and glicko steps did not run', function () { assert.deepStrictEqual(this.ran, ['replays', 'local ratings']); });
