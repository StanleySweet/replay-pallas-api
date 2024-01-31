/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Database } from 'better-sqlite3';
import { Replays } from '../types/Replay';
import snappy from 'snappy';
import { RatingCalculator } from './RatingCalculator';
import { RatingCalculatorSettings } from './RatingCalculatorSettings';
import { Rating } from './Rating';
import { FloatingRatingPeriodResults, GameRatingPeriodResults } from './RatingPeriodResults';
import pino from 'pino';
import { GameResult } from './GameResult';
import { FloatingResult } from './FloatingResult';
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
}


class Glicko2Manager {
    database: Database;
    ratings: PallasGlickoRating[];
    calculator: RatingCalculator;
    rebuilding: boolean;
    constructor(database: Database) {
        const settings: RatingCalculatorSettings = new RatingCalculatorSettings();
        // Chosen so a typical player's RD goes from 60 -> 110 in 1 year
        settings.RatingPeriodsPerDay = 0.21436;
        this.calculator = new RatingCalculator(settings);
        this.database = database;
        this.ratings = [];
        this.rebuilding = false;
    }

    hasCache(): boolean {
        const { count }: { count: number } = this.database.prepare('Select Count(*) as count From glicko2_rankings;').get() as { count: number };
        return count > 0;
    }

    load(): void {
        this.ratings = this.database.prepare('Select * From glicko2_rankings;').all() as PallasGlickoRating[];
        pino().info(`Loading the glicko2 database. ${this.ratings.length} ratings(s) were loaded for ${new Set(this.ratings.map(a => a.lobby_player_id)).size} player(s).`);
    }

    process_replays(replays: Replays): void {
        const players: Map<string, Rating> = new Map<string, Rating>();
        const playersIds: Map<string, number> = new Map<string, number>();
        const playersMatchCount: Map<string, number> = new Map<string, number>();
        const matches: GameResult[] = [];
        let counter =  0;
        let winCounter =  0;
        for (const element of replays) {
            if (Buffer.isBuffer(element.metadata))
                element.metadata = JSON.parse(snappy.uncompressSync(element.metadata as Buffer, { asBuffer: false }) as string);

            const date_string = element.creation_date + "";
            if (typeof element.creation_date === 'string' || element.creation_date instanceof String)
                element.creation_date = new Date(element.creation_date as unknown as string);
            const playerData = element.metadata.settings?.PlayerData;

            if (!playerData || !playerData.some(a => a.State === "won"))
                continue;




            if (playerData[0].NameWithoutRating && playerData[1].NameWithoutRating) {
                

                const player0Name = playerData[0].NameWithoutRating;
                if (!players.has(player0Name)) {
                    players.set(player0Name, new Rating(Rating.defaultRating, Rating.defaultDeviation, Rating.defaultVolatility, 0, element.creation_date));
                    playersIds.set(player0Name, playerData[0].LobbyUserId as number);
                }

                const gPlayer1: Rating = players.get(player0Name) as Rating;
                gPlayer1.numberOfResults = 0;

    
                const player1Name = playerData[1].NameWithoutRating;

                if(player0Name === "Feldfeld" || player1Name === "Feldfeld"){
                    ++counter;
                }

                if (!players.has(player1Name)) {
                    players.set(player1Name, new Rating(Rating.defaultRating, Rating.defaultDeviation, Rating.defaultVolatility, 0, element.creation_date));
                    playersIds.set(player1Name, playerData[1].LobbyUserId as number);
                }

                const gPlayer2 = players.get(player1Name) as Rating;
                gPlayer2.numberOfResults = 0;

                const winner = playerData[1].State === "won" ? gPlayer2 : gPlayer1;
                const loser = playerData[1].State !== "won" ? gPlayer2 : gPlayer1;

                if(player0Name === "Feldfeld" &&  players.get(player0Name) === winner|| player1Name === "Feldfeld" &&  players.get(player1Name) === winner){
                    ++winCounter;
                }

                playersMatchCount.set(player0Name, (playersMatchCount.get(player0Name) ?? 0) + 1);
                playersMatchCount.set(player1Name, (playersMatchCount.get(player1Name) ?? 0) + 1);

                matches.push(new GameResult(winner, loser, false));
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
                        "preview_deviation": this.calculator.previewDeviation(value, new Date(), false) ?? Rating.defaultDeviation
                    }));
                }
            }
        }

        console.log(counter, winCounter);

        const player1 = new Rating(1500.0, 200.0, 0.06, 0, new Date());
        const player2 = new Rating(1400.0, 30.0, 0.06, 0, new Date());
        const player3 = new Rating(1550.0, 100.0, 0.06, 0, new Date());
        const player4 = new Rating(1700.0, 300.0, 0.06, 0, new Date());
        
        const matchList: GameRatingPeriodResults = new GameRatingPeriodResults([
            (new GameResult(player1, player2, false)),
            (new GameResult(player3, player1, false)),
            (new GameResult(player4, player1, false)),
        ]);
        // this.calculator.updateRatings(matchList, true);

        // const matchList: FloatingRatingPeriodResults = new FloatingRatingPeriodResults([
        //     (new FloatingResult(player1, player2, 100.0)),
        //     (new FloatingResult(player3, player1, 100.0)),
        //     (new FloatingResult(player4, player1, 100.0)),
        // ]);
        this.calculator.updateRatings(matchList, true);

        console.log(player1);




        pino().info(`Rebuilding the glicko2 database. ${Array.from(players.keys()).length} ratings(s) were added for ${playersIds.size} player(s).`);
    }

    rebuild(): void {
        if (this.rebuilding)
            return;
        try {
            this.rebuilding = true;
            this.database.prepare('Delete From glicko2_rankings;').run();
            const replays: Replays = this.database.prepare('Select r.metadata, r.creation_date From replays r Where 2 = (Select Count(*) From replay_lobby_player_link lp Where lp.match_id = r.match_id ) Order by r.creation_date ASC;').all() as Replays;
            this.ratings = [];
            this.process_replays(replays);
            this.save();
            this.load();
        }
        finally {
            this.rebuilding = false;
        }
    }

    save(): void {
        for (const rating of this.ratings) {
            const { count } = this.database.prepare('Select Count(*) as count From glicko2_rankings Where lobby_player_id = @lobby_player_id and match_count = @match_count;').get({ "match_count": rating.match_count,'lobby_player_id': rating.lobby_player_id }) as { count: number };
            if (count === 0)
                this.database.prepare('Insert Into glicko2_rankings (elo, deviation, volatility, lobby_player_id, preview_deviation, match_count, date) Values (@elo, @deviation, @volatility, @lobby_player_id, @preview_deviation, @match_count, @date);').run({
                    "elo": rating.elo,
                    "deviation": rating.deviation,
                    "volatility": rating.volatility,
                    "match_count": rating.match_count,
                    "date": rating.date,
                    "lobby_player_id": rating.lobby_player_id,
                    "preview_deviation": rating.preview_deviation
                });
            else
                this.database.prepare('Update glicko2_rankings Set elo = @elo, deviation = @deviation, volatility = @volatility, preview_deviation = @preview_deviation Where lobby_player_id = @lobby_player_id and match_count = @match_count;').run({
                    "elo": rating.elo,
                    "deviation": rating.deviation,
                    "volatility": rating.volatility,
                    "lobby_player_id": rating.lobby_player_id,
                    "preview_deviation": rating.preview_deviation,
                    "match_count": rating.match_count,
                });
        }
    }
}

export {
    Glicko2Manager
};