/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import EUserRole from "../enumerations/EUserRole";
import { User, UsersSchema } from "../types/User";
import zodToJsonSchema from "zod-to-json-schema";

const get_lobby_users = (request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance): void => {
    if ((request.claims?.role ?? 0) < EUserRole.READER) {
        reply.code(401);
        reply.send();
        return;
    }

    try {
        const users: User[] = fastify.database.prepare('SELECT id, nick, 0 as role FROM lobby_players').all() as User[];
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
    }
};

const LobbyUserController: FastifyPluginCallback = (fastify, _, done) => {

    const schemaCommon = { // For swagger categorization
        tags: ["Lobby Users"],
    };

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
    }, (request: FastifyRequest, reply: FastifyReply) => get_lobby_users(request, reply, fastify));


    done();
};

export {
    LobbyUserController
};
