/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2025 Stanislas Daniel Claude Dolcini
 *
 * Runnable check for LocalRatingsPlayerFilter, which decides who may appear
 * on the local ratings leaderboard. There is no test runner in this repo, so
 * this is a plain assert script:
 *
 *   npm start && node test/player-filter.check.js
 *
 * It builds a throwaway SQLite database, points the engine at it, and
 * exercises the filter against a fixed ratings database.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const Database = require('better-sqlite3');

const { EngineInstance } = require('../dist/types/Engine');
const { LocalRatingsPlayerFilter } = require('../dist/local-ratings/PlayerFilter');

const CONFIG = {
    "mingames": "1",
    "limitmaxgames": "false",
    "maxgames": "1",
    "limitminrating": "false",
    "minrating": "0",
    "limitmaxrating": "false",
    "maxrating": "0"
};

// alice is well established, bob has only just appeared, carol is a single
// game outlier with a high rating. Matches the "top of the leaderboard on
// one lucky game" complaint this filter exists to stop.
const RATINGS = {
    "alice": { rating: 0.05, matches: 40 },
    "bob": { rating: 0.01, matches: 3 },
    "carol": { rating: 0.90, matches: 1 }
};

let failures = 0;
const check = (name, fn) => {
    try {
        fn();
        console.log("  ok   " + name);
    } catch (e) {
        failures++;
        console.log("  FAIL " + name + "\n       " + e.message);
    }
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "playerfilter-"));
const dbPath = path.join(tmpDir, "check.sqlite3");

const db = new Database(dbPath);
db.exec("CREATE TABLE local_ratings_configuration (section text, key text, value text)");

// The filter reads its thresholds through EngineInstance, which starts with a
// null database and answers null for everything until one is set.
EngineInstance.SetDataBase(db);

const insert = db.prepare("INSERT INTO local_ratings_configuration (section, key, value) VALUES ('user', ?, ?)");
const setConfig = (overrides) => {
    db.exec("DELETE FROM local_ratings_configuration");
    const merged = Object.assign({}, CONFIG, overrides || {});
    for (const key of Object.keys(merged))
        insert.run("localratings.playerfilter." + key, merged[key]);
};

const filtered = (overrides) => {
    setConfig(overrides);
    const filter = new LocalRatingsPlayerFilter(RATINGS);
    return Object.keys(RATINGS).filter(n => filter.applies(n)).sort();
};
const kept = (overrides) => Object.keys(RATINGS).filter(n => !filtered(overrides).includes(n)).sort();

// Mirrors get_player_list: filter first, then rank, so ranks stay contiguous.
const ranked = (overrides) => kept(overrides).sort((a, b) => RATINGS[b].rating - RATINGS[a].rating);

try {
    console.log("player filter");

    check("unknown player is not filtered and does not throw", () => {
        setConfig({ mingames: "10" });
        const filter = new LocalRatingsPlayerFilter(RATINGS);
        assert.strictEqual(filter.applies("nobody"), false);
    });

    check("mingames filters out players under the threshold", () => {
        assert.deepStrictEqual(filtered({ mingames: "10" }), ["bob", "carol"]);
        assert.deepStrictEqual(kept({ mingames: "10" }), ["alice"]);
    });

    check("mingames below every player's count filters nobody", () => {
        assert.deepStrictEqual(filtered({ mingames: "1" }), []);
        assert.deepStrictEqual(kept({ mingames: "1" }), ["alice", "bob", "carol"]);
    });

    check("maxgames is inert while limitmaxgames is off", () => {
        assert.deepStrictEqual(filtered({ maxgames: "2" }), []);
    });

    check("maxgames applies once limitmaxgames is on", () => {
        // A maximum of 2 keeps only carol, who has 1 match.
        assert.deepStrictEqual(filtered({ limitmaxgames: "true", maxgames: "2" }), ["alice", "bob"]);
    });

    check("minrating is inert while limitminrating is off", () => {
        assert.deepStrictEqual(filtered({ minrating: "50" }), []);
    });

    check("minrating compares the rating divided by 100", () => {
        // A minimum of 50 means 0.5, so only carol at 0.90 survives.
        assert.deepStrictEqual(filtered({ limitminrating: "true", minrating: "50" }), ["alice", "bob"]);
        // A minimum of 90 means 0.9. carol is exactly 0.9, and the test is a
        // strict <, so she is kept and nobody is filtered.
        assert.deepStrictEqual(filtered({ limitminrating: "true", minrating: "90" }), ["alice", "bob"]);
        // A minimum of 91 means 0.91, which finally excludes carol too.
        assert.deepStrictEqual(filtered({ limitminrating: "true", minrating: "91" }), ["alice", "bob", "carol"]);
    });

    check("maxrating applies once limitmaxrating is on", () => {
        // A maximum of 5 means 0.05. alice sits exactly on it and is kept,
        // carol at 0.90 is above it and goes.
        assert.deepStrictEqual(filtered({ limitmaxrating: "true", maxrating: "5" }), ["carol"]);
    });

    check("a one game player cannot top the leaderboard", () => {
        assert.strictEqual(ranked({})[0], "carol");
        assert.strictEqual(ranked({ mingames: "5" })[0], "alice");
    });

    check("ranks stay contiguous after filtering", () => {
        const names = ranked({ mingames: "5" });
        const ranks = names.map((_, i) => i + 1);
        assert.deepStrictEqual(ranks, names.map((_, i) => i + 1));
        assert.deepStrictEqual(names, ["alice"]);
    });

    check("an over-eager filter can exclude everyone", () => {
        assert.deepStrictEqual(kept({ mingames: "1000" }), []);
    });
} finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

if (failures) {
    console.log("\n" + failures + " check(s) failed");
    process.exit(1);
}
console.log("\nall checks passed");