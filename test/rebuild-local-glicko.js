// Rebuilds the primary local Glicko cache using the real code path, so the fix in
// 187b0a1 is applied to the same database the local API serves. Run from
// replay-pallas-api after a build: node test/rebuild-local-glicko.js
//
// Idempotent: rebuild() deletes glicko2_rankings and rewrites it, so running it
// twice leaves the same rows.

const assert = require("assert");
const Database = require("better-sqlite3");
const { Glicko2Manager } = require("../dist/instant-glicko-2/Glicko2Manager");

const db = new Database("dist/cache/replay-pallas.sqlite3");
const count = (table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;

const before = { rankings: count("glicko2_rankings"), players: count("lobby_players") };
console.log(`before: ${before.rankings} ranking rows, ${before.players} players`);

new Glicko2Manager(db).rebuild();

const after = { rankings: count("glicko2_rankings"), players: count("lobby_players") };
console.log(`after:  ${after.rankings} ranking rows, ${after.players} players`);

// A rating row must always point at a real player, and the cache must not be empty.
assert.ok(after.rankings > 0, "rebuild produced no rankings");
const orphans = db.prepare(
    `SELECT COUNT(*) AS c FROM glicko2_rankings r
     LEFT JOIN lobby_players p ON p.id = r.lobby_player_id
     WHERE p.id IS NULL`).get().c;
assert.strictEqual(orphans, 0, `${orphans} rating rows point at no lobby player`);

// No player may be rated more than once per match_count.
const dupes = db.prepare(
    `SELECT COUNT(*) AS c FROM (
       SELECT lobby_player_id, match_count FROM glicko2_rankings
       GROUP BY lobby_player_id, match_count HAVING COUNT(*) > 1)`).get().c;
assert.strictEqual(dupes, 0, `${dupes} duplicate (player, match_count) rating rows`);

// match_count must never exceed the real number of rated replays for that player.
const badCounts = db.prepare(
    `SELECT COUNT(*) AS c FROM glicko2_rankings r
     WHERE r.match_count > (
       SELECT COUNT(*) FROM replay_lobby_player_link lp
       WHERE lp.lobby_player_id = r.lobby_player_id)`).get().c;
assert.strictEqual(badCounts, 0, `${badCounts} rows claim more matches than the player played`);

// Rebuilding again must not change anything.
new Glicko2Manager(db).rebuild();
const again = count("glicko2_rankings");
assert.strictEqual(again, after.rankings, `rebuild not idempotent: ${after.rankings} then ${again}`);

console.log(`\nok  ${after.rankings} rankings, ${after.players} players, no orphans, no dupes, idempotent`);
if (after.rankings !== before.rankings) {
    console.log(`note: ${before.rankings} -> ${after.rankings} rating rows after the pairing fix`);
}
db.close();
