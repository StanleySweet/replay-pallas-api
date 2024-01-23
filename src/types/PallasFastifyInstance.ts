/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { Database } from "sqlite";

declare module 'fastify' {
    interface FastifyInstance {
        database: Database
    }
}

