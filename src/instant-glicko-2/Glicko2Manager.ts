/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Database } from 'better-sqlite3';
import { Replays } from '../types/Replay';
import { unpackBlob } from "../replays/blobCodec";
import { GlickoRepository } from "../repositories/GlickoRepository";
import { RatingCalculator } from './RatingCalculator';
import { RatingCalculatorSettings } from './RatingCalculatorSettings';
import { Rating } from './Rating';
import { GameRatingPeriodResults } from './RatingPeriodResults';
import { logger } from '../logger';
import { GameResult } from './GameResult';
import { PlayerData } from '../types/PlayerData';

declare module 'fastify' {
    interface FastifyInstance {
        glicko2Manager: Glicko2Manager
    }
}

class PallasGlickoRating {
    "id": number;
    "elo": number;
    "deviation": number;
    "volatility": number;
    "lobby_player_id": number;
    "match_count": number;
    "preview_deviation": number;
    "date":string;
    // null: rated over every replay. A number: rated over the replays of that 0 A.D. release only.
    "game_release": number | null;
}


// PlayerDataSchema is .partial(), so narrow the one field the pairing relies on.
type RatedPlayer = PlayerData & { NameWithoutRating: string };

/**
 * Decide which two players a replay actually rates, and which of them won.
 *
 * The rebuild query selects replays having exactly two lobby players, but that
 * only counts humans: it does NOT mean they played against each other. Two
 * humans on the same team pass that gate while there is no individual result,
 * so rating one against the other punished a player for playing alongside a
 * teammate. AI players are also in PlayerData but not in the lobby links, so
 * the two humans have to be found by filtering rather than by index - the
 * previous code read playerData[0] and playerData[1] blindly, which happened to
 * be correct for every replay in the corpus and would stop being correct the
 * first time a human was not seated first.
 */
function getRatedPair(playerData: PlayerData[] | undefined): { winner: RatedPlayer, loser: RatedPlayer } | undefined {
    const humans = (playerData ?? []).filter((a): a is RatedPlayer => !!a && !a.AI && !!a.NameWithoutRating);

    if (humans.length !== 2)
        return undefined;

    const [first, second] = humans;

    // Same real team means allies. Team -1 is free-for-all, where they are
    // opponents. A missing Team cannot prove anything, so it is not excluded.
    if (first.Team !== undefined && first.Team >= 0 && first.Team === second.Team)
        return undefined;

    // Neither human won, so whoever lost lost to a computer. There is no human opponent.
    if (first.State !== "won" && second.State !== "won")
        return undefined;

    return second.State === "won"
        ? { winner: second, loser: first }
        : { winner: first, loser: second };
}

class Glicko2Manager {
    database: Database;
    store: GlickoRepository;
    ratings: PallasGlickoRating[];
    calculator: RatingCalculator;
    rebuilding: boolean;
    constructor(database: Database) {
        const settings: RatingCalculatorSettings = new RatingCalculatorSettings();
        // Chosen so a typical player's RD goes from 60 -> 110 in 1 year
        settings.RatingPeriodsPerDay = 0.21436;
        this.calculator = new RatingCalculator(settings);
        this.database = database;
        this.store = new GlickoRepository(database);
        this.ratings = [];
        this.rebuilding = false;
    }

    hasCache(): boolean {
        return this.store.hasAny();
    }

    load(): void {
        this.ratings = this.store.all<PallasGlickoRating>();
        logger.info(`Loading the glicko2 database. ${this.ratings.length} ratings(s) were loaded for ${new Set(this.ratings.map(a => a.lobby_player_id)).size} player(s).`);
    }

    process_replays(replays: Replays, release: number | null = null): void {
        const players: Map<string, Rating> = new Map<string, Rating>();
        const playersIds: Map<string, number> = new Map<string, number>();
        const playersMatchCount: Map<string, number> = new Map<string, number>();
        const matches: GameResult[] = [];
        
        for (const element of replays) {
            if (Buffer.isBuffer(element.metadata))
                element.metadata = JSON.parse(unpackBlob(element.metadata as Buffer));

            const date_string = element.creation_date + "";
            if (typeof element.creation_date === 'string' || element.creation_date instanceof String)
                element.creation_date = new Date(element.creation_date as unknown as string);
            const playerData = element.metadata.settings?.PlayerData;

            const rated = getRatedPair(playerData);
            if (!rated)
                continue;

            {
                const winnerData = rated.winner;
                const loserData = rated.loser;

                const player0Name = winnerData.NameWithoutRating;
                if (!players.has(player0Name)) {
                    players.set(player0Name, new Rating(Rating.defaultRating, Rating.defaultDeviation, Rating.defaultVolatility, 0, element.creation_date));
                    playersIds.set(player0Name, winnerData.LobbyUserId as number);
                }

                const gPlayer1: Rating = players.get(player0Name) as Rating;
                gPlayer1.numberOfResults = 0;
                gPlayer1.lastRatingPeriodEnd = element.creation_date;
    
                const player1Name = loserData.NameWithoutRating;

                if (!players.has(player1Name)) {
                    players.set(player1Name, new Rating(Rating.defaultRating, Rating.defaultDeviation, Rating.defaultVolatility, 0, element.creation_date));
                    playersIds.set(player1Name, loserData.LobbyUserId as number);
                }

                const gPlayer2 = players.get(player1Name) as Rating;
                gPlayer2.numberOfResults = 0;
                gPlayer2.lastRatingPeriodEnd = element.creation_date;

                playersMatchCount.set(player0Name, (playersMatchCount.get(player0Name) ?? 0) + 1);
                playersMatchCount.set(player1Name, (playersMatchCount.get(player1Name) ?? 0) + 1);

                matches.push(new GameResult(gPlayer1, gPlayer2, false));
                const matchList: GameRatingPeriodResults = new GameRatingPeriodResults(matches);
                this.calculator.updateRatings(matchList, true);
                for (const [key, value] of players) {
                    this.ratings.push(Object.assign(new PallasGlickoRating(), {
                        "elo": value.rating,
                        "deviation": value.ratingDeviation,
                        "volatility": value.volatility,
                        "lobby_player_id": playersIds.get(key),
                        "match_count": playersMatchCount.get(key),
                        "date": date_string,
                        "game_release": release,
                        "preview_deviation": this.calculator.previewDeviation(value, new Date(), false) ?? Rating.defaultDeviation
                    }));
                }
            }
        }

        logger.info(`The glicko2 database has been rebuilt. ${this.ratings.length} ratings(s) were found for ${playersIds.size} player(s).`);
    }

    rebuild(): void {
        if (this.rebuilding)
            return;
        try {
            this.rebuilding = true;
            this.store.clear();
            const replays = this.store.ratedPairReplays();
            logger.info(`Rebuilding the glicko2 database. ${replays.length} replays(s) were found.`);
            this.ratings = [];
            // Rated once over everything, which is the set the pages show by default, then once per
            // release. process_replays unpacks the rows it is given, so each pass gets its own copies.
            this.process_replays(replays.map(replay => ({ ...replay })), null);
            const releases = [...new Set(replays.map(replay => replay.game_release).filter((release): release is number => !!release))].sort((a, b) => a - b);
            for (const release of releases)
                this.process_replays(replays.filter(replay => replay.game_release === release).map(replay => ({ ...replay })), release);
            this.save();
            this.load();
        }
        finally {
            this.rebuilding = false;
        }
    }

    save(): void {
        for (const rating of this.ratings)
            this.store.save(rating);
    }
}

export {
    Glicko2Manager,
    getRatedPair
};
