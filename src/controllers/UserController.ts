/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import { zodToJsonSchema } from "zod-to-json-schema";
import { AddUserRequest, AddUserSchema, DeleteUserByIdRequest, EloGraph, GetUserByIdRequest, GlickoElo, LatestUser, LatestUsersSchema, LoginUserRequest, SetPermissionsRequest, User, UserDetail, UserDetailSchema, UserSchema, UsersSchema } from "../types/User";
import { z } from "zod";
import * as jose from 'jose';
import EUserRole from "../enumerations/EUserRole";
import { PallasTokenPayload, PallasUserToken, PallasUserTokenSchema } from "../types/PallasToken";
import { JOSE_ALG as alg, JOSE_SECRET } from "../project_globals";
import { mode } from "../Utils";
import { unpackBlob } from "../replays/blobCodec";
import { releaseParam } from "../replays/releaseParam";
import { LocalRatingsReplay } from "../local-ratings/Replay";
import { RawPlayerStatisticsData } from "../types/RawPlayerStatisticsData";
import { PlayerStatistics } from "../types/PlayerStatistics";
import { toReplayListItem } from "./helpers/replayListItem";

function padNumber(number: number) {
    return number.toString().padStart(2, '0');
}

const avg = (array: number[]) => array.reduce((a, b) => a + b) / array.length;

const get_chart_data = (fastify: FastifyInstance, lobby_user: number, release: number | null = null): EloGraph => {

    function avg_rating(singleGamesRatings: { "elo": number, "date": string }[]): { "elo": number, "date": string }[] {
        const singleGamesRatingsSum = [singleGamesRatings[0]];
        for (let i = 1; i < singleGamesRatings.length; i++)
            singleGamesRatingsSum.push({ "elo": singleGamesRatingsSum[i - 1].elo + singleGamesRatings[i].elo, "date": singleGamesRatings[i].date });
        return singleGamesRatingsSum.map((x, i) => {
            x.elo = x.elo / (i + 1);
            return x;
        });
    }

    let game_ranking = fastify.players.rankingHistory(lobby_user);

    let glicko_ranking: GlickoElo[] = fastify.players.glickoHistory(lobby_user, release);

    game_ranking = game_ranking.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    glicko_ranking = glicko_ranking.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const currentDate = new Date();
    let formattedDate = `${currentDate.getFullYear()}-${padNumber(currentDate.getMonth() + 1)}-${padNumber(currentDate.getDate())} ${padNumber(currentDate.getHours())}:${padNumber(currentDate.getMinutes())}:${padNumber(currentDate.getSeconds())}`;

    let current_game_elo: number;
    if (game_ranking.length) {
        current_game_elo = game_ranking[game_ranking.length - 1].elo;
    }
    else {
        current_game_elo = 1200;
        game_ranking = [{ "elo": current_game_elo, date: formattedDate }];
    }




    let current_glicko_elo: GlickoElo;
    if (glicko_ranking.length) {
        current_glicko_elo = glicko_ranking[glicko_ranking.length - 1];
    }
    else {
        if (game_ranking.length) {
            const currentDate = new Date(game_ranking[game_ranking.length - 1].date);
            formattedDate = `${currentDate.getFullYear()}-${padNumber(currentDate.getMonth() + 1)}-${padNumber(currentDate.getDate())} ${padNumber(currentDate.getHours())}:${padNumber(currentDate.getMinutes())}:${padNumber(currentDate.getSeconds())}`;
        }

        current_glicko_elo = {
            elo: 1500,
            date: formattedDate,
            volatility: 0.09,
            preview_deviation: 350,
            deviation: 350,
            match_count: 0
        };
        glicko_ranking = [current_glicko_elo];
    }


    return {
        "current_game_elo": current_game_elo,
        "current_glicko_elo": current_glicko_elo,
        "glicko_series": glicko_ranking.map((y) => ({ "x": y.date, "y": y.elo })),
        "glicko_series_avg": avg_rating(glicko_ranking.map(b => { return { elo: b.elo, date: b.date }; })).map((y) => ({ "x": y.date, "y": y.elo })),
        "game_series": game_ranking.map((y) => ({ "x": y.date, "y": y.elo })),
        "game_series_avg": avg_rating(game_ranking).map((y) => ({ "x": y.date, "y": y.elo }))
    };
};



