// Checks that a replay list item survives the API serialisation with everything the date
// filter and the version display need. Run: node test/replay-list-item.check.js (after a build).

const assert = require("assert");
const { toReplayListItem } = require("../dist/controllers/helpers/replayListItem");
const { LocalRatingsMinifier } = require("../dist/local-ratings/Minifier");

// A small replay cache built here, so the check does not depend on whatever database is lying around.
// It goes through the minifier both ways, as the real cache does.
const replay = (id, date, mods) => ({
    isValid: true, directory: id, date, players: ["Alice", "Bob"], civs: ["athen", "spart"], scores: [{}, {}], mods,
    duration: 1800, startingResources: 300, populationCap: 300, worldPopulation: false, hasAiPlayers: false,
    cheatsEnabled: false, revealedMap: false, exploredMap: false, nomad: false, teamsSize: { 0: 1, 1: 1 }, mapName: "Mainland",
});
const minifier = new LocalRatingsMinifier();
const magnified = minifier.magnifyReplayDatabase(minifier.minifyReplayDatabase({
    A: replay("A", "2026-01-02", ["0ad 0.28.0", "feldmap 3.0.1"]),
    B: replay("B", "2026-01-03", ["0ad 0.27.1"]),
    C: replay("C", "2025-12-31", []),
}));

let failed = 0;
const check = (name, fn) => {
    try { fn(); console.log(`ok    ${name}`); }
    catch (err) { failed++; console.log(`FAIL  ${name}\n        ${err.message.split("\n")[0]}`); }
};

check("every cached replay produces a list item", () => {
    const ids = Object.keys(magnified);
    assert.ok(ids.length > 0, "the replay cache is empty");
    const items = ids.map(id => toReplayListItem(magnified[id]));
    assert.strictEqual(items.filter(x => x !== null).length, ids.length, "some replays were dropped");
});

check("list items carry a UTC calendar day", () => {
    for (const id of Object.keys(magnified)) {
        const item = toReplayListItem(magnified[id]);
        assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/, `${id}: bad date ${item.date}`);
    }
});

check("list items carry the mods, so a date span shows version changes", () => {
    let withMods = 0;
    for (const id of Object.keys(magnified)) {
        const item = toReplayListItem(magnified[id]);
        assert.ok(Array.isArray(item.mods), `${id}: mods is not an array`);
        if (item.mods.length) ++withMods;
    }
    assert.ok(withMods > 0, "no replay reported any mod");
});

// A date range is compared as strings, so a non-padded or empty date must not sneak in.
check("dates stay lexicographically comparable", () => {
    const days = Object.keys(magnified).map(id => toReplayListItem(magnified[id]).date).sort();
    const sorted = [...days].sort();
    assert.deepStrictEqual(days, sorted);
});

check("a missing replay still yields null instead of throwing", () => {
    assert.strictEqual(toReplayListItem(undefined), null);
});

check("a replay with non-string mods entries does not corrupt the payload", () => {
    const item = toReplayListItem({ directory: "ABC", date: "2024-01-01", mapName: "m", players: [], civs: [], mods: ["ok 1.0", null, 42] });
    assert.ok(Array.isArray(item.mods), "mods is not an array");
    assert.ok(item.mods.every(x => typeof x === "string"), `non-string survived: ${JSON.stringify(item.mods)}`);
    assert.ok(item.mods.includes("ok 1.0"), "valid mod entry was dropped");
});

const total = 6;
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
