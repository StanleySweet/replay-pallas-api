/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { FastifyRequest } from "fastify";

// ?release=28 asks for one 0 A.D. release. No parameter, an empty one, or one that is not a whole
// number means every release, so a typo shows everything instead of nothing.
function releaseParam(request: FastifyRequest): number | null {
    const raw = (request.query as { release?: string } | undefined)?.release;
    if (raw === undefined || raw === "")
        return null;

    const release = Number(raw);
    return Number.isInteger(release) ? release : null;
}

export { releaseParam };