const get_user_details_by_lobby_user_id = async (request: GetUserByIdRequest, reply: FastifyReply, fastify: FastifyInstance): Promise<void> => {

    let result: UserDetail = {} as UserDetail;

    // Technically it's a lobby user, but they are similar enough.
    let user: UserDetail | undefined = fastify.players.findById(request.params.id);
    if (!user) {
        reply.code(204);
        reply.send();
        return;
    }

    // With ?release= the page covers that 0 A.D. release only: its graph, its replays and statistics computed
    // from those replays. The statistics cache holds the figures over every replay, so it is neither read
    // nor written then.
    const release = releaseParam(request);
    result.graph = get_chart_data(fastify, request.params.id, release);

    // users.nick has no UNIQUE constraint, and the duplicates that exist were registered
    // before create_user refused a taken nick, so this lookup is genuinely ambiguous. Pin it
    // to the oldest account instead of taking whichever row SQLite happens to reach first.
    const actual_user: User | undefined = fastify.users.findOldestByNick(user.nick);

    user = {
        id: actual_user ? actual_user.id : 0,
        role: actual_user ? actual_user.role : EUserRole.UNKNOWN,
        nick: actual_user ? actual_user.nick : user.nick,
        creation_date: user.creation_date
    } as UserDetail;

    result = Object.assign(result, user);

    const statisticData: RawPlayerStatisticsData[] = [];

    const cache = release === null ? getStatisticCache(fastify, request.params.id) : undefined;
    const hasStatisticCache = !!cache;
    if (cache) {
        result.AverageCPM = cache.average_cpm;
        result.WinRateRatio = cache.win_rate_ratio;
        result.MostUsedCmd = cache.most_used_cmd;
        result.SecondMostUsedCmd = cache.second_most_used_cmd;
        result.MatchCount = cache.match_count;
        result.TotalPlayedTime = cache.total_played_time;
    }

    let offset = 0;
    let hasMoreData = true;
    result.replays = [];
    while (hasMoreData) {
        const replays = fastify.players.replaysPage(request.params.id, !hasStatisticCache, offset, release);
        // Check if there's no more data
        if (replays.length === 0) {
            hasMoreData = false;
            break;
        }

        offset += replays.length;

        for (const element of replays) {
            const replay = fastify.replayDb.replayDatabase[element.match_id] as LocalRatingsReplay;
            const replayListItem = toReplayListItem(replay);
            if (replayListItem)
                result.replays.push(replayListItem);

            if (!hasStatisticCache) {
                element.metadata = JSON.parse(unpackBlob(element.metadata as string));
                statisticData.push({
                    "PlayerData": element.metadata.settings?.PlayerData?.filter(a => a.NameWithoutRating == result.nick)[0],
                    "MatchDuration": element.metadata.settings?.MatchDuration ?? 0
                });
            }
        }
    }

    if (!hasStatisticCache)
    {
        compute_statistics(result, statisticData);
        if (release === null)
            cacheUserStatistics(fastify, request, result);
    }

    reply.send(result);
};

const set_permission_for_user = (request: SetPermissionsRequest, reply: FastifyReply, fastify: FastifyInstance): void => {
    if (request.claims?.role !== EUserRole.ADMINISTRATOR) {
        reply.code(401);
        reply.send();
        return;
    }

    fastify.users.setRole(request.body.id, request.body.role);

    reply.send(200);
};

const compute_statistics = (result: UserDetail, statData: RawPlayerStatisticsData[]) => {
    result.MatchCount = statData.length;
    if (statData.length)
        result.TotalPlayedTime = statData.map(a => a.MatchDuration).reduce((a, b) => a + b);
    else
        result.TotalPlayedTime = 0;

    result.MostUsedCmd = mode(statData.map(a => a?.PlayerData?.MostUsedCmd ?? ""));
    result.SecondMostUsedCmd = mode(statData.map(a => a?.PlayerData?.SecondMostUsedCmd ?? ""));

    const data = statData.map(a => a?.PlayerData?.State === "won" ? 1.0 : a?.PlayerData?.State === "defeated" ? 0.0 : 0.0);
    if (data.length)
        result.WinRateRatio = avg(data);
    else
        result.WinRateRatio = -1;


    const cpmData = statData.map(a => a?.PlayerData?.AverageCPM ?? 0);
    if (cpmData.length)
        result.AverageCPM = avg(cpmData);
    else
        result.AverageCPM = -1;

};

