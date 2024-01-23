/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import EUserRole from "../enumerations/EUserRole";
import zodToJsonSchema from "zod-to-json-schema";
import { getAvd_LocalRatings, getMean_LocalRatings, getStd_LocalRatings, formatRating_LocalRatings, sortString_LocalRatings } from "../local-ratings/utilities/functions_utility";
import { LocalRatingsAlias } from "../local-ratings/Alias";
import { LocalRatingsRatingsDB } from "../local-ratings/RatingsDB";
import { z } from 'zod'
import { LocalRatingsHistoryDatabase, LocalRatingsHistoryDatabaseElement, LocalRatingsHistoryDirectoryElement } from "../local-ratings/types/HistoryDatabase";
import { LatestUser, LatestUserSchema, User } from "../types/User";
import { LocalRatingsPlayerFilter } from "../local-ratings/PlayerFilter";
import { LocalRatingsEvolutionChartOptions } from "../local-ratings/EvolutionChartOptions";

const RankDataSchema = z.object({
    "rank": z.number(),
    "players": z.number()
});

const PlayerProfileSchema = z.object({
    "rankText": RankDataSchema,
    "currentRatingText": z.string(),
    "highestRatingText": z.string(),
    "lowestRatingText": z.string(),
    "averageRatingText": z.string(),
    "ratingAverageDeviationText": z.string(),
    "ratingStandardDeviationText": z.string(),
    "lastPerformanceText": z.string(),
    "bestPerformanceText": z.string(),
    "worstPerformanceText": z.string(),
    "averagePerformanceText": z.string(),
    "performanceAverageDeviationText": z.string(),
    "performanceStandardDeviationText": z.string(),
});

const SeriesDataSchema  = z.object({
    x: z.number(),
    y: z.number(),
});

const EvolutionChartDataSchema = z.object({
    series: z.array(z.array(SeriesDataSchema)),
    colors: z.array(z.string()),
    legends: z.array(z.string())
});

const RowSchema = z.object({
    "rank": z.number(),
    "rating": z.string(),
    "matches": z.number(),
    "user": LatestUserSchema
});

type Row = z.infer<typeof RowSchema>;

const RowsSchema = z.array(RowSchema);

const GetPlayerProfileSchema = z.object({ player: z.string(), rank: z.number(), players: z.number() });
type GetPlayerProfileModel = z.infer<typeof GetPlayerProfileSchema>;
type PlayerProfile = z.infer<typeof PlayerProfileSchema>;
type EvolutionChartData = z.infer<typeof EvolutionChartDataSchema>;



type GetPlayerProfileRequest = FastifyRequest<{ Body: GetPlayerProfileModel }>;


function getSingleGamesRatings(playerData: LocalRatingsHistoryDirectoryElement): number[] {
    return Object.keys(playerData).sort().map(x => playerData[x].rating);
}

function getAverageRatings(singleGamesRatings: number[]) {
    const singleGamesRatingsSum = [singleGamesRatings[0]];
    for (let i = 1; i < singleGamesRatings.length; i++)
        singleGamesRatingsSum.push(singleGamesRatingsSum[i - 1] + singleGamesRatings[i]);
    return singleGamesRatingsSum.map((x, i) => x / (i + 1));
}

