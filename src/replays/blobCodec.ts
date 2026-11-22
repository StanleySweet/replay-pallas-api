/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { brotliCompressSync, brotliDecompressSync, constants } from "zlib";
import snappy from "snappy";

// New blobs start with these two bytes, then a brotli stream. A snappy stream starts with the
// uncompressed length as a varint, and a length of 0 is never stored, so the prefix cannot be
// mistaken for an old snappy blob. Old blobs stay readable until they are rewritten.
const BROTLI_PREFIX = Buffer.from([0x00, 0x01]);

// Quality 5 is within about 15% of quality 9 at a tenth of the time, which keeps the admin rebuild fast.
const BROTLI_QUALITY = 5;

function isBrotliBlob(blob: Buffer): boolean {
    return blob.length > BROTLI_PREFIX.length && blob.subarray(0, BROTLI_PREFIX.length).equals(BROTLI_PREFIX);
}

function packBlob(text: string): Buffer {
    const input = Buffer.from(text, "utf8");
    const packed = brotliCompressSync(input, {
        params: {
            [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
            [constants.BROTLI_PARAM_LGWIN]: 24,
            [constants.BROTLI_PARAM_SIZE_HINT]: input.length
        }
    });
    return Buffer.concat([BROTLI_PREFIX, packed]);
}

function unpackBlob(blob: Buffer | string): string {
    const buffer = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
    if (isBrotliBlob(buffer))
        return brotliDecompressSync(buffer.subarray(BROTLI_PREFIX.length)).toString("utf8");

    return snappy.uncompressSync(buffer, { asBuffer: false }) as string;
}

export { isBrotliBlob, packBlob, unpackBlob };