const getStatisticCache = (fastify: FastifyInstance, lobby_user_id: number): PlayerStatistics | undefined => fastify.users.freshStatistics(lobby_user_id);


const get_user_details_by_id = async (request: GetUserByIdRequest, reply: FastifyReply, fastify: FastifyInstance): Promise<void> => {
    if ((request.claims?.role ?? 0) < EUserRole.READER) {
        reply.code(401);
        reply.send();
        return;
    }


    let result: UserDetail = {} as UserDetail;

    const user: UserDetail | undefined = fastify.users.findDetailById(request.params.id);
    if (!user) {
        reply.code(204);
        reply.send();
        return;
    }

    const release = releaseParam(request);
    const lobby_user = fastify.players.idForUser(request.params.id);

    if (lobby_user)
        result.graph = get_chart_data(fastify, lobby_user, release);


    result = Object.assign(result, user);

    const statisticData: RawPlayerStatisticsData[] = [];

    let cache : PlayerStatistics | undefined  = undefined;

    if(lobby_user && release === null)
        cache = getStatisticCache(fastify, lobby_user);

    const hasStatisticCache = !!cache;
    if (hasStatisticCache && cache) {
        result.AverageCPM = cache.average_cpm;
        result.WinRateRatio = cache.win_rate_ratio;
        result.MostUsedCmd = cache.most_used_cmd;
        result.SecondMostUsedCmd = cache.second_most_used_cmd;
        result.MatchCount = cache.match_count;
        result.TotalPlayedTime = cache.total_played_time;
    }

    let offset = 0;
    let hasMoreData = true;
    result.replays = [];
    while (hasMoreData) {
        const replays = fastify.players.replaysPageForUser(lobby_user, !hasStatisticCache, offset, release);

        // Check if there's no more data
        if (replays.length === 0) {
            hasMoreData = false;
            break;
        }

        offset += replays.length;

        for (const element of replays) {
            const replay = fastify.replayDb.replayDatabase[element.match_id] as LocalRatingsReplay;
            const replayListItem = toReplayListItem(replay);
            if (replayListItem)
                result.replays.push(replayListItem);

            if (!hasStatisticCache) {
                element.metadata = JSON.parse(unpackBlob(element.metadata as string));
                statisticData.push({
                    "PlayerData": element.metadata.settings?.PlayerData?.filter(a => a.NameWithoutRating == result.nick)[0],
                    "MatchDuration": element.metadata.settings?.MatchDuration ?? 0
                });
            }
        }
    }

    if (!hasStatisticCache)
    {
        compute_statistics(result, statisticData);
        if (release === null)
            cacheUserStatistics(fastify, request, result);
    }

    reply.send(result);
};

const login = async (request: LoginUserRequest, reply: FastifyReply, fastify: FastifyInstance): Promise<void> => {
    try {
        const users: User[] = fastify.users.findByCredentials(request.body.email, request.body.password);
        if (!users || !users.length) {
            reply.code(204);
            reply.send();
            return;
        }

        const payload: PallasTokenPayload = {
            'role': users[0].role,
            'nick': users[0].nick,
            'id': users[0].id
        };
        const jwt: string = await new jose.SignJWT(payload)
            .setProtectedHeader({ alg })
            .setIssuedAt()
            .setIssuer('https://replay-pallas-api.wildfiregames.ovh')
            .setAudience('https://replay-pallas-api.wildfiregames.ovh')
            .setExpirationTime('2h')
            .sign(JOSE_SECRET);


        const result: PallasUserToken = {
            role: users[0].role,
            token: jwt,
            nick: users[0].nick,
            id: users[0].id,
            expires_in: 7200
        } as PallasUserToken;
        reply.send(result);
    }
    catch (err) {
        fastify.log.error(err);
        reply.code(400);
        reply.send();
    }
};

