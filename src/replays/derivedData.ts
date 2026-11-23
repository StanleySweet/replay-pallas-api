/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { logger } from "../logger";

interface DerivedDataSources {
    replayDb: { rebuild(): void };
    ratingsDb: { rebuild(): void };
    releases: { rebuild(): void };
    glicko2Manager: { rebuild(): void };
}

// The in-memory data derived from the replays: the local ratings caches and the Glicko sets. Each
// step is synchronous CPU work on the one main thread, so the steps run in turns of the event loop:
// requests are answered between them, and the longest wait is the longest single step, not the sum.
// shortcut: a step is still one block, make that step incremental or move it to a worker if it gets long.
async function rebuildDerivedData(server: DerivedDataSources): Promise<number[]> {
    const steps: [string, () => void][] = [
        ["replays", () => server.replayDb.rebuild()],
        ["local ratings", () => server.ratingsDb.rebuild()],
        ["releases", () => server.releases.rebuild()],
        ["glicko", () => server.glicko2Manager.rebuild()],
    ];

    const durations: number[] = [];
    for (const [name, step] of steps) {
        await new Promise<void>(resolve => setImmediate(resolve));
        const start = Date.now();
        step();
        durations.push(Date.now() - start);
        logger.info(`Rebuilt the ${name} data in ${durations[durations.length - 1]} ms`);
    }
    return durations;
}

export { rebuildDerivedData };
