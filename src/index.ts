/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { fastify, FastifyReply, FastifyRequest } from "fastify";
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { UserController } from "./controllers/UserController";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { ReplayController } from "./controllers/ReplayController";
import * as jose from 'jose';
import { PallasTokenPayload } from "./types/PallasToken";
import { JOSE_SECRET } from "./project_globals";
import { LobbyUserController } from "./controllers/LobbyUserController";
import { EngineInstance } from "./types/Engine";
import BetterDatabase from "better-sqlite3";
import { init_LocalRatings } from "./local-ratings/utilities/functions_utility";
import { LocalRatingsController } from "./controllers/LocalRatingsController";
import { Glicko2Manager } from "./instant-glicko-2/Glicko2Manager";
import { Task, SimpleIntervalJob } from "toad-scheduler";
import fastifySchedulePlugin from "@fastify/schedule";
import { HealthController } from "./controllers/HealthController";
const server = fastify({ logger: true });
server.register(cors, {
    origin: '*', // Allowing requests from any origin
    allowedHeaders: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] // Allowing any method
});

/* eslint-disable */
server.register(multipart)
server.register(fastifySwagger, {
    "swagger": {
        "info": {
            "title": 'Replay Pallas API',
            "description": 'Replay Pallas API Documentation',
            "version": '1.0.0',
            "termsOfService": 'https://replay-pallas.wildfiregames.ovh/PrivacyPolicy',
            "contact": {
                "name": 'Wildfire Games',
                "url": 'https://play0ad.com',
                "email": 'webmaster@wildfiregames.com'
            }
        },
        "securityDefinitions": {
            "JWT": {
                "type": "apiKey",
                "in": "header",
                "name": "Authorization"
            }
        },
        "security": [
            {
                "JWT": []
            }
        ],
    }
})
server.register(fastifySwaggerUi, {
    "routePrefix": '/swagger/ui',
    "uiConfig": {
        "docExpansion": 'none', // expand/not all the documentations none|list|full
        "deepLinking": true
    },
})

async function setupAuthent() {
    server.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
        if (request.url.startsWith("/users/token") || (request.url === "/users/" && request.method === "POST") || request.url.startsWith("/swagger/ui"))
            return;

        const token = request.headers.authorization?.replace("Bearer ", "") as string;
        if (!token) {
            reply.code(401);
            reply.send();
            return;
        }

        const { payload } = await jose.jwtVerify<PallasTokenPayload>(token, JOSE_SECRET, {
            issuer: 'https://replay-pallas-api.wildfiregames.ovh',
            audience: 'https://replay-pallas-api.wildfiregames.ovh',
        })

        request.claims = payload;
    });
}
setupAuthent();
server.addHook('preHandler', (req, res, done) => {
    const isPreflight = /options/i.test(req.method);
    if (isPreflight) {
      return res.send();
    }

    done();
  });


server.register(HealthController, { prefix: '/health' });
server.register(UserController, { prefix: '/users' });
server.register(ReplayController, { prefix: '/replays' });
server.register(LobbyUserController, { prefix: '/lobby-users' });
server.register(LocalRatingsController, { prefix: '/local-ratings' });
server.register(fastifySchedulePlugin);

server.listen({ port: 8080, host: "0.0.0.0" }, async (err, address) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    sqlite3.verbose();
    const db: Database = await open({
        "filename": "dist/cache/replay-pallas.sqlite3",
        "mode": sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
        "driver": sqlite3.Database
    });

    await db.migrate({
        migrationsPath: 'src/migrations'
    });
    
    db.close();

    const bdb = BetterDatabase("dist/cache/replay-pallas.sqlite3", { readonly: false });
    EngineInstance.SetDataBase(bdb);
    bdb.pragma('journal_mode = WAL');

    await server.ready();
    server.swagger();
    server.database = bdb;

    const { ratingsDb, replayDb, aliasDb } = init_LocalRatings();

    server.glicko2Manager = new Glicko2Manager(bdb);
    if (server.glicko2Manager.hasCache()) {
        server.glicko2Manager.load();
    }
    else {
        server.glicko2Manager.rebuild();
    }

    const task = new Task(
        'simple task',
        () => { server.glicko2Manager.rebuild() },
        (err) => { /* handle errors here */ }
    )
    const job = new SimpleIntervalJob({ seconds: 3600, }, task)
    server.scheduler.addSimpleIntervalJob(job)
    server.ratingsDb = ratingsDb;
    server.replayDb = replayDb;
    server.aliasDb = aliasDb;
});
