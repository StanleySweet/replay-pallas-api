// SPDX-License-Identifier: MIT
// Boots the API on a small seeded database, with no real data and a made up secret. Shared by
// run-smoke.js and the Gherkin features that go through HTTP.
//
// Needs a build (npx tsc -p tsconfig.json). Users: admin (id 1, role 3), Alice (id 2, role 1).
// Three 1v1 games between Alice and Bob: g1 and g2 on release 26 (Alice won), g3 on release 28 (Bob won).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const D = require('better-sqlite3');
const jose = require('jose');

const root = path.join(__dirname, '..', '..');
const dist = rel => require(path.join(root, 'dist', rel));
const secret = 'smoke-secret';


const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Seeds a scratch copy of the layout the server expects, starts it, waits until it answers.
const startSeededServer = async (port = 18099) => {
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
    const options = require('../../src/local-ratings/types/options.json');
    const weightKey = options.find(group => group.label === 'Score Weights').options[0].config;
    EngineInstance.ConfigDB_CreateValue('user', weightKey, '1');
    const scoreName = weightKey.replace('localratings.weight.', '');

    const { ReplayRepository } = dist('repositories/ReplayRepository.js');
    const { PlayerRepository } = dist('repositories/PlayerRepository.js');
    const { UserRepository } = dist('repositories/UserRepository.js');
    const { packBlob } = dist('replays/blobCodec.js');
    const replays = new ReplayRepository(db), players = new PlayerRepository(db), users = new UserRepository(db);
    users.create('admin', 'hash', 'admin@example.org', 3);
    users.create('Alice', 'hash', 'alice@example.org', 1);
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
    // Mallory asked to be erased: a replay she plays is stored under her pseudonym.
    new (dist('replays/pseudonym.js').Suppression)(db, 'smoke-key').add('Mallory');
    db.close();

    const server = spawn(process.execPath, [...process.execArgv, 'dist/index.js'], { cwd: work, env: { ...process.env, JOSE_SECRET: secret, PSEUDONYM_KEY: 'smoke-key', API_PORT: String(port) }, stdio: ['ignore', 'ignore', 'inherit'] });
    const url = `http://localhost:${port}`;
    for (let i = 0; i < 120; i++) {
        try { if ((await fetch(`${url}/swagger/json`)).ok) break; } catch { /* not listening yet */ }
        await sleep(1000);
    }
    const token = (role, nick = 'admin', id = 1) => new jose.SignJWT({ role, nick, id }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt()
        .setIssuer('https://replay-pallas-api.wildfiregames.ovh').setAudience('https://replay-pallas-api.wildfiregames.ovh')
        .setExpirationTime('1h').sign(new TextEncoder().encode(secret));
    const stop = () => { server.kill(); fs.rmSync(work, { recursive: true, force: true }); };
    return { url, token, stop };
};

module.exports = { startSeededServer };
