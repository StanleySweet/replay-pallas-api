/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Database } from "better-sqlite3";
import { Replays } from "../types/Replay";

// A replay row as the glicko rebuild reads it.
type RatedReplay = Replays[number] & { game_release: number | null };

type GlickoRow = {
    elo: number,
    deviation: number,
    volatility: number,
    lobby_player_id: number,
    preview_deviation: number,
    match_count: number,
    date: string,
    game_release: number | null
};

// The glicko2_rankings table, which Glicko2Manager rebuilds from the replays.
class GlickoRepository {
    constructor(private readonly db: Database) { }

    hasAny(): boolean {
        const { count } = this.db.prepare('Select Count(*) as count From glicko2_rankings;').get() as { count: number };
        return count > 0;
    }

    hasAnyRelease(): boolean {
        return !!this.db.prepare('Select 1 From glicko2_rankings Where game_release Is Not Null Limit 1;').get();
    }

    all<T>(): T[] {
        return this.db.prepare('Select * From glicko2_rankings;').all() as T[];
    }

    // Each player's latest rating in one set (null: rated over every replay), best first, by rating or by
    // the conservative rating (rating - 2 deviations), which keeps a player with one lucky game and a huge
    // deviation below the regulars. Players with fewer than minGames rated games are left out. The latest row
    // of a player is the one with the highest match_count.
    leaderboard(release: number | null, minGames = 1, conservative = false): { lobby_player_id: number, nick: string, elo: number, deviation: number, match_count: number }[] {
        return this.db.prepare(`
        Select g.lobby_player_id, lp.nick, g.elo, g.deviation, g.match_count
        From glicko2_rankings g
        Inner Join lobby_players lp On lp.id = g.lobby_player_id
        Where g.game_release Is @release
          And g.match_count = (Select Max(g2.match_count) From glicko2_rankings g2 Where g2.lobby_player_id = g.lobby_player_id And g2.game_release Is @release)
          And g.match_count >= @minGames
        Order By ${conservative ? 'g.elo - 2 * g.deviation' : 'g.elo'} Desc, g.match_count Desc;`).all({ release, minGames }) as { lobby_player_id: number, nick: string, elo: number, deviation: number, match_count: number }[];
    }

    clear(): void {
        this.db.prepare('Delete From glicko2_rankings;').run();
    }

    // The replays with exactly two linked players, oldest first: the ones that can be rated.
    ratedPairReplays(): RatedReplay[] {
        return this.db.prepare('Select r.metadata, r.creation_date, r.game_release From replays r Where 2 = (Select Count(*) From replay_lobby_player_link lp Where lp.match_id = r.match_id LIMIT 1) Order by r.creation_date ASC;').all() as RatedReplay[];
    }

    save(rating: GlickoRow): void {
        const { count } = this.db.prepare('Select Count(*) as count From glicko2_rankings Where lobby_player_id = @lobby_player_id and match_count = @match_count and game_release IS @game_release;').get({ "match_count": rating.match_count, 'lobby_player_id': rating.lobby_player_id, 'game_release': rating.game_release }) as { count: number };
        if (count === 0)
            this.db.prepare('Insert Into glicko2_rankings (elo, deviation, volatility, lobby_player_id, preview_deviation, match_count, date, game_release) Values (@elo, @deviation, @volatility, @lobby_player_id, @preview_deviation, @match_count, @date, @game_release);').run({
                "elo": rating.elo,
                "deviation": rating.deviation,
                "volatility": rating.volatility,
                "match_count": rating.match_count,
                "date": rating.date,
                "lobby_player_id": rating.lobby_player_id,
                "preview_deviation": rating.preview_deviation,
                "game_release": rating.game_release
            });
        else
            this.db.prepare('Update glicko2_rankings Set elo = @elo, deviation = @deviation, volatility = @volatility, preview_deviation = @preview_deviation Where lobby_player_id = @lobby_player_id and match_count = @match_count and game_release IS @game_release;').run({
                "elo": rating.elo,
                "deviation": rating.deviation,
                "volatility": rating.volatility,
                "lobby_player_id": rating.lobby_player_id,
                "preview_deviation": rating.preview_deviation,
                "match_count": rating.match_count,
                "game_release": rating.game_release,
            });
    }
}

export { GlickoRepository };
export type { GlickoRow, RatedReplay };
