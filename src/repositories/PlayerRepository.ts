/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Database } from "better-sqlite3";
import { GlickoElo, User, UserDetail } from "../types/User";
import { Replays } from "../types/Replay";

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

    all(): User[] {
        return this.db.prepare('SELECT id, nick, 0 as role FROM lobby_players').all() as User[];
    }

    findById(id: number): UserDetail | undefined {
        return this.db.prepare('SELECT id, nick, creation_date FROM lobby_players WHERE id=@id LIMIT 1').get({ "id": id }) as UserDetail | undefined;
    }

    // The lobby player that has the same nick as a site account.
    idForUser(userId: number): number | undefined {
        return (this.db.prepare(`
    Select lp.id From users u
    Inner Join lobby_players lp
    On lp.nick = u.nick  Where u.id = @id`).get({ "id": userId }) as { id: number } | undefined)?.id;
    }

    rankingHistory(lobbyPlayerId: number): { "elo": number, "date": string }[] {
        return this.db.prepare("Select elo, date From lobby_ranking_history Where lobby_player_id = @lobby_player_id").all({
            "lobby_player_id": lobbyPlayerId,
        }) as { "elo": number, "date": string }[];
    }

    // release null is the rating over every replay, a number the rating over that 0 A.D. release only.
    glickoHistory(lobbyPlayerId: number, release: number | null = null): GlickoElo[] {
        return this.db.prepare("Select elo, date, deviation, volatility, preview_deviation, match_count From glicko2_rankings Where lobby_player_id = @lobby_player_id And game_release IS @release").all({
            "lobby_player_id": lobbyPlayerId,
            "release": release,
        }) as GlickoElo[];
    }

    // One page of the replays a lobby player is in. The metadata is left out when the caller
    // already has the player's statistics cached.
    replaysPage(lobbyPlayerId: number, withMetadata: boolean, offset: number): Replays {
        return this.db.prepare(`
        Select r.match_id ${withMetadata ? ", r.metadata" : ""} From lobby_players lp
        Inner Join replay_lobby_player_link rlp
        On lp.id = rlp.lobby_player_id
        Inner Join replays r
        On r.match_id = rlp.match_id
        Where lp.id = @id
        LIMIT 50
        OFFSET @offset;
        `).all({ "id": lobbyPlayerId, "offset": offset }) as Replays;
    }

    // Same, joined through users. The id is matched against users.id, and the account page passes the
    // lobby player id here, which looks wrong: kept as it was so the refactor changes no behaviour.
    replaysPageForUser(lobbyPlayerId: number | undefined, withMetadata: boolean, offset: number): Replays {
        return this.db.prepare(`
        Select r.match_id ${withMetadata ? ", r.metadata" : ""} From users u
        Inner Join lobby_players lp
        On lp.nick = u.nick
        Inner Join replay_lobby_player_link rlp
        On lp.id = rlp.lobby_player_id
        Inner Join replays r
        On r.match_id = rlp.match_id
        Where u.id = @id
        LIMIT 50
        OFFSET @offset;
        `).all({ "id": lobbyPlayerId, "offset": offset }) as Replays;
    }
}

export { PlayerRepository };
