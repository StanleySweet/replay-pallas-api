/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { Database as BetterDatabase } from "better-sqlite3";
import { ReplayRepository } from "../repositories/ReplayRepository";
import { PlayerRepository } from "../repositories/PlayerRepository";

declare module 'fastify' {
    interface FastifyInstance {
        database: BetterDatabase
        replays: ReplayRepository
        players: PlayerRepository
    }
}

