/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { ReplayMetaData } from "../types/ReplayMetaData";
import { ReplayRepository } from "../repositories/ReplayRepository";
import { unpackBlob } from "./blobCodec";
import { logger } from "../logger";

// 0 A.D. numbered its releases 0.0.26 (Alpha 26) and then 0.27.0, so "0.0.26" and "0.26" are the same
// release and both mean 26. shortcut: a version with a major number above 0 gives no release, the
// numbering after 0.28 is not known yet, so such replays are filed under "unknown" until this learns it.
function releaseOf(version: string): number | null {
    const match = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(version);
    if (!match)
        return null;

    const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
    if (major !== 0)
        return null;

    return (minor === 0 ? patch : minor) || null;
}

// The release a replay was played on. The "0ad" entry of mods is on every replay and agrees with
// engine_version wherever both exist; engine_version alone is missing on a third of them.
function gameRelease(metadata: ReplayMetaData): number | null {
    const mods: { name?: string, mod?: string, version?: string }[] = Array.isArray(metadata.mods) ? metadata.mods : [];
    const core = mods.find(entry => entry && (entry.name === "0ad" || entry.mod === "0ad"));
    for (const version of [core?.version, metadata.engine_version]) {
        const release = typeof version === "string" ? releaseOf(version) : null;
        if (release !== null)
            return release;
    }
    return null;
}

// Fills game_release for rows that never had it. Metadata is small since Commands left it, so this
// is a second or two even on thousands of replays, and it does nothing once every row is filled.
function backfillGameRelease(replays: ReplayRepository): number {
    const rows = replays.withoutRelease();
    for (const row of rows)
        replays.setGameRelease(row.match_id, gameRelease(JSON.parse(unpackBlob(row.metadata))) ?? 0);

    if (rows.length)
        logger.info(`Filled the game release of ${rows.length} replay(s).`);
    return rows.length;
}

export { backfillGameRelease, gameRelease, releaseOf };
