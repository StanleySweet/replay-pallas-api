// Checks that a replay's cached `date` is the UTC calendar day of the match, whatever
// timezone the host runs in. Run: node test/replay-date.check.js (after a build).
//
// Why it matters: this string is what the replay list sorts by, displays, and would
// filter on. It was rendered with local-time getters from what is an absolute epoch, so
// the same match landed on a different day depending on the host - and the replay list
// disagreed with the replay details page, which renders metadata.timestamp directly.

const assert = require("assert");
const { LocalRatingsMetadataContainer } = require("../dist/local-ratings/types/MetadataContainer");

const dayOf = (timestamp) => {
    const c = new LocalRatingsMetadataContainer();
    c.attribs = { timestamp };
    return c.getDate();
};

const LATE_NIGHT = Math.floor(Date.UTC(2022, 9, 12, 23, 30, 0) / 1000); // 12 Oct 23:30 UTC
const JUST_AFTER = Math.floor(Date.UTC(2022, 9, 13, 0, 30, 0) / 1000); // 13 Oct 00:30 UTC
const MIDDAY = Math.floor(Date.UTC(2022, 9, 12, 12, 0, 0) / 1000);
const NEW_YEAR_EVE = Math.floor(Date.UTC(2021, 11, 31, 23, 0, 0) / 1000);
const NEW_YEAR = Math.floor(Date.UTC(2022, 0, 1, 1, 0, 0) / 1000);

let failed = 0;
const check = (name, fn) => {
    try { fn(); console.log(`ok    ${name}`); }
    catch (err) { failed++; console.log(`FAIL  ${name}\n        ${err.message.split("\n")[0]}`); }
};

const timezones = ["UTC", "Europe/Paris", "America/New_York", "Asia/Tokyo", "Australia/Sydney"];
const moments = [
    ["late night 23:30 UTC", LATE_NIGHT, "2022-10-12"],
    ["just after midnight 00:30 UTC", JUST_AFTER, "2022-10-13"],
    ["midday 12:00 UTC", MIDDAY, "2022-10-12"],
    ["new year eve 23:00 UTC", NEW_YEAR_EVE, "2021-12-31"],
    ["new year 01:00 UTC", NEW_YEAR, "2022-01-01"],
];

for (const tz of timezones) {
    process.env.TZ = tz;
    for (const [label, epoch, expectedDay] of moments) {
        check(`TZ=${tz} files a ${label} match under ${expectedDay}`, () => {
            assert.strictEqual(dayOf(epoch), expectedDay, `got ${dayOf(epoch)}, expected ${expectedDay}`);
        });
    }
}

// The format itself is a dependency of the minified replay cache, so pin it.
process.env.TZ = "Europe/Paris";
check("cached date stays YYYY-MM-DD", () => {
    assert.match(dayOf(MIDDAY), /^\d{4}-\d{2}-\d{2}$/);
});

// The list sorts on this string, so equal days must be equal and order must follow.
check("cached dates sort chronologically as plain strings", () => {
    assert.ok(dayOf(LATE_NIGHT) < dayOf(JUST_AFTER));
    assert.ok(dayOf(NEW_YEAR_EVE) < dayOf(NEW_YEAR));
});

check("a replay with no timestamp still yields a valid date", () => {
    assert.match(dayOf(undefined), /^\d{4}-\d{2}-\d{2}$/);
});

const total = timezones.length * moments.length + 3;
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
