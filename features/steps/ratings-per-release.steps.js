const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');

const lastOf = rows => rows.reduce((x, y) => y.match_count >= x.match_count ? y : x);
const sets = world => world.db.prepare('SELECT game_release r, COUNT(*) c FROM glicko2_rankings GROUP BY game_release ORDER BY game_release').all();

// ---- the games
Given('Alice beat Bob twice on release {int}', function (release) {
    this.game('r1', '2026-01-01', release, 'Alice');
    this.game('r2', '2026-01-02', release, 'Alice');
});
Given('Bob beat Alice once on release {int}', function (release) { this.game('r3', '2026-01-03', release, 'Bob'); });

// ---- glicko
When('the glicko ratings are rebuilt', function () {
    new (this.dist('instant-glicko-2/Glicko2Manager.js').Glicko2Manager)(this.db).rebuild();
    this.snapshots = [...(this.snapshots ?? []), sets(this)];
});
Then('there are glicko sets for every replay, release {int} and release {int}', function (a, b) { assert.deepStrictEqual(sets(this).map(s => s.r), [null, a, b]); });
Then('Alice has played {int} rated games over every replay, {int} on release {int} and {int} on release {int}', function (all, a, releaseA, b, releaseB) {
    const alice = this.players.findOrCreateId('Alice');
    assert.strictEqual(lastOf(this.players.glickoHistory(alice, null)).match_count, all);
    assert.strictEqual(lastOf(this.players.glickoHistory(alice, releaseA)).match_count, a);
    assert.strictEqual(lastOf(this.players.glickoHistory(alice, releaseB)).match_count, b);
});
Then('Alice is rated higher on release {int} than on release {int}', function (a, b) {
    const alice = this.players.findOrCreateId('Alice');
    assert.ok(lastOf(this.players.glickoHistory(alice, a)).elo > lastOf(this.players.glickoHistory(alice, b)).elo);
});
Then("Alice's latest glicko match count is {int}", function (count) { assert.strictEqual(this.localRatings.latestGlicko('Alice').match_count, count); });
Then("Alice's latest glicko match count on release {int} is {int}", function (release, count) { assert.strictEqual(this.localRatings.latestGlicko('Alice', release).match_count, count); });
Then('there is no glicko rating on release {int}', function (release) { assert.strictEqual(this.localRatings.latestGlicko('Alice', release), undefined); });
Then('each glicko set has the same rows as after the first rebuild', function () { assert.deepStrictEqual(this.snapshots[this.snapshots.length - 1], this.snapshots[0]); });

// ---- local ratings
const compute = world => {
    const { LocalRatingsReleases } = world.dist('local-ratings/Releases.js');
    world.cache.save('replayDatabase', world.minifier.minifyReplayDatabase(world.cacheReplays));
    world.releases = new LocalRatingsReleases(world.cache, world.minifier, world.replays, { replayDatabase: world.cacheReplays });
    world.releases.load();
};
const alice = (world, release) => world.releases.get(release).ratingsDatabase.Alice;
const bob = (world, release) => world.releases.get(release).ratingsDatabase.Bob;

Given('a local ratings set over every replay holding the player {string}', function (nick) { this.cache.save('ratingsDatabase', { [nick]: { rating: 1, matches: 1 } }); });
When('the local ratings are computed per release', function () { compute(this); });
When('the server restarts', function () {
    const { LocalRatingsReleases } = this.dist('local-ratings/Releases.js');
    this.releases = new LocalRatingsReleases(this.cache, this.minifier, this.replays, { replayDatabase: {} });   // would be empty if it recomputed
    this.releases.load();
});
When('a replay won by Bob is added on release {int}', function (release) {
    this.game('r4', '2026-01-04', release, 'Bob');
    this.releases.merge({ r4: this.cacheReplays.r4 });
});
When('every replay of release {int} is deleted', function (release) {
    for (const id of Object.keys(this.cacheReplays)) {
        if (this.db.prepare('SELECT game_release r FROM replays WHERE match_id = ?').get(id).r === release) {
            this.replays.delete(id);
            delete this.cacheReplays[id];
        }
    }
});
When('the local ratings are rebuilt per release', function () { this.releases.rebuild(); });
Then('there are local rating sets for release {int} and release {int} only', function (a, b) { assert.deepStrictEqual([...this.releases.byRelease.keys()].sort(), [a, b]); });
Then('there are local rating sets for release {int} only', function (a) { assert.deepStrictEqual([...this.releases.byRelease.keys()], [a]); });
Then('Alice has {int} rated matches on release {int} and {int} on release {int}', function (a, releaseA, b, releaseB) {
    assert.strictEqual(alice(this, releaseA).matches, a);
    assert.strictEqual(alice(this, releaseB).matches, b);
});
Then('Alice is rated above Bob on release {int} and below Bob on release {int}', function (a, b) {
    assert.ok(alice(this, a).rating > bob(this, a).rating);
    assert.ok(alice(this, b).rating < bob(this, b).rating);
});
Then('the local ratings over every replay still hold only {string}', function (nick) { assert.deepStrictEqual(Object.keys(this.cache.load('ratingsDatabase')), [nick]); });
Then('Alice still has {int} rated matches on release {int}', function (count, release) { assert.strictEqual(alice(this, release).matches, count); });
