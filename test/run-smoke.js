// SPDX-License-Identifier: MIT
// Boots the API on a small seeded database and runs api-smoke.check.js against it, so the smoke test
// needs no server, no token and no real data.
//
// Run from replay-pallas-api/: npx tsc -p tsconfig.json && node test/run-smoke.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const D = require('better-sqlite3');
const jose = require('jose');

const root = path.join(__dirname, '..');
const dist = rel => require(path.join(root, 'dist', rel));
const port = Number(process.env.SMOKE_PORT || 18099);
const secret = 'smoke-secret';

// The server reads dist/cache, src/migrations and src/local-ratings relative to its working directory,
// so it gets a scratch copy of the layout with its own empty dist/cache.
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-'));
fs.cpSync(path.join(root, 'dist'), path.join(work, 'dist'), { recursive: true, filter: source => !source.startsWith(path.join(root, 'dist', 'cache')) });
fs.mkdirSync(path.join(work, 'dist', 'cache'), { recursive: true });
for (const name of ['src', 'node_modules', 'package.json'])
    fs.symlinkSync(path.join(root, name), path.join(work, name));

// ----------------------------------------------------------------------------- seed
const db = new D(path.join(work, 'dist', 'cache', 'replay-pallas.sqlite3'));
dist('migrate.js').migrate(db, path.join(root, 'src', 'migrations'));
db.pragma('foreign_keys = ON');

const { EngineInstance } = dist('types/Engine.js');
EngineInstance.SetDataBase(db);
new (dist('local-ratings/Settings.js').LocalRatingsSettingsManager)().createDefaultSettingsIfNotExist();
const options = require('../src/local-ratings/types/options.json');
const weightKey = options.find(group => group.label === 'Score Weights').options[0].config;
EngineInstance.ConfigDB_CreateValue('user', weightKey, '1');
const scoreName = weightKey.replace('localratings.weight.', '');

const { ReplayRepository } = dist('repositories/ReplayRepository.js');
const { PlayerRepository } = dist('repositories/PlayerRepository.js');
const { UserRepository } = dist('repositories/UserRepository.js');
const { packBlob } = dist('replays/blobCodec.js');
const replays = new ReplayRepository(db), players = new PlayerRepository(db), users = new UserRepository(db);
users.create('admin', 'hash', 'admin@example.org', 3);
const alice = players.findOrCreateId('Alice'), bob = players.findOrCreateId('Bob');

// Three 1v1 games on two releases. The same objects feed the replay cache the server loads.
const games = [
    ['g1', '2026-01-01', 26, 'Alice', 300, 100], ['g2', '2026-01-02', 26, 'Alice', 300, 100], ['g3', '2026-01-03', 28, 'Bob', 100, 300],
];
const cacheReplays = {};
for (const [id, date, release, winner, aliceScore, bobScore] of games) {
    const seat = (name, lobby, team) => ({ Name: name, NameWithoutRating: name, LobbyUserId: lobby, Team: team, State: name === winner ? 'won' : 'defeated' });
    replays.insert({
        matchId: id, creationDate: `${date} 10:00:00`, gameRelease: release, filedata: Buffer.from('f'),
        metadata: packBlob(JSON.stringify({ matchID: id, timestamp: 1, settings: { PlayerData: [seat('Alice', alice, 0), seat('Bob', bob, 1)] } })),
    });
    replays.linkLobbyPlayer(id, alice); replays.linkLobbyPlayer(id, bob);
    cacheReplays[id] = {
        isValid: true, directory: id, date, players: ['Alice', 'Bob'], civs: ['athen', 'spart'], mods: ['0ad 0.28.0'],
        scores: [{ [scoreName]: aliceScore }, { [scoreName]: bobScore }], duration: 1800, startingResources: 300, populationCap: 300,
        worldPopulation: false, hasAiPlayers: false, cheatsEnabled: false, revealedMap: false, exploredMap: false, nomad: false,
        teamsSize: { 0: 1, 1: 1 }, mapName: 'Mainland',
    };
}

const { LocalRatingsCache } = dist('local-ratings/Cache.js');
const { LocalRatingsMinifier } = dist('local-ratings/Minifier.js');
const { LocalRatingsRatingsDB } = dist('local-ratings/RatingsDB.js');
const cache = new LocalRatingsCache(), minifier = new LocalRatingsMinifier();
cache.save('replayDatabase', minifier.minifyReplayDatabase(cacheReplays));
new LocalRatingsRatingsDB(cache, minifier).rebuild(cacheReplays);
cache.markAsCurrent();
new (dist('instant-glicko-2/Glicko2Manager.js').Glicko2Manager)(db).rebuild();
db.close();

// ----------------------------------------------------------------------------- run
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const main = async () => {
    const server = spawn(process.execPath, [...process.execArgv, 'dist/index.js'], { cwd: work, env: { ...process.env, JOSE_SECRET: secret, API_PORT: String(port) }, stdio: ['ignore', 'ignore', 'inherit'] });
    let status = 1;
    try {
        const url = `http://localhost:${port}`;
        for (let i = 0; i < 120; i++) {
            try { if ((await fetch(`${url}/swagger/json`)).ok) break; } catch { /* not listening yet */ }
            await sleep(1000);
        }
        const token = await new jose.SignJWT({ role: 3, nick: 'admin', id: 1 }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt()
            .setIssuer('https://replay-pallas-api.wildfiregames.ovh').setAudience('https://replay-pallas-api.wildfiregames.ovh')
            .setExpirationTime('1h').sign(new TextEncoder().encode(secret));
        status = spawnSync(process.execPath, [path.join(__dirname, 'api-smoke.check.js')], { env: { ...process.env, API_URL: url, SMOKE_TOKEN: token }, stdio: 'inherit' }).status ?? 1;
    }
    finally {
        server.kill();
        fs.rmSync(work, { recursive: true, force: true });
    }
    process.exit(status);
};
main();
