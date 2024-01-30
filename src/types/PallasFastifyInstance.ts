/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { Database as BetterDatabase } from "better-sqlite3";

declare module 'fastify' {
    interface FastifyInstance {
        database: BetterDatabase
    }
}

