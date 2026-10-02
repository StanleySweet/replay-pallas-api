// Cross-checks the rebuilt replay cache against the SQLite `creation_date` column: both
// are derived from metadata.timestamp and must agree on the calendar day. Run from
// replay-pallas-api: node test/replay-date-consistency.js
//
// Before the UTC fix (e0f5a6f-era code) 37 of 491 cached dates sat one day away from the
// truth, and the replay list therefore disagreed with the replay details page.

const assert = require("assert");
const fs = require("fs");
const Database = require("better-sqlite3");
const snappy = require("snappy");
const { LocalRatingsMinifier } = require("../dist/local-ratings/Minifier");

const db = new Database("dist/cache/replay-pallas.sqlite3");
const cache = JSON.parse(fs.readFileSync("dist/cache/replayDatabase.json", "utf8"));
const magnified = new LocalRatingsMinifier().magnifyReplayDatabase(cache);

const rows = db.prepare("SELECT match_id, metadata, creation_date FROM replays").all();
assert.ok(rows.length > 0, "no replays in the database");

let compared = 0;
const disagreements = [];
for (const row of rows) {
    const cached = magnified[row.match_id];
    if (!cached)
        continue;
    const metadata = JSON.parse(snappy.uncompressSync(Buffer.from(row.metadata), { asBuffer: false }));
    const expected = new Date(metadata.timestamp * 1000).toISOString().slice(0, 10);
    ++compared;
    if (cached.date !== expected || cached.date !== row.creation_date.slice(0, 10)) {
        disagreements.push({ matchId: row.match_id, cached: cached.date, utc: expected, creation: row.creation_date.slice(0, 10) });
    }
}

assert.ok(compared > 0, "no replays were compared, the replay cache is empty or stale");
console.log(`compared ${compared} of ${rows.length} replays`);
for (const d of disagreements.slice(0, 10)) {
    console.log(`  ${d.matchId}: cache ${d.cached}, UTC ${d.utc}, creation_date ${d.creation}`);
}
assert.strictEqual(disagreements.length, 0, `${disagreements.length} replays disagree on their calendar day`);
console.log("ok  cached date, UTC day and creation_date all agree");
db.close();
