// Checks getRatedPair(), the rule that decides which two players a replay
// actually rates. Run: node test/glicko-pair.check.js (after a build).
//
// The bug this guards: Glicko2Manager assumed "exactly two human players"
// meant 1v1. It does not. A team game with two humans on the same team has
// no individual win or loss, and the old code rated one player as having
// beaten their own teammate.

const assert = require("assert");
const { getRatedPair } = require("../dist/instant-glicko-2/Glicko2Manager");

const human = (name, team, state) => ({ AI: false, NameWithoutRating: name, Team: team, State: state, LobbyUserId: 1 });
const ai = (name, team, state) => ({ AI: true, NameWithoutRating: name, Team: team, State: state });

const checks = [
    ["free-for-all 1v1, one won", [human("a", -1, "won"), human("b", -1, "defeated")], ["a", "b"]],
    ["free-for-all 1v1, one lost", [human("a", -1, "defeated"), human("b", -1, "won")], ["b", "a"]],
    ["opposing teams 1v1", [human("a", 0, "won"), human("b", 1, "defeated")], ["a", "b"]],

    // THE REGRESSION: two humans, same non-negative team. Both "won" because
    // their team won. There is no individual outcome to rate.
    ["allies in a team game are excluded", [human("a", 0, "won"), human("b", 0, "won")], undefined],

    // AI must be filtered out rather than skipped by position, so the two
    // humans are found wherever they sit in the array.
    ["AI before both humans is skipped", [ai("bot", 0, "won"), human("a", 0, "won"), human("b", 1, "defeated")], ["a", "b"]],
    ["AI between the humans is skipped", [human("a", 0, "won"), ai("bot", 1, "defeated"), human("b", 1, "defeated")], ["a", "b"]],
    ["AI after both humans is ignored", [human("a", 0, "won"), human("b", 1, "defeated"), ai("bot", 2, "won")], ["a", "b"]],

    // No human won, so the loser was beaten by a computer, not by the other
    // human. Rating the two humans against each other invents a result.
    ["human who lost to an AI is excluded", [human("a", 0, "defeated"), human("b", 0, "defeated"), ai("bot", 9, "won")], undefined],
    ["nobody won at all is excluded", [human("a", 0, "defeated"), human("b", 1, "defeated")], undefined],

    // Not exactly two humans: a 1v1 against AI has no human opponent.
    ["three humans is not rated", [human("a", 0, "won"), human("b", 1, "defeated"), human("c", 2, "won")], undefined],
    ["one human against AI is not rated", [human("a", 0, "defeated"), ai("bot", 1, "won")], undefined],

    ["unnamed human is not rated", [{ AI: false, NameWithoutRating: "", Team: -1, State: "won" }, human("b", -1, "defeated")], undefined],
    ["empty PlayerData is not rated", [], undefined],
    ["missing PlayerData is not rated", undefined, undefined],
];

let failed = 0;
for (const [name, input, expected] of checks) {
    try {
        const pair = getRatedPair(input);
        const got = pair ? [pair.winner.NameWithoutRating, pair.loser.NameWithoutRating] : undefined;
        assert.deepStrictEqual(got, expected);
        console.log(`ok    ${name}`);
    }
    catch (err) {
        failed++;
        console.log(`FAIL  ${name}\n        ${err.message.split("\n").slice(0, 6).join("\n        ")}`);
    }
}

console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
