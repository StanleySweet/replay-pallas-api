// SPDX-License-Identifier: MIT
// The linear mode() must pick exactly what the old quadratic one picked, ties and empty input included.
//
// Run: npx tsc -p tsconfig.json && node test/mode.check.js
const assert = require('assert');
const { mode } = require('../dist/Utils');
const old = a => a.reduce((x, y, _, arr) => arr.filter(v => v === x).length >= arr.filter(v => v === y).length ? x : y, '');

let seed = 7; const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
let cases = 0;
for (let i = 0; i < 3000; i++) {
    const kinds = 1 + rnd(6), arr = Array.from({ length: rnd(40) }, () => ['', 'walk', 'attack', 'train', 'gather', 'repair'][rnd(kinds)]);
    assert.strictEqual(mode(arr), old(arr), JSON.stringify(arr)); cases++;
}
assert.strictEqual(mode([]), '');
console.log(cases + ' random arrays agree with the old mode()');
// 20000 commands: the old one needs about 4e8 comparisons here.
const big = Array.from({ length: 20000 }, (_, i) => 't' + (i % 7));
const t = Date.now(); mode(big); assert.ok(Date.now() - t < 200, 'mode is slow again');
console.log('20000 commands in ' + (Date.now() - t) + ' ms');
