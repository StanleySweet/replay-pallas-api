/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Database } from "better-sqlite3";
import { Civilizations } from "../types/Civilization";
import { GlickoElo, LatestUser } from "../types/User";

// The reads behind the local-ratings pages. The local-ratings caches themselves go through
// local-ratings/Cache.ts, which is their only access point.
class LocalRatingsRepository {
    constructor(private readonly db: Database) { }

    civilizations(): Civilizations {
        return this.db.prepare("Select key from civilizations;").all() as Civilizations;
    }

    nicksInReplay(matchId: string): { nick: string }[] {
        return this.db
            .prepare('SELECT DISTINCT lp.nick AS nick FROM replay_lobby_player_link rlpl JOIN lobby_players lp ON lp.id = rlpl.lobby_player_id WHERE rlpl.match_id = @matchId')
            .all({ matchId }) as { nick: string }[];
    }

    // Nicks come from uploaded replay metadata, so any contributor controls them: one bound
    // parameter per nick, never concatenated into the statement.
    playersByNicks(nicks: string[]): LatestUser[] {
        return this.db.prepare(`SELECT lp.id, lp.nick, (CASE  when u.role IS  Null then 0 else u.role END)
    as role, CASE When u.creation_date is null then lp.creation_date else lp.creation_date End as creation_date FROM lobby_players lp
    Left Join users u on u.nick = lp.nick
    Where lp.nick in (${nicks.map(() => "?").join(', ')})`).all(...nicks) as LatestUser[];
    }

    // Glicko 2 is tracked per lobby player, the local ratings per nick, so the two only meet
    // through lobby_players.nick. Players without a rated match yet have no row at all.
    latestGlicko(nick: string): GlickoElo | undefined {
        return this.db.prepare('SELECT elo, deviation, match_count FROM glicko2_rankings Where lobby_player_id = (SELECT id FROM lobby_players Where nick = @nick) Order By date desc, id desc Limit 1;').get({ "nick": nick }) as GlickoElo | undefined;
    }

    // The in-game ladder rating is a different number from the glicko one.
    latestGameElo(nick: string): { "elo": number } | undefined {
        return this.db.prepare('SELECT elo FROM lobby_ranking_history Where lobby_player_id = (SELECT id FROM lobby_players Where nick = @nick) Order By date desc, id desc Limit 1;').get({ "nick": nick }) as { "elo": number } | undefined;
    }
}

export { LocalRatingsRepository };