const get_evolution_chart_data = async (request: GetPlayerProfileRequest, reply: FastifyReply, fastify: FastifyInstance): Promise<void> => {
    if (request.claims.role < EUserRole.READER) {
        reply.code(401);
        return;
    }

    const player = request.body.player;
    // Merge aliases
    const historyDatabase = fastify.ratingsDb.historyDatabase;
    const playerData = historyDatabase[player];

    // Retrieve relevant data
    const singleGamesRatings = getSingleGamesRatings(playerData);
    const averageRatings = getAverageRatings(singleGamesRatings);
    const dataSize = singleGamesRatings.length;
    const currentRating = averageRatings[dataSize - 1];
    const configOptions = new LocalRatingsEvolutionChartOptions();

    const data : EvolutionChartData = {
        series : [],
        colors: [],
        legends: []
    }
    // Push to GUI
    if (configOptions.showzero) {
        const zeroLineDataSet = (dataSize == 1) ?
            [{ "x": 0, "y": 0 }, { "x": 1, "y": 0 }] :
            [{ "x": 1, "y": 0 }, { "x": dataSize, "y": 0 }];
        data.series.push(zeroLineDataSet);
        data.colors.push(configOptions.colorzero);
        data.legends.push("EvolutionChart.ZeroLineLegend");
    }
    if (configOptions.showcurrent) {
        const currentRatingDataSet = (dataSize == 1) ?
            [{ "x": 0, "y": currentRating * 100 }, { "x": 1, "y": currentRating * 100 }] :
            [{ "x": 1, "y": currentRating * 100 }, { "x": dataSize, "y": currentRating * 100 }];
            data.series.push(currentRatingDataSet);
            data.colors.push(configOptions.colorcurrent);
            data.legends.push("EvolutionChart.CurrentRatingLegend");
    }
    if (configOptions.showevolution) {
        const averageRatingsDataSet = (dataSize == 1) ?
            [{ "x": 0, "y": currentRating * 100 }, { "x": 1, "y": currentRating * 100 }] :
            averageRatings.map((y, i) => ({ "x": i + 1, "y": y * 100 }));
            data.series.push(averageRatingsDataSet);
            data.colors.push(configOptions.colorevolution);
            data.legends.push("EvolutionChart.RatingEvolutionLegend");
    }
    if (configOptions.showperformance) {
        const singleGamesRatingsDataSet = (dataSize == 1) ?
            [{ "x": 0, "y": currentRating * 100 }, { "x": 1, "y": currentRating * 100 }] :
            singleGamesRatings.map((y, i) => ({ "x": i + 1, "y": y * 100 }));
            data.series.push(singleGamesRatingsDataSet);
            data.colors.push(configOptions.colorperformance);
            data.legends.push("EvolutionChart.PerformanceOverTimeLegend");
    }

    reply.send(data);
}


const get_player_list = async (request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance): Promise<void> => {
    if (request.claims.role < EUserRole.READER) {
        reply.code(401);
        return;
    }

    const db = fastify.ratingsDb.ratingsDatabase;

    const alias = new LocalRatingsAlias();
    alias.merge(db, undefined);
    alias.removeDuplicates(db, undefined);

    // Create an array of players, rating, matches.
    // We sort by rating, so we keep the information on their rank
    const items = Object.keys(db).map(x => [
        x,
        db[x].rating,
        db[x].matches
    ]).sort((a, b) => (b[1] as number) - (a[1] as number));


    const users: LatestUser[] = await fastify.database.all(`SELECT lp.id, lp.nick, (CASE  when u.role IS  Null then 0 else u.role END)
    as role, CASE When  u.creation_date is null then lp.creation_date else lp.creation_date End as creation_date FROM lobby_players lp
    Left Join users u on u.nick = lp.nick
    Where lp.nick in (${items.map(a => "'" + a[0] + "'").join(', ')})`);

    // Construct table rows, using the previously created items
    const rows = items.map((x, i): Row => {
        return {
            "rank": i + 1, // rank
            "rating": formatRating_LocalRatings(x[1] as number), // rating
            "matches": x[2] as number, // matches
            "user": users.filter(a => a.nick === x[0])[0]
        }
    });

    reply.send(rows);
}


