/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2026 Stanislas Daniel Claude Dolcini
 */

import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const derive = promisify(scrypt) as (password: string, salt: Buffer, length: number) => Promise<Buffer>;
const LENGTH = 32;

// "scrypt$<salt>$<hash>", both hex: a fresh salt for every password.
export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    return `scrypt$${salt.toString("hex")}$${(await derive(password.normalize("NFKC"), salt, LENGTH)).toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const [kind, salt, hash] = stored.split("$");
    if (kind !== "scrypt" || !salt || !hash)
        return false;
    const expected = Buffer.from(hash, "hex");
    const actual = await derive(password.normalize("NFKC"), Buffer.from(salt, "hex"), expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export interface Account { id: number, nick: string, role: number, password: string, password_hash: string | null }

// "ok": logged in. "upgrade": logged in with the old hash, and the plain password was sent, so the
// account can move to password_hash. "no": refused.
export async function checkLogin(account: Account, password: string, legacy: string | undefined): Promise<"ok" | "upgrade" | "no"> {
    if (account.password_hash)
        return await verifyPassword(password, account.password_hash) ? "ok" : "no";
    // Not moved yet. A browser from before this change sends the old hash as the password; a new one
    // sends the plain password and the old hash beside it. An emptied legacy value never matches.
    const oldHash = legacy ?? password;
    const matches = !!account.password && account.password.length === oldHash.length && timingSafeEqual(Buffer.from(account.password), Buffer.from(oldHash));
    if (!matches)
        return "no";
    return legacy === undefined ? "ok" : "upgrade";
}
