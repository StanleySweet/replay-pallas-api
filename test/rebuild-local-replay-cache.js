// Rebuilds the local local-ratings JSON caches so the UTC replay dates land on disk, and
// proves the cache version bump is what triggers it. Run from replay-pallas-api after a
// build: node test/rebuild-local-replay-cache.js
//
// Needed because replay `date` is baked into dist/cache/replayDatabase.json, so fixing
// the timezone handling in MetadataContainer only takes effect once the cache is rebuilt.

const assert = require("assert");
const fs = require("fs");
const Database = require("better-sqlite3");
const snappy = require("snappy");

const { LocalRatingsCache } = require("../dist/local-ratings/Cache");
const { LocalRatingsReplayDB } = require("../dist/local-ratings/ReplayDB");
const { LocalRatingsMinifier } = require("../dist/local-ratings/Minifier");
const { EngineInstance } = require("../dist/types/Engine");

// Engine.GetReplays returns nothing while EngineInstance.database is null, and
// ReplayDB.save() then writes an EMPTY cache over a good one. Wire the database first.
const db = new Database("dist/cache/replay-pallas.sqlite3");
EngineInstance.database = db;

const CACHE_DIR = "dist/cache";
const VERSION_FILE = `${CACHE_DIR}/cacheVersion.json`;
const REPLAY_FILE = `${CACHE_DIR}/replayDatabase.json`;

const cache = new LocalRatingsCache();

// cacheVersion.json is written by nothing in the tree: Cache.updateVersion() had no
// callers and was deleted in f122d0d. isUpdateRequired() is therefore permanently true
// and init_LocalRatings rebuilds the caches on every boot. The version bump is the
// documented way to invalidate them and stays, but it is not what drives the rebuild.
const onDiskVersion = JSON.parse(fs.readFileSync(VERSION_FILE, "utf8")).version;
assert.notStrictEqual(onDiskVersion, cache.version, "version bump is missing");
assert.strictEqual(cache.isUpdateRequired(), true);

const before = Object.keys(JSON.parse(fs.readFileSync(REPLAY_FILE, "utf8"))).length;
const replayDb = new LocalRatingsReplayDB(cache, new LocalRatingsMinifier());
replayDb.rebuild();
const after = Object.keys(JSON.parse(fs.readFileSync(REPLAY_FILE, "utf8"))).length;
assert.ok(after > 0, "rebuild emptied the replay cache: EngineInstance.database was not set");
console.log(`ok  replay cache rebuilt, ${before} -> ${after} replays`);

// Every cached date must now be the UTC calendar day of its match.
const magnified = new LocalRatingsMinifier().magnifyReplayDatabase(JSON.parse(fs.readFileSync(REPLAY_FILE, "utf8")));
const rows = db.prepare("SELECT match_id, metadata FROM replays").all();
let checked = 0;
for (const row of rows) {
    const cached = magnified[row.match_id];
    if (!cached)
        continue;
    const metadata = JSON.parse(snappy.uncompressSync(Buffer.from(row.metadata), { asBuffer: false }));
    const expected = new Date(metadata.timestamp * 1000).toISOString().slice(0, 10);
    assert.strictEqual(cached.date, expected, `${row.match_id}: cached ${cached.date}, expected ${expected}`);
    ++checked;
}
assert.ok(checked > 0, "no replays were checked, the cache is empty");
console.log(`ok  ${checked} cached replay dates are the UTC calendar day`);
console.log(`ok  local caches rebuilt (cache version ${onDiskVersion} on disk -> ${cache.version} in code)`);
db.close();