const get_player_profile = async (request: GetPlayerProfileRequest, reply: FastifyReply, fastify: FastifyInstance): Promise<void> => {
    if (request.claims.role < EUserRole.READER) {
        reply.code(401);
        return;
    }

    const player = request.body.player;
    const rank = request.body.rank;
    const players = request.body.players;

    const ratingsDB = new LocalRatingsRatingsDB();
    ratingsDB.load();

    // Merge aliases
    const historyDatabase: LocalRatingsHistoryDatabase = JSON.parse(JSON.stringify(ratingsDB.historyDatabase));
    const alias = new LocalRatingsAlias();
    alias.merge(undefined, historyDatabase);

    const playerData = historyDatabase[player];

    const singleGamesRatings = Object.keys(playerData)
        .sort()
        .map(x => playerData[x].rating);
    const averageRatings = singleGamesRatings
        .reduce((pv, cv, i) => pv.concat([pv[i] + cv]), [0])
        .slice(1)
        .map((x: number, i: number) => x / (i + 1));
    const currentRating = averageRatings[averageRatings.length - 1];
    const averageRating = getMean_LocalRatings(averageRatings);
    const ratingAverageDeviation = getAvd_LocalRatings(averageRatings, averageRating);
    const ratingStandardDeviation = getStd_LocalRatings(averageRatings, averageRating);
    const performanceAverageDeviation = getAvd_LocalRatings(singleGamesRatings, currentRating);
    const performanceStandardDeviation = getStd_LocalRatings(singleGamesRatings, currentRating);

    const captions: PlayerProfile = {
        "rankText": { "rank": rank, "players": players },
        "currentRatingText": formatRating_LocalRatings(currentRating),
        "highestRatingText": formatRating_LocalRatings(Math.max(...averageRatings)),
        "lowestRatingText": formatRating_LocalRatings(Math.min(...averageRatings)),
        "averageRatingText": formatRating_LocalRatings(averageRating),
        "ratingAverageDeviationText": formatRating_LocalRatings(ratingAverageDeviation),
        "ratingStandardDeviationText": formatRating_LocalRatings(ratingStandardDeviation),
        "lastPerformanceText": formatRating_LocalRatings(singleGamesRatings[singleGamesRatings.length - 1]),
        "bestPerformanceText": formatRating_LocalRatings(Math.max(...singleGamesRatings)),
        "worstPerformanceText": formatRating_LocalRatings(Math.min(...singleGamesRatings)),
        "averagePerformanceText": formatRating_LocalRatings(currentRating),
        "performanceAverageDeviationText": formatRating_LocalRatings(performanceAverageDeviation),
        "performanceStandardDeviationText": formatRating_LocalRatings(performanceStandardDeviation)
    };

    reply.send(captions)
}

const LocalRatingsController: FastifyPluginCallback = (fastify, _, done) => {

    const schemaCommon = { // For swagger categorization
        tags: ["Local Ratings"],
    };

    fastify.get("/users", {
        schema: {
            response: {
                200: zodToJsonSchema(RowsSchema),
                204: {
                    type: 'null',
                    description: 'No Content'
                },
                401: {
                    type: 'null',
                    description: 'Unauthorized'
                }
            },
            ...schemaCommon
        }
    }, (request: FastifyRequest, reply: FastifyReply) => get_player_list(request, reply, fastify));


    fastify.post("/evolution-data", {
        schema: {
            body: zodToJsonSchema(GetPlayerProfileSchema),
            response: {
                200: zodToJsonSchema(EvolutionChartDataSchema),
                204: {
                    type: 'null',
                    description: 'No Content'
                },
                401: {
                    type: 'null',
                    description: 'Unauthorized'
                }
            },
            ...schemaCommon
        }
    }, (request: GetPlayerProfileRequest, reply: FastifyReply) => get_evolution_chart_data(request, reply, fastify));

    fastify.post("/player-profile", {
        schema: {
            body: zodToJsonSchema(GetPlayerProfileSchema),
            response: {
                200: zodToJsonSchema(PlayerProfileSchema),
                204: {
                    type: 'null',
                    description: 'No Content'
                },
                401: {
                    type: 'null',
                    description: 'Unauthorized'
                }
            },
            ...schemaCommon
        }
    }, (request: GetPlayerProfileRequest, reply: FastifyReply) => get_player_profile(request, reply, fastify));


    done();
};

export {
    LocalRatingsController
}