const get_user_by_id = (request: GetUserByIdRequest, reply: FastifyReply, fastify: FastifyInstance): void => {
    if (request.claims?.role !== EUserRole.ADMINISTRATOR) {
        reply.code(401);
        reply.send();
        return;
    }

    try {
        const user = fastify.users.findById(request.params.id);
        if (!user) {
            reply.code(204);
            return;
        }

        reply.send(user);
    }
    catch (err) {
        fastify.log.error(err);
        reply.code(400);
        reply.send();
    }
};

const get_latest_users = (request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance): void => {
    if (request.claims?.role !== EUserRole.ADMINISTRATOR) {
        reply.code(401);
        reply.send();
        return;
    }

    try {
        const users: LatestUser[] = fastify.users.latest();
        if (!users || !users.length) {
            reply.code(204);
            reply.send();
            return;
        }
        reply.send(users);
    }
    catch (err) {
        fastify.log.error(err);
        reply.code(400);
        reply.send();
    }
};

const get_users = (request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance): void => {
    if (request.claims?.role !== EUserRole.ADMINISTRATOR) {
        reply.code(401);
        reply.send();
        return;
    }

    try {
        const users: User[] = fastify.users.all();
        if (!users || !users.length) {
            reply.code(204);
            return;
        }

        reply.send(users);
    }
    catch (err) {
        fastify.log.error(err);
        reply.code(400);
        reply.send();
    }
};

const delete_user = (request: DeleteUserByIdRequest, reply: FastifyReply, fastify: FastifyInstance): void => {
    if (request.claims?.role !== EUserRole.ADMINISTRATOR) {
        reply.code(401);
        reply.send();
        return;
    }

    try {
        reply.send(fastify.users.deleteWithLinks(request.params.id));
    }
    catch (err) {
        fastify.log.error(err);
        reply.code(400);
        reply.send();
    }
};

const create_user = (request: AddUserRequest, reply: FastifyReply, fastify: FastifyInstance): void => {
    try {
        // POST /users is unauthenticated, so without this anyone could register a second
        // account under a nick that is already taken (including a different casing of it) and
        // split that person's replays and permissions across two user rows. users.nick has no
        // UNIQUE constraint, unlike lobby_players.nick, so nothing below this catches it.
        //
        // Only registered accounts count. Plenty of nicks exist in lobby_players for people
        // who never made an account, and those must stay registrable.
        //
        // NOCASE folds ASCII only, which is the whole alphabet 0 A.D. nicks use.
        const taken = fastify.users.isNickTaken(request.body.nick);

        if (taken) {
            fastify.log.warn({ nick: request.body.nick }, "registration refused: nick already taken");
            reply.code(400);
            reply.send();
            return;
        }

        fastify.users.create(request.body.nick, request.body.password, request.body.email, EUserRole.READER);
        reply.code(201);
    }
    catch (err) {
        fastify.log.error(err);
        reply.code(400);
    }
    finally {
        reply.send();
    }
};

