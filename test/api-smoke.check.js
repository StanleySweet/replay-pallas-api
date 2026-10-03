// Smoke test ("recette") of the running API: the contract the frontend depends on,
// plus regression guards for the duplicate-link and duplicate-account bugs.
//
//   API_URL=http://localhost:8080 node test/api-smoke.check.js
//
// Authenticated half:
//   SMOKE_TOKEN=<jwt> node test/api-smoke.check.js
//
// Get that token by logging in through the UI: the browser bcrypt-hashes the
// credentials before POSTing them, so the API never sees a plaintext password
// and a script cannot reproduce it without pulling bcrypt into this repo.

const assert = require("assert");

const API_URL = (process.env.API_URL || "http://localhost:8080").replace(/\/$/, "");

let failed = 0;
let total = 0;
const check = async (name, fn) => {
    ++total;
    try { await fn(); console.log(`ok    ${name}`); }
    catch (err) { failed++; console.log(`FAIL  ${name}\n        ${String(err.message).split("\n")[0]}`); }
};

const get = (path, token) => fetch(`${API_URL}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {}
});

const post = (path, body, token) => fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
});

let token;

const main = async () => {
    await check("the server answers", async () => {
        const response = await get("/metrics");
        assert.ok(response.status === 401 || response.status === 200, `unexpected status ${response.status}`);
    });

    await check("protected routes reject a missing token with 401, not 500", async () => {
        for (const path of ["/replays/all-list-items", "/replays/my-list-items", "/local-ratings/users"]) {
            const response = await get(path);
            assert.strictEqual(response.status, 401, `${path} answered ${response.status}`);
        }
    });

    await check("a malformed token does not become a 500", async () => {
        const response = await get("/replays/all-list-items", "not-a-jwt");
        assert.notStrictEqual(response.status, 500, "jwtVerify threw instead of rejecting the request");
    });

    await check("unknown credentials are refused, not served", async () => {
        const response = await post("/users/token", { email: "$2a$10$nope", password: "$2a$10$nope" });
        assert.ok(response.status === 204 || response.status === 401, `unexpected status ${response.status}`);
    });

    if (process.env.SMOKE_TOKEN) {
        await check("the given token is accepted", async () => {
            const response = await get("/replays/my-list-items", process.env.SMOKE_TOKEN);
            assert.notStrictEqual(response.status, 401, "the token was refused");
            token = process.env.SMOKE_TOKEN;
        });
    }
    else {
        console.log("skip  authenticated checks (set SMOKE_TOKEN)");
    }

    if (token) {
        await check("my replays never repeat a match id", async () => {
            const response = await get("/replays/my-list-items", token);
            if (response.status === 204) return;
            const replays = await response.json();
            const ids = replays.map(r => r.matchId);
            assert.strictEqual(new Set(ids).size, ids.length, "duplicate match ids would break the React keys");
        });

        await check("the local ratings list carries a glicko rating for a rated player", async () => {
            const users = await (await get("/local-ratings/users", token)).json();
            const rated = users.find(u => u.matches > 0);
            assert.ok(rated, "no rated player in the local ratings");
            const profile = await (await post("/local-ratings/player-profile", {
                player: rated.user.nick, rank: rated.rank, players: users.length
            }, token)).json();
            assert.ok("glickoElo" in profile, "player-profile does not report a glicko rating");
        });

        await check("the distribution chart gets bins for a rated player", async () => {
            const users = await (await get("/local-ratings/users", token)).json();
            const rated = users.find(u => u.matches > 0);
            const bins = await (await post("/local-ratings/distribution-data", {
                player: rated.user.nick, rank: rated.rank, players: rated.matches
            }, token)).json();
            assert.ok(Array.isArray(bins.bins) && bins.bins.length > 0, "no bins returned");
        });
    }

    console.log(`\n${total - failed}/${total} passed`);
    process.exit(failed ? 1 : 0);
};

main();