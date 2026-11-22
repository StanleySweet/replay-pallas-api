/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Database } from "better-sqlite3";
import { Replays } from "../types/Replay";

type GlickoRow = {
    elo: number,
    deviation: number,
    volatility: number,
    lobby_player_id: number,
    preview_deviation: number,
    match_count: number,
    date: string
};

// The glicko2_rankings table, which Glicko2Manager rebuilds from the replays.
class GlickoRepository {
    constructor(private readonly db: Database) { }

    hasAny(): boolean {
        const { count } = this.db.prepare('Select Count(*) as count From glicko2_rankings;').get() as { count: number };
        return count > 0;
    }

    all<T>(): T[] {
        return this.db.prepare('Select * From glicko2_rankings;').all() as T[];
    }

    clear(): void {
        this.db.prepare('Delete From glicko2_rankings;').run();
    }

    // The replays with exactly two linked players, oldest first: the ones that can be rated.
    ratedPairReplays(): Replays {
        return this.db.prepare('Select r.metadata, r.creation_date From replays r Where 2 = (Select Count(*) From replay_lobby_player_link lp Where lp.match_id = r.match_id LIMIT 1) Order by r.creation_date ASC;').all() as Replays;
    }

    save(rating: GlickoRow): void {
        const { count } = this.db.prepare('Select Count(*) as count From glicko2_rankings Where lobby_player_id = @lobby_player_id and match_count = @match_count;').get({ "match_count": rating.match_count, 'lobby_player_id': rating.lobby_player_id }) as { count: number };
        if (count === 0)
            this.db.prepare('Insert Into glicko2_rankings (elo, deviation, volatility, lobby_player_id, preview_deviation, match_count, date) Values (@elo, @deviation, @volatility, @lobby_player_id, @preview_deviation, @match_count, @date);').run({
                "elo": rating.elo,
                "deviation": rating.deviation,
                "volatility": rating.volatility,
                "match_count": rating.match_count,
                "date": rating.date,
                "lobby_player_id": rating.lobby_player_id,
                "preview_deviation": rating.preview_deviation
            });
        else
            this.db.prepare('Update glicko2_rankings Set elo = @elo, deviation = @deviation, volatility = @volatility, preview_deviation = @preview_deviation Where lobby_player_id = @lobby_player_id and match_count = @match_count;').run({
                "elo": rating.elo,
                "deviation": rating.deviation,
                "volatility": rating.volatility,
                "lobby_player_id": rating.lobby_player_id,
                "preview_deviation": rating.preview_deviation,
                "match_count": rating.match_count,
            });
    }
}

export { GlickoRepository };
export type { GlickoRow };
