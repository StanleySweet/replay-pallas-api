/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Database, RunResult } from "better-sqlite3";
import { LatestUser, User, UserDetail } from "../types/User";
import { PlayerStatistics } from "../types/PlayerStatistics";
import EUserRole from "../enumerations/EUserRole";

type StatisticsRow = {
    total_played_time: number,
    match_count: number,
    second_most_used_cmd: string,
    most_used_cmd: string,
    win_rate_ratio: number,
    average_cpm: number,
    modification_date: string,
    lobby_player_id: number
};

// The site accounts (users) and the per-player statistics cache.
class UserRepository {
    constructor(private readonly db: Database) { }

    // users.nick has no UNIQUE constraint, and the duplicates that exist were registered before
    // create refused a taken nick, so this lookup is genuinely ambiguous. Pin it to the oldest
    // account instead of taking whichever row SQLite happens to reach first.
    findOldestByNick(nick: string): User | undefined {
        return this.db.prepare("SELECT id, nick, role FROM users WHERE nick = @nick ORDER BY id LIMIT 1").get({ "nick": nick }) as User | undefined;
    }

    findById(id: number): User | undefined {
        return this.db.prepare('SELECT id, nick, role FROM users WHERE id = @id LIMIT 1').get({ "id": id }) as User | undefined;
    }

    findDetailById(id: number): UserDetail | undefined {
        return this.db.prepare('SELECT id, nick, role, creation_date FROM users WHERE id=@id LIMIT 1').get({ "id": id }) as UserDetail | undefined;
    }

    findByCredentials(email: string, password: string): User[] {
        return this.db.prepare("SELECT id, nick, role FROM users WHERE email = @email and password = @password LIMIT 1").all({ "email": email, "password": password }) as User[];
    }

    // The /metrics Basic auth account.
    findMetricsAccount(nick: string, password: string): { id: number, role: number } | undefined {
        return this.db.prepare("SELECT id, role FROM users WHERE nick = @nick AND password = @password LIMIT 1").get({ nick: nick, password: password }) as { id: number, role: number } | undefined;
    }

    latest(): LatestUser[] {
        return this.db.prepare('SELECT id, nick, role, creation_date FROM users ORDER BY modification_date DESC LIMIT 10').all() as LatestUser[];
    }

    all(): User[] {
        return this.db.prepare('SELECT id, nick, role FROM users').all() as User[];
    }

    setRole(id: number, role: EUserRole): void {
        this.db.prepare("Update users Set role = @role where id = @id").run({ "id": id, "role": role });
    }

    // Only registered accounts count. Plenty of nicks exist in lobby_players for people who never
    // made an account, and those must stay registrable. NOCASE folds ASCII only, which is the
    // whole alphabet 0 A.D. nicks use.
    isNickTaken(nick: string): boolean {
        return !!this.db.prepare("SELECT id FROM users WHERE nick = @nick COLLATE NOCASE LIMIT 1").get({ "nick": nick });
    }

    create(nick: string, password: string, email: string, role: EUserRole): void {
        this.db.prepare(`INSERT INTO users (nick, password, email, role) VALUES(@nick, @password, @email, @role)`).run({
            "nick": nick,
            "password": password,
            "email": email,
            "role": role,
        });
    }

    // The account, then its uploader links, are removed in that order's reverse: the links first.
    deleteWithLinks(id: number): [RunResult, RunResult] {
        const links = this.db.prepare('DELETE FROM replay_user_link WHERE user_id = @userId').run({ "userId": id });
        const user = this.db.prepare('DELETE FROM users WHERE id = @userId').run({ "userId": id });
        return [links, user];
    }

    // The statistics cache row for a player, only while it is less than a day old.
    freshStatistics(lobbyPlayerId: number): PlayerStatistics | undefined {
        return this.db.prepare(`
    SELECT * FROM user_statistics_cache
    WHERE lobby_player_id = @id
    AND modification_date >= datetime('now', '-1 day')
    `).get({ "id": lobbyPlayerId }) as PlayerStatistics | undefined;
    }

    saveStatistics(row: StatisticsRow): void {
        const { count } = this.db.prepare(`
        Select Count(*) as count
        From user_statistics_cache
        Where lobby_player_id = @lobby_player_id;`)
            .get({ 'lobby_player_id': row.lobby_player_id }) as { count: number };

        if (count === 0)
            this.db.prepare(`Insert Into user_statistics_cache (total_played_time, match_count, second_most_used_cmd, most_used_cmd, win_rate_ratio, average_cpm, lobby_player_id)
            Values (@total_played_time, @match_count, @second_most_used_cmd, @most_used_cmd, @win_rate_ratio, @average_cpm, @lobby_player_id);
            `).run({
                "total_played_time": row.total_played_time,
                "match_count": row.match_count,
                "second_most_used_cmd": row.second_most_used_cmd,
                "most_used_cmd": row.most_used_cmd,
                "win_rate_ratio": row.win_rate_ratio,
                "average_cpm": row.average_cpm,
                "lobby_player_id": row.lobby_player_id,
                "modification_date": row.modification_date,
                "creation_date": row.modification_date
            });
        else
            this.db.prepare(`
            Update user_statistics_cache
            Set total_played_time = @total_played_time, match_count = @match_count, second_most_used_cmd = @second_most_used_cmd, most_used_cmd = @most_used_cmd, win_rate_ratio = @win_rate_ratio, average_cpm = @average_cpm, modification_date = @modification_date
            Where lobby_player_id = @lobby_player_id`).run({
                "total_played_time": row.total_played_time,
                "match_count": row.match_count,
                "second_most_used_cmd": row.second_most_used_cmd,
                "most_used_cmd": row.most_used_cmd,
                "win_rate_ratio": row.win_rate_ratio,
                "average_cpm": row.average_cpm,
                "modification_date": row.modification_date,
                "lobby_player_id": row.lobby_player_id,
            });
    }
}

export { UserRepository };
export type { StatisticsRow };
