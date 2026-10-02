// Checks that ToDbFormat() records the real match instant as UTC, independently
// of the server's timezone. Run: node test/timestamp.check.js (after a build).
//
// Why it matters: creation_date is derived from metadata.timestamp, which is an
// absolute instant (epoch seconds). The old code formatted it with the *local*
// time getters, so the same replay was filed under a different instant depending
// on where the API ran - and a match played late in the UTC day landed on the
// wrong calendar date entirely, which is exactly what any date filter keys on.

const assert = require("assert");
const { ToDbFormat } = require("../dist/types/Replay");

const replayAt = (timestamp) => ({ metadata: { matchID: "X", timestamp }, filedata: {} });
const asUtcString = (epochSeconds) =>
    new Date(epochSeconds * 1000).toISOString().replace("T", " ").slice(0, 19);

// Matches at awkward moments: just before midnight UTC, just after, and midday.
const LATE_NIGHT = Math.floor(Date.UTC(2022, 9, 12, 23, 30, 0) / 1000); // 12 Oct 23:30 UTC
const JUST_AFTER = Math.floor(Date.UTC(2022, 9, 13, 0, 30, 0) / 1000); // 13 Oct 00:30 UTC
const MIDDAY = Math.floor(Date.UTC(2022, 9, 12, 12, 0, 0) / 1000);
const NEW_YEAR_EVE = Math.floor(Date.UTC(2021, 11, 31, 23, 0, 0) / 1000);

const timezones = ["UTC", "Europe/Paris", "America/New_York", "Asia/Tokyo", "Australia/Sydney"];
const moments = [
    ["late night 23:30 UTC", LATE_NIGHT],
    ["just after midnight 00:30 UTC", JUST_AFTER],
    ["midday 12:00 UTC", MIDDAY],
    ["new year eve 23:00 UTC", NEW_YEAR_EVE],
];

let failed = 0;
const check = (name, fn) => {
    try { fn(); console.log(`ok    ${name}`); }
    catch (err) { failed++; console.log(`FAIL  ${name}\n        ${err.message.split("\n").slice(0, 4).join("\n        ")}`); }
};

for (const tz of timezones) {
    process.env.TZ = tz;
    for (const [label, epoch] of moments) {
        check(`TZ=${tz} stores a ${label} match at its UTC instant`, () => {
            const stored = ToDbFormat(replayAt(epoch)).creationDate;
            assert.strictEqual(stored, asUtcString(epoch),
                `stored ${stored}, expected ${asUtcString(epoch)}`);
        });
    }
}

// The date must never roll over, which is the failure the bug actually caused.
process.env.TZ = "Europe/Paris";
check("a 23:30 UTC match is NOT filed on the following day", () => {
    const stored = ToDbFormat(replayAt(LATE_NIGHT)).creationDate;
    assert.ok(stored.startsWith("2022-10-12"), `stored ${stored}, expected a 2022-10-12 date`);
});
check("a New Year Eve match stays in the right year", () => {
    const stored = ToDbFormat(replayAt(NEW_YEAR_EVE)).creationDate;
    assert.ok(stored.startsWith("2021-12-31"), `stored ${stored}, expected a 2021-12-31 date`);
});

// The stored string has to sort lexicographically for date range filters to work.
check("stored dates sort chronologically as plain strings", () => {
    const a = ToDbFormat(replayAt(LATE_NIGHT)).creationDate;
    const b = ToDbFormat(replayAt(JUST_AFTER)).creationDate;
    assert.ok(a < b, `${a} should sort before ${b}`);
});

// A replay with no timestamp must not silently become 1970 and pollute the range.
check("a replay with no timestamp is still handled", () => {
    const stored = ToDbFormat(replayAt(undefined)).creationDate;
    assert.match(stored, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, `unexpected format ${stored}`);
});

console.log(`\n${timezones.length * moments.length + 4 - failed}/${timezones.length * moments.length + 4} passed`);
process.exit(failed ? 1 : 0);
