// The API booted once on a small seeded database (test/support/seeded-server.js) for the features that go
// through HTTP, and stopped after the last scenario.
const { Before, AfterAll, setDefaultTimeout } = require('@cucumber/cucumber');
const path = require('path');
const AdmZip = require('adm-zip');

setDefaultTimeout(60 * 1000);

let started;
const server = () => started ??= require(path.join('..', '..', 'test', 'support', 'seeded-server')).startSeededServer(Number(process.env.FEATURE_PORT || 18097));

Before({ tags: '@http' }, async function () {
    const running = await server();
    this.api = running.url;
    this.sign = running.token;
    this.token = undefined;
    this.get = async (url, headers = {}) => this.last = await this.fetch(url, { headers });
    this.fetch = async (url, options = {}) => {
        const headers = { ...(options.headers ?? {}), ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) };
        const response = await fetch(this.api + url, { ...options, headers });
        const text = await response.text();
        let body = text;
        try { body = JSON.parse(text); } catch { /* not JSON */ }
        return { status: response.status, body };
    };
    // A replay as the game exports it: a folder-less zip with metadata.json and commands.txt.
    this.zipOf = (matchID, release, players) => {
        const seats = players.map((name, team) => ({ Name: name, NameWithoutRating: name, Team: team }));
        const states = [{ state: 'gaia' }, ...players.map((_, index) => ({ state: index === 0 ? 'won' : 'defeated' }))];
        const metadata = { matchID, timestamp: 1700000000, mods: [{ name: '0ad', version: release }], settings: { PlayerData: seats, MatchDuration: 600 }, playerStates: states };
        const zip = new AdmZip();
        zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata)));
        zip.addFile('commands.txt', Buffer.from(`start ${JSON.stringify({ settings: { PlayerData: seats } })}\r\nturn 0 200\r\ncmd 1 {"type":"walk"}\r\nend`));
        return zip.toBuffer();
    };
    this.upload = async buffer => {
        const form = new FormData();
        form.append('file', new Blob([buffer]), 'replay.zip');
        return this.last = await this.fetch('/replays/upload-zip', { method: 'POST', body: form });
    };
});

AfterAll(async function () { if (started) (await started).stop(); });

module.exports = { server };
