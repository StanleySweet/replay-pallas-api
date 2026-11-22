/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Database } from "better-sqlite3";

// The lobby players: the pseudonyms that appear in replays.
class PlayerRepository {
    constructor(private readonly db: Database) { }

    findOrCreateId(nick: string): number {
        const find = () => this.db.prepare("Select id From lobby_players where nick = @nick LIMIT 1;").get({ "nick": nick }) as { id: number } | undefined;
        let existing = find();
        if (!existing) {
            this.db.prepare("Insert Into lobby_players (nick) Values (@nick)").run({ "nick": nick });
            existing = find() as { id: number };
        }
        return existing.id;
    }
}

export { PlayerRepository };
