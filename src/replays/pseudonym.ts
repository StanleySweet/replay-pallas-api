/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2026 Stanislas Daniel Claude Dolcini
 */

import { createHmac, randomBytes } from "crypto";
import { Database } from "better-sqlite3";

// A nick as the lobby would treat it: Unicode-folded, trimmed, case-insensitive, without the rating.
export const normalizeNick = (nick: string): string => nick.split(/\s+(?=\()/)[0].normalize("NFKC").trim().toLowerCase();

// "~" is not allowed in a lobby nick, so a pseudonym can never be a real one.
const PSEUDONYM = /^Player~[0-9A-F]{8,}$/;
export const isPseudonymShaped = (nick: string): boolean => PSEUDONYM.test(nick);

export class Suppression {
    constructor(private readonly db: Database, private readonly key: string | undefined = process.env.PSEUDONYM_KEY) { }

    get enabled(): boolean { return !!this.key; }

    matcher(nick: string): string {
        return createHmac("sha256", this.key as string).update(normalizeNick(nick)).digest("hex");
    }

    pseudonymOf(nick: string): string | undefined {
        if (!this.enabled)
            return undefined;
        const row = this.db.prepare("SELECT p.pseudonym FROM suppressed_nick n JOIN suppressed_person p ON p.id = n.person_id WHERE n.hmac = ?").get(this.matcher(nick)) as { pseudonym: string } | undefined;
        return row?.pseudonym;
    }

    exists(person: number): boolean {
        return !!this.db.prepare("SELECT 1 FROM suppressed_person WHERE id = ?").get(person);
    }

    // Adds a nick to a person (created on first use). The pseudonym is random, stored, and one byte
    // longer on each clash, so adding an alias never changes it.
    add(nick: string, person?: number): number {
        const hmac = this.matcher(nick);
        const known = this.db.prepare("SELECT person_id FROM suppressed_nick WHERE hmac = ?").get(hmac) as { person_id: number } | undefined;
        if (known)
            return known.person_id;
        let id = person;
        if (id === undefined) {
            for (let bytes = 4; id === undefined; ++bytes) {
                const pseudonym = "Player~" + randomBytes(bytes).toString("hex").toUpperCase();
                id = (this.db.prepare("INSERT INTO suppressed_person (pseudonym) VALUES (?) ON CONFLICT DO NOTHING RETURNING id").get(pseudonym) as { id: number } | undefined)?.id;
            }
        }
        this.db.prepare("INSERT INTO suppressed_nick (hmac, person_id) VALUES (?, ?)").run(hmac, id);
        return id;
    }
}

// Replaces the suppressed nicks in a replay (metadata and the packed files) by their pseudonyms.
// Only the name fields are touched, and a value is replaced only when it is the nick or the nick
// followed by its " (rating)": never inside other text, so "Al" does not hit "Alpha".
export function pseudonymize(value: unknown, suppression: Suppression): unknown {
    const swap = (text: string): string => {
        const nick = text.split(/\s+(?=\()/)[0];
        const pseudonym = suppression.pseudonymOf(nick);
        if (pseudonym)
            return pseudonym + text.slice(nick.length);
        // A real nick shaped like a pseudonym must not land on a pseudonym's player row.
        return isPseudonymShaped(nick) ? nick.replace("~", "-") + text.slice(nick.length) : text;
    };
    const NAME_KEYS = new Set(["Name", "NameWithoutRating", "name"]);
    // JSON text is walked as data, and written back only when a name changed, so a replay without
    // a suppressed player is stored byte for byte as it came.
    const viaJson = (json: string): string => {
        try {
            const before = JSON.parse(json);
            const after = walk(before);
            return JSON.stringify(after) === JSON.stringify(before) ? json : JSON.stringify(after);
        }
        catch { return json; }
    };
    const walk = (node: unknown): unknown => {
        // commands.txt: the first line is "start <json>" and holds the settings with the names.
        if (typeof node === "string")
            return node.trimStart().startsWith("{") ? viaJson(node) : node.replace(/^(start )(\{.*\})/m, (_, head, json) => head + viaJson(json));
        if (Array.isArray(node))
            return node.map(walk);
        if (node && typeof node === "object")
            return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, typeof v === "string" && NAME_KEYS.has(k) ? swap(v) : walk(v)]));
        return node;
    };
    return walk(value);
}
