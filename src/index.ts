/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { fastify, FastifyReply, FastifyRequest } from "fastify";
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import sqlite3 from 'sqlite3'
import { open, Database } from 'sqlite'
import { UserController } from "./controllers/UserController";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { ReplayController } from "./controllers/ReplayController";
import * as jose from 'jose'
import { PallasTokenPayload } from "./types/PallasToken";
import { JOSE_SECRET } from "./project_globals";
import { LobbyUserController } from "./controllers/LobbyUserController";
import { EngineInstance } from "./types/Engine";
import BetterDatabase from "better-sqlite3";
import { init_LocalRatings } from "./local-ratings/utilities/functions_utility";
import { LocalRatingsController } from "./controllers/LocalRatingsController";

const server = fastify({ logger: true });
server.register(cors, {
    origin: '*', // Allowing requests from any origin
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] // Allowing any method
});

/* eslint-disable */
server.register(multipart)
server.register(fastifySwagger, {})
server.register(require('@fastify/swagger-ui'), {
    routePrefix: '/swagger/ui',
    swagger: {
        info: {
            title: 'Pallas API',
            description: 'Pallas API',
            version: '1.0.0',
            termsOfService: 'https://mywebsite.io/tos',
            contact: {
                name: 'John Doe',
                url: 'https://www.johndoe.com',
                email: 'john.doe@email.com'
            }
        },
        host: '127.0.0.1:8080',
        basePath: '',
        schemes: ['http', 'https'],
        consumes: ['application/json'],
        produces: ['application/json'],
        uiConfig: {
            docExpansion: 'none', // expand/not all the documentations none|list|full
            deepLinking: true
        }
    }
})

server.get('/vacuum', async (request: FastifyRequest, reply: any): Promise<any> => {
    await server.database.run('VACUUM;');
});


async function setupAuthent() {
    server.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
        if (request.url.startsWith("/users/token") || request.url.startsWith("/swagger/ui"))
            return;


        const token = request.headers.authorization?.replace("Bearer ", "") as string;
        if (!token) {
            reply.code(401)
            return;
        }

        const { payload } = await jose.jwtVerify<PallasTokenPayload>(token, JOSE_SECRET, {
            issuer: 'urn:example:issuer',
            audience: 'urn:example:audience',
        })

        request.claims = payload;
    });
}
setupAuthent();



server.register(UserController, { prefix: '/users' });
server.register(ReplayController, { prefix: '/replays' });
server.register(LobbyUserController, { prefix: '/lobby-users' });
server.register(LocalRatingsController, { prefix: '/local-ratings' });


server.listen({ port: 8080, host: "0.0.0.0" }, async (err, address) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    sqlite3.verbose();
    const db: Database = await open({
        "filename": "replays.sqlite3",
        "mode": sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
        "driver": sqlite3.Database
    });

    await db.migrate({
        migrationsPath: 'src/migrations'
    });


    server.database = db;
    var bdb = BetterDatabase("replays.sqlite3", { readonly: false });
    EngineInstance.SetDataBase(bdb);
    bdb.pragma('journal_mode = WAL');

    await server.ready();
    server.swagger();

    const { ratingsDb, replayDb, aliasDb } =  init_LocalRatings();

    server.ratingsDb = ratingsDb;
    server.replayDb = replayDb;
    server.aliasDb = aliasDb;
});
