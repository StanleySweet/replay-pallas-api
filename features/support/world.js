// Each scenario gets its own in-memory database with the real migrations, and the real repositories on it.
const { setWorldConstructor, Before, After } = require('@cucumber/cucumber');
const path = require('path');
const D = require('better-sqlite3');

const root = path.join(__dirname, '..', '..');
const dist = rel => require(path.join(root, 'dist', rel));
const migrations = path.join(root, 'src', 'migrations');

dist('logger.js').logger.level = 'silent';

class World {
    // A game between Alice and Bob, stored as a replay and as an entry of the local ratings replay cache.
    game(id, date, release, winner) {
        const seat = (name, lobby, team) => ({ Name: name, NameWithoutRating: name, LobbyUserId: lobby, Team: team, State: name === winner ? 'won' : 'defeated' });
        const alice = this.players.findOrCreateId('Alice'), bob = this.players.findOrCreateId('Bob');
        this.replays.insert({
            matchId: id, creationDate: `${date} 10:00:00`, gameRelease: release, filedata: Buffer.from('f'),
            metadata: dist('replays/blobCodec.js').packBlob(JSON.stringify({ matchID: id, settings: { PlayerData: [seat('Alice', alice, 0), seat('Bob', bob, 1)] } })),
        });
        this.replays.linkLobbyPlayer(id, alice); this.replays.linkLobbyPlayer(id, bob);
        const scoreName = this.scoreName();
        this.cacheReplays[id] = {
            isValid: true, directory: id, date, players: ['Alice', 'Bob'], civs: ['athen', 'spart'], mods: ['0ad 0.28.0'],
            scores: [{ [scoreName]: winner === 'Alice' ? 300 : 100 }, { [scoreName]: winner === 'Bob' ? 300 : 100 }],
            duration: 1800, startingResources: 300, populationCap: 300, worldPopulation: false, hasAiPlayers: false,
            cheatsEnabled: false, revealedMap: false, exploredMap: false, nomad: false, teamsSize: { 0: 1, 1: 1 }, mapName: 'Mainland',
        };
    }

    // One score weight is enough to give the players different ratings.
    scoreName() {
        const options = require(path.join(root, 'src', 'local-ratings', 'types', 'options.json'));
        const key = options.find(group => group.label === 'Score Weights').options[0].config;
        if (!this.weightSet) {
            const { EngineInstance } = dist('types/Engine.js');
            new (dist('local-ratings/Settings.js').LocalRatingsSettingsManager)().createDefaultSettingsIfNotExist();
            EngineInstance.ConfigDB_CreateValue('user', key, '1');
            this.weightSet = true;
        }
        return key.replace('localratings.weight.', '');
    }
}

setWorldConstructor(World);

Before(function () {
    this.dist = dist;
    this.migrations = migrations;
    this.db = new D(':memory:');
    dist('migrate.js').migrate(this.db, migrations);
    this.db.pragma('foreign_keys = ON');
    dist('types/Engine.js').EngineInstance.SetDataBase(this.db);
    this.replays = new (dist('repositories/ReplayRepository.js').ReplayRepository)(this.db);
    this.players = new (dist('repositories/PlayerRepository.js').PlayerRepository)(this.db);
    this.users = new (dist('repositories/UserRepository.js').UserRepository)(this.db);
    this.localRatings = new (dist('repositories/LocalRatingsRepository.js').LocalRatingsRepository)(this.db);
    this.cache = new (dist('local-ratings/Cache.js').LocalRatingsCache)();
    this.minifier = new (dist('local-ratings/Minifier.js').LocalRatingsMinifier)();
    this.cacheReplays = {};
});

After(function () {
    this.db.close();
});
