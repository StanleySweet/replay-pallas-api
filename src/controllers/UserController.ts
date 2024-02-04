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
import { Replays } from "../types/Replay";
import { mode } from "../Utils";
import snappy from 'snappy';

const avg = (array: number[]) => array.reduce((a, b) => a + b) / array.length;

const get_chart_data =  (fastify: FastifyInstance, lobby_user : number) : EloGraph => {

    function avg_rating(singleGamesRatings: { "elo": number, "date": string }[]) : { "elo": number, "date": string }[] {
        const singleGamesRatingsSum = [singleGamesRatings[0]];
        for (let i = 1; i < singleGamesRatings.length; i++)
            singleGamesRatingsSum.push({ "elo" : singleGamesRatingsSum[i - 1].elo + singleGamesRatings[i].elo, "date": singleGamesRatings[i].date});
        return singleGamesRatingsSum.map((x, i) => {
            x.elo = x.elo / (i + 1);
            return x;
        });
    }

    let game_ranking = fastify.database.prepare("Select elo, date From lobby_ranking_history Where lobby_player_id = @lobby_player_id").all({
        "lobby_player_id": lobby_user,
    }) as { "elo": number, "date": string }[];

    let glicko_ranking = fastify.database.prepare("Select elo, date, deviation, volatility, preview_deviation From glicko2_rankings Where lobby_player_id = @lobby_player_id").all({
        "lobby_player_id": lobby_user,
    }) as GlickoElo[];

    game_ranking = game_ranking.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    glicko_ranking = glicko_ranking.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let current_glicko_elo : GlickoElo;
    if( glicko_ranking.length){
        current_glicko_elo = glicko_ranking[glicko_ranking.length -1];
    }
    else {
        current_glicko_elo = {
            elo: 1500,
            date: '',
            volatility: 0.09,
            preview_deviation: 350,
            deviation: 350
        };
    }

    let current_game_elo : number;
    if( glicko_ranking.length){
        current_game_elo = game_ranking[game_ranking.length -1].elo;
    }
    else {
        current_game_elo = 1200;
    }

    return {
        "current_game_elo" : current_game_elo,
        "current_glicko_elo" : current_glicko_elo,
        "glicko_series": glicko_ranking.map((y) => ({ "x": y.date, "y": y.elo })),
        "glicko_series_avg": avg_rating(glicko_ranking.map(b => { return { elo: b.elo, date: b.date};})).map((y) => ({ "x": y.date, "y": y.elo })),
        "game_series": game_ranking.map((y) => ({ "x": y.date, "y": y.elo })),
        "game_series_avg": avg_rating(game_ranking).map((y) => ({ "x": y.date, "y": y.elo }))
    };
};



const get_user_details_by_lobby_user_id = async (request: GetUserByIdRequest, reply: FastifyReply, fastify: FastifyInstance): Promise<void> => {

    let result: UserDetail = {} as UserDetail;

    // Technically it's a lobby user, but they are similar enough.
    let user: UserDetail | undefined = fastify.database.prepare('SELECT id, nick, creation_date FROM lobby_players WHERE id=@id LIMIT 1').get({ "id": request.params.id }) as UserDetail;
    if (!user) {
        reply.code(204);
        return;
    }

    result.graph = get_chart_data(fastify, request.params.id);

    const actual_user: User | undefined = fastify.database.prepare("SELECT id, nick, role FROM users WHERE nick = @nick LIMIT 1").get({ "nick": user.nick }) as User | undefined;

    user = {
        id: actual_user ? actual_user.id : 0,
        role: actual_user ? actual_user.role : EUserRole.UNKNOWN,
        nick: actual_user ? actual_user.nick : user.nick,
        creation_date: user.creation_date
    } as UserDetail;

    result = Object.assign(result, user);

    const replays = fastify.database.prepare(`
    Select r.match_id, r.metadata From lobby_players lp
    Inner Join replay_lobby_player_link rlp
    On lp.id = rlp.lobby_player_id
    Inner Join replays r
    On r.match_id = rlp.match_id
    Where lp.id = @id`).all({ "id": request.params.id }) as Replays;

    result.replays = replays;
    for (const element of result.replays)
        element.metadata = JSON.parse(await snappy.uncompress(element.metadata as string, { asBuffer: false }) as string);

    compute_statistics(result, replays);
    reply.send(result);
};

const set_permission_for_user = (request: SetPermissionsRequest, reply: FastifyReply,  fastify: FastifyInstance): void  => {
    if (request.claims?.role !== EUserRole.ADMINISTRATOR) {
        reply.code(401);
        return;
    }

    fastify.database.prepare("Update users Set role = @role where id = @id").run({
        "id": request.body.id,
        "role": request.body.role,
    });

    reply.send(200);
};

const compute_statistics = (result: UserDetail, replays: Replays) => {
    const relevantPlayerData = replays.map(b => b.metadata.settings?.PlayerData?.filter(a => a.NameWithoutRating == result.nick)[0]);
    result.MatchCount = replays.length;
    if (replays.length)
        result.TotalPlayedTime = replays.map(a => a.metadata.settings?.MatchDuration ?? 0).reduce((a, b) => a + b);
    else
        result.TotalPlayedTime = 0;
    result.MostUsedCmd = mode(relevantPlayerData.map(a => a?.MostUsedCmd ?? ""));
    result.SecondMostUsedCmd = mode(relevantPlayerData.map(a => a?.SecondMostUsedCmd ?? ""));

    const data = relevantPlayerData.map(a => a?.State === "won" ? 1.0 : a?.State === "defeated" ? 0.0 : 0.0);
    if (data.length)
        result.WinRateRatio = avg(data);
    else
        result.WinRateRatio = -1;


    const cpmData = relevantPlayerData.map(a => a?.AverageCPM ?? 0);
    if (cpmData.length)
        result.AverageCPM = avg(cpmData);
    else
        result.AverageCPM = -1;

};

