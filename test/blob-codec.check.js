// SPDX-License-Identifier: MIT
// Checks that new blobs are brotli, old snappy blobs still read, and a repack changes no byte.
//
// Run: npx tsc -p tsconfig.json && node test/blob-codec.check.js
const assert = require('assert');
const snappy = require('snappy');
const { packBlob, unpackBlob, isBrotliBlob } = require('../dist/replays/blobCodec');

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('  ok  ' + name); };

const text = JSON.stringify({ 'commands.txt': 'start {"a":1}\r\n' + 'turn 1 200\r\ncmd 1 {"type":"walk"}\r\n'.repeat(5000), 'metadata.json': '{"é":"日本語"}' });

check('round trip is byte-exact, unicode and CRLF included', () => {
    assert.strictEqual(unpackBlob(packBlob(text)), text);
});

check('new blobs are brotli and smaller than snappy', () => {
    const packed = packBlob(text);
    assert.ok(isBrotliBlob(packed));
    assert.ok(packed.length < snappy.compressSync(Buffer.from(text)).length);
});

check('old snappy blobs are still readable and not mistaken for brotli', () => {
    const old = snappy.compressSync(text);
    assert.ok(!isBrotliBlob(old));
    assert.strictEqual(unpackBlob(old), text);
});

check('repacking an old blob keeps the text identical', () => {
    assert.strictEqual(unpackBlob(packBlob(unpackBlob(snappy.compressSync(text)))), text);
});

console.log(passed + ' checks passed');
