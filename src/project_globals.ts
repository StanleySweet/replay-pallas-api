/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

const joseSecret = process.env.JOSE_SECRET;

if (!joseSecret)
    throw new Error('JOSE_SECRET environment variable is not set. Refusing to start with a publicly known signing key.');

export const JOSE_SECRET: Uint8Array = new TextEncoder().encode(joseSecret);
export const JOSE_ALG = 'HS256';

