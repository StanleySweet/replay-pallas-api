// SPDX-License-Identifier: MIT
// Boots the API on a small seeded database and runs api-smoke.check.js against it, so the smoke test
// needs no server, no token and no real data.
//
// Run from replay-pallas-api/: npx tsc -p tsconfig.json && node test/run-smoke.js
const path = require('path');
const { spawnSync } = require('child_process');
const { startSeededServer } = require('./support/seeded-server');

const main = async () => {
    const server = await startSeededServer(Number(process.env.SMOKE_PORT || 18099));
    let status = 1;
    try {
        status = spawnSync(process.execPath, [path.join(__dirname, 'api-smoke.check.js')], { env: { ...process.env, API_URL: server.url, SMOKE_TOKEN: await server.token(3) }, stdio: 'inherit' }).status ?? 1;
    }
    finally {
        server.stop();
    }
    process.exit(status);
};
main();
