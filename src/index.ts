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
import pino from 'pino';
import { httpRequestDuration, httpRequestsTotal, register } from './prometheus';
import EUserRole from "./enumerations/EUserRole";

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

        // Check permission for /metrics endpoint
        if (request.url === "/metrics") {
            const hasPermission = payload.role === EUserRole.ADMINISTRATOR || payload.role === EUserRole.PROMETHEUS;
            if (!hasPermission) {
                reply.code(403);
                reply.send();
                return;
            }
        }
    });
}
setupAuthent();

// Prometheus metrics hooks
server.addHook('onRequest', async (request: FastifyRequest) => {
    (request as any).startTime = Date.now();
});

// Helper to normalize routes (wildcard/group them)
const normalizeRoute = (url: string): string => {
    // Remove query params
    const route = url.split('?')[0];
    
    // Group static asset routes
    if (route.startsWith('/swagger/ui/static/')) return '/swagger/ui/static';
    
    // Group by controller prefix and remove IDs
    const parts = route.split('/').filter(p => p);
    if (parts.length === 0) return '/';
    
    // For routes like /replays/:id/foo, group them
    if (parts.length > 1) {
        // Check if second segment looks like an ID (UUID, number, etc.)
        if (/^[0-9a-f\-]+$/i.test(parts[1])) {
            return `/${parts[0]}/:id${parts.length > 2 ? '/' + parts.slice(2).join('/') : ''}`;
        }
    }
    
    return route;
};

server.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = (request as any).startTime || Date.now();
    const duration = Date.now() - startTime;
    const route = normalizeRoute(request.url);
    
    if (duration >= 0) {
        httpRequestDuration
            .labels(request.method, route, reply.statusCode.toString())
            .observe(duration);
            
        httpRequestsTotal
            .labels(request.method, route, reply.statusCode.toString())
            .inc();
    }
});

server.get('/metrics', async (request, reply) => {
    reply.type('text/plain');
    return register.metrics();
});

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
        pino().error(err);
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
    bdb.pragma('synchronous = normal');
    bdb.pragma('temp_store = memory');
    bdb.pragma('mmap_size = 30000000000');
    bdb.pragma('page_size = 32768');

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
        () => { 
            server.glicko2Manager.rebuild() 
            server.ratingsDb.rebuild();
            bdb.pragma('optimize');
        },
        (err) => { /* handle errors here */ }
    )
    const job = new SimpleIntervalJob({ seconds: 3600, }, task)
    server.scheduler.addSimpleIntervalJob(job)
    server.ratingsDb = ratingsDb;
    server.replayDb = replayDb;
    server.aliasDb = aliasDb;
});