const get_user_details_by_id = async (request: GetUserByIdRequest, reply: FastifyReply, fastify: FastifyInstance): Promise<void> => {
    if ((request.claims?.role ?? 0) < EUserRole.READER) {
        reply.code(401);
        return;
    }

    
    let result: UserDetail = {} as UserDetail;

    const user: UserDetail | undefined = fastify.database.prepare('SELECT id, nick, role, creation_date FROM users WHERE id=@id LIMIT 1').get({ "id": request.params.id }) as UserDetail | undefined;
    if (!user) {
        reply.code(204);
        return;
    }

    const lobby_user : User = fastify.database.prepare(`
    Select lp.id From users u
    Inner Join lobby_players lp
    On lp.nick = u.nick  Where u.id = @id`).get({ "id": request.params.id }) as User;

    if (lobby_user?.id)
        result.graph = get_chart_data(fastify, lobby_user.id);


    result = Object.assign(result, user);

    const replays = fastify.database.prepare(`
    Select r.match_id, r.metadata From users u
    Inner Join lobby_players lp
    On lp.nick = u.nick
    Inner Join replay_lobby_player_link rlp
    On lp.id = rlp.lobby_player_id
    Inner Join replays r
    On r.match_id = rlp.match_id
    Where u.id = @id`).all({ "id": lobby_user?.id }) as Replays;

    result.replays = replays;
    for (const element of result.replays)
        element.metadata = JSON.parse(await snappy.uncompress(element.metadata as string, { asBuffer: false }) as string);

    compute_statistics(result, replays);
    reply.send(result);
};

const login = async (request: LoginUserRequest, reply: FastifyReply, fastify: FastifyInstance): Promise<void> => {
    try {
        const users: User[] = fastify.database.prepare("SELECT id, nick, role FROM users WHERE email = @email and password = @password LIMIT 1").all({ "email": request.body.email, "password": request.body.password }) as User[];
        if (!users || !users.length) {
            reply.code(204);
            return;
        }

        const payload : PallasTokenPayload = {
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
        console.error(err);
        reply.code(400);
    }
};

const get_user_by_id = (request: GetUserByIdRequest, reply: FastifyReply, fastify: FastifyInstance): void => {
    if (request.claims?.role !== EUserRole.ADMINISTRATOR) {
        reply.code(401);
        return;
    }

    try {
        const users: User[] = fastify.database.prepare('SELECT id, nick, role FROM users WHERE id = @id LIMIT 1').all({ "id": request.params.id }) as User[];
        if (!users || !users.length) {
            reply.code(204);
            return;
        }

        reply.send(users[0]);
    }
    catch (err) {
        console.error(err);
        reply.code(400);
    }
};

const get_latest_users = (request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance): void => {
    if (request.claims?.role !== EUserRole.ADMINISTRATOR) {
        reply.code(401);
        return;
    }

    try {
        const users: LatestUser[] = fastify.database.prepare('SELECT id, nick, role, creation_date FROM users ORDER BY modification_date DESC LIMIT 10').all() as LatestUser[];
        if (!users || !users.length) {
            reply.code(204);
            return;
        }
        reply.send(users);
    }
    catch (err) {
        console.error(err);
        reply.code(400);
    }
};

const get_users = (request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance): void => {
    if (request.claims?.role !== EUserRole.ADMINISTRATOR) {
        reply.code(401);
        return;
    }

    try {
        const users: User[] = fastify.database.prepare('SELECT id, nick, role FROM users').all() as User[];
        if (!users || !users.length) {
            reply.code(204);
            return;
        }

        reply.send(users);
    }
    catch (err) {
        console.error(err);
        reply.code(400);
    }
};

const delete_user = (request: DeleteUserByIdRequest, reply: FastifyReply, fastify: FastifyInstance): void => {
    if (request.claims?.role !== EUserRole.ADMINISTRATOR) {
        reply.code(401);
        return;
    }

    try {
        const result = fastify.database.prepare('DELETE FROM users WHERE id = @userId').run({ "userId": request.params.id });
        reply.send(result);
    }
    catch (err) {
        console.error(err);
        reply.code(400);
    }
};

const create_user = (request: AddUserRequest, reply: FastifyReply, fastify: FastifyInstance): void => {
    try {
        fastify.database.prepare(`INSERT INTO users (nick, password, email, role) VALUES(@nick, @password, @email, @role)`).run({
            "nick": request.body.nick,
            "password": request.body.password,
            "email": request.body.email,
            "role": EUserRole.READER,
        });
        reply.code(201);
    }
    catch (err) {
        console.error(err);
        reply.code(400);
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
                200: {
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
    }, (request: DeleteUserByIdRequest, reply: FastifyReply) => delete_user(request, reply, fastify));

    done();
};

export { UserController };


