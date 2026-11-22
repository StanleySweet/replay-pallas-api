// SPDX-License-Identifier: MIT
// Checks the commands.txt parsers on a tiny synthetic replay (no real player names).
//
// Run: npx tsc -p tsconfig.json && node test/commands-parser.check.js
const assert = require('assert');
const { extract_commands_data, extract_commands_stats } = require('../dist/replays/commandsParser');

const start = { settings: { PlayerData: [{ Name: 'Alice (1500)' }, { Name: 'Bob (1400)' }] }, mapPreview: 'a:b:maps/x.png' };
const commands = [
    'start ' + JSON.stringify(start),
    'turn 0 200', 'cmd 1 {"type":"walk"}', 'cmd 2 {"type":"attack"}', 'end',
    'turn 1 200', 'cmd 1 {"type":"walk"}', 'cmd 1 {"type":"train"}', 'end',
    'turn 2 200', 'end',
].join('\r\n');

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

check('data: per-player commands, derived stats and duration', () => {
    const d = extract_commands_data(commands);
    const [a, b] = d.settings.PlayerData;
    assert.strictEqual(a.NameWithoutRating, 'Alice');
    assert.strictEqual(a.Commands.length, 3);
    assert.strictEqual(b.Commands.length, 1);
    assert.strictEqual(a.MostUsedCmd, 'walk');
    assert.strictEqual(d.settings.NbTurns, 2);
    assert.strictEqual(d.settings.MatchDuration, 0.4);
    assert.strictEqual(d.previewImage, 'maps/x.png');
});

check('data: empty or settings-less input gives null, not a throw', () => {
    assert.strictEqual(extract_commands_data(''), null);
    assert.strictEqual(extract_commands_data('start {}'), null);
});

check('stats: commands per turn, zero-filled, names without rating', () => {
    const s = extract_commands_stats(JSON.stringify({ 'commands.txt': commands }));
    assert.deepStrictEqual(s.turns, [0, 1, 2]);
    assert.deepStrictEqual(s.playerCommandDatas[0].playerCommands, [1, 2, 0]);
    assert.deepStrictEqual(s.playerCommandDatas[1].playerCommands, [1, 0, 0]);
    assert.strictEqual(s.playerCommandDatas[1].playerName, 'Bob');
});

console.log(passed + ' checks passed');