const UserController: FastifyPluginCallback = (fastify, _, done) => {

    const schemaCommon = { // For swagger categorization
        tags: ["Users"],
    };

    fastify.post("/", {
        schema: {
            body: zodToJsonSchema(AddUserSchema),
            response: {
                201: zodToJsonSchema(UsersSchema),
                401: {
                    type: 'null',
                    description: 'Unauthorized'
                }
            },
            ...schemaCommon
        }
    }, (request: AddUserRequest, reply: FastifyReply) => create_user(request, reply, fastify));

    fastify.get("/", {
        schema: {
            response: {
                200: zodToJsonSchema(UsersSchema),
                204: {
                    type: 'null',
                    description: 'No Content'
                },
                400: {
                    type: 'null',
                    description: 'Bad request'
                },
                401: {
                    type: 'null',
                    description: 'Unauthorized'
                }
            },
            ...schemaCommon
        }
    }, (request: FastifyRequest, reply: FastifyReply) => get_users(request, reply, fastify));



    fastify.get("/latest", {
        schema: {
            response: {
                200: zodToJsonSchema(LatestUsersSchema),
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
    }, ((request: FastifyRequest, reply: FastifyReply) => get_latest_users(request, reply, fastify)));


    fastify.post("/token", {
        schema: {
            body: zodToJsonSchema(z.object({ email: z.string(), password: z.string() })),
            response: {
                200: zodToJsonSchema(PallasUserTokenSchema),
                204: {
                    type: 'null',
                    description: 'No Content'
                }
            },
            ...schemaCommon
        }
    }, (request: LoginUserRequest, reply: FastifyReply) => login(request, reply, fastify));

    fastify.get("/GetDetails/:id", {
        schema: {
            params: zodToJsonSchema(z.object({ id: z.number() })),
            response: {
                200: zodToJsonSchema(UserDetailSchema),
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
    }, (request: GetUserByIdRequest, reply: FastifyReply) => get_user_details_by_id(request, reply, fastify));

    fastify.get("/GetDetailsByLobbyUserId/:id", {
        schema: {
            params: zodToJsonSchema(z.object({ id: z.number() })),
            response: {
                200: zodToJsonSchema(UserDetailSchema),
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
    }, (request: GetUserByIdRequest, reply: FastifyReply) => get_user_details_by_lobby_user_id(request, reply, fastify));


    fastify.post("/set-permissions", {
        schema: {
            body: zodToJsonSchema(z.object({ id: z.number(), role: z.nativeEnum(EUserRole) })),
            response: {
                200: {
                    type: 'null',
                    description: 'No Content'
                },
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
    }, (request: SetPermissionsRequest, reply: FastifyReply) => set_permission_for_user(request, reply, fastify));


    fastify.get("/:id", {
        schema: {
            params: zodToJsonSchema(z.object({ id: z.number() })),
            response: {
                200: zodToJsonSchema(UserSchema),
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
    }, (request: GetUserByIdRequest, reply: FastifyReply) => get_user_by_id(request, reply, fastify));

    fastify.delete("/:id", {
        schema: {
            params: zodToJsonSchema(z.object({ id: z.number() })),
            response: {
                200: zodToJsonSchema(z.array(z.any())),
                401: {
                    type: 'null',
                    description: 'Unauthorized'
                }
            },
            ...schemaCommon
        }
    }, (request: DeleteUserByIdRequest, reply: FastifyReply) => delete_user(request, reply, fastify));

    done();
};

function cacheUserStatistics(fastify : FastifyInstance, request: GetUserByIdRequest, result: { id: number; nick: string; role: EUserRole; creation_date: Date; AverageCPM: number; WinRateRatio: number; TotalPlayedTime: number; SecondMostUsedCmd: string; MostUsedCmd: string; MatchCount: number; replays: { date: string; mapName: string; playerNames: string[]; civs: string[]; matchId: string; }[]; graph?: { glicko_series: { x: string; y: number; }[]; glicko_series_avg: { x: string; y: number; }[]; game_series: { x: string; y: number; }[]; game_series_avg: { x: string; y: number; }[]; current_game_elo?: number | undefined; current_glicko_elo?: { date: string; elo: number; deviation: number; volatility: number; preview_deviation: number; } | undefined; } | undefined; }) {
    const currentDate = new Date();
    const formattedDate = `${currentDate.getFullYear()}-${padNumber(currentDate.getMonth() + 1)}-${padNumber(currentDate.getDate())} ${padNumber(currentDate.getHours())}:${padNumber(currentDate.getMinutes())}:${padNumber(currentDate.getSeconds())}`;

    fastify.users.saveStatistics({
        "total_played_time": result.TotalPlayedTime,
        "match_count": result.MatchCount,
        "second_most_used_cmd": result.SecondMostUsedCmd,
        "most_used_cmd": result.MostUsedCmd,
        "win_rate_ratio": result.WinRateRatio,
        "average_cpm": result.AverageCPM,
        "lobby_player_id": request.params.id,
        "modification_date": formattedDate
    });
}

export { UserController };
