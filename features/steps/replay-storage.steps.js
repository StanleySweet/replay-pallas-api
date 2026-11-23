const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert');
const snappy = require('snappy');

// ---- stored files
Given('the uploaded files of a replay, with accents and Windows line endings', function () {
    this.text = JSON.stringify({ 'commands.txt': 'start {"é":1}\r\n' + 'turn 1 200\r\ncmd 1 {"type":"walk"}\r\n'.repeat(5000), 'metadata.json': '{"é":"日本語"}' });
});
Given('the uploaded files of a replay stored in the old snappy format', function () {
    this.text = JSON.stringify({ 'commands.txt': 'start {}\r\n' + 'turn 1 200\r\n'.repeat(2000) });
    this.old = snappy.compressSync(this.text);
});
When('they are stored and read back', function () {
    const { packBlob, unpackBlob } = this.dist('replays/blobCodec.js');
    this.packed = packBlob(this.text);
    this.back = unpackBlob(this.packed);
});
Then('the text is identical', function () { assert.strictEqual(this.back, this.text); });
Then('they take less space than the old snappy format', function () { assert.ok(this.packed.length < snappy.compressSync(Buffer.from(this.text)).length); });
Then('they are read as before', function () {
    const { isBrotliBlob, unpackBlob } = this.dist('replays/blobCodec.js');
    assert.ok(!isBrotliBlob(this.old));
    assert.strictEqual(unpackBlob(this.old), this.text);
});
Then('rewriting them in the new format keeps the text identical', function () {
    const { packBlob, unpackBlob } = this.dist('replays/blobCodec.js');
    assert.strictEqual(unpackBlob(packBlob(unpackBlob(this.old))), this.text);
});

// ---- the commands of a game
Given('the commands of a game where Alice gives {int} orders and Bob gives {int}', function (alice, bob) {
    const start = { settings: { PlayerData: [{ Name: 'Alice (1500)' }, { Name: 'Bob (1400)' }] }, mapPreview: 'a:b:maps/x.png' };
    const lines = ['start ' + JSON.stringify(start)];
    for (let i = 0; i < Math.max(alice, bob); i++) {
        lines.push(`turn ${i} 200`);
        if (i < alice) lines.push('cmd 1 {"type":"walk"}');
        if (i < bob) lines.push('cmd 2 {"type":"attack"}');
        lines.push('end');
    }
    this.commands = lines.join('\r\n');
});
When('the commands are read', function () { this.data = this.dist('replays/commandsParser.js').extract_commands_data(this.commands); });
Then("Alice's order count is {int} and Bob's is {int}", function (alice, bob) {
    assert.strictEqual(this.data.settings.PlayerData[0].NumberOfCommands, alice);
    assert.strictEqual(this.data.settings.PlayerData[1].NumberOfCommands, bob);
});
Then('no list of commands is kept', function () { assert.strictEqual(this.data.settings.PlayerData[0].Commands, undefined); });
Then("Alice's most used order is {string}", function (order) { assert.strictEqual(this.data.settings.PlayerData[0].MostUsedCmd, order); });

// ---- the most used order
const earlier = array => array.reduce((x, y, _, all) => all.filter(v => v === x).length >= all.filter(v => v === y).length ? x : y, '');
Given('{int} random lists of orders', function (count) {
    let seed = 7;
    const random = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    this.lists = Array.from({ length: count }, () => {
        const kinds = 1 + random(6);
        return Array.from({ length: random(40) }, () => ['', 'walk', 'attack', 'train', 'gather', 'repair'][random(kinds)]);
    });
});
Then('the most used order agrees with the earlier calculation for every list', function () {
    const { mode } = this.dist('Utils.js');
    for (const list of this.lists)
        assert.strictEqual(mode(list), earlier(list), JSON.stringify(list));
});
Then('{int} orders are counted in a few milliseconds', function (count) {
    const { mode } = this.dist('Utils.js');
    const orders = Array.from({ length: count }, (_, i) => 't' + (i % 7));
    const start = Date.now();
    mode(orders);
    assert.ok(Date.now() - start < 200, 'mode is slow again');
});
