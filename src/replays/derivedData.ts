/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { logger } from "../logger";
import { rebuildFailuresTotal, rebuildLastSuccess } from "../prometheus";

interface DerivedDataSources {
    replayDb: { rebuild(): void };
    ratingsDb: { rebuild(): void };
    releases: { rebuild(): void };
    glicko2Manager: { rebuild(): void };
}

// What the derived data was last computed from (ReplayRepository.dataSignature), and when. The hourly
// refresh skips the work while the replays are the same, but not for more than a day: the Glicko
// preview deviation grows with time, so it is recomputed daily even when nothing was uploaded.
// A rebuild after the metadata changed passes force.
const MAX_AGE_MS = 24 * 3600 * 1000;
let current: string | null = null;
let currentAt = 0;

function markDerivedDataCurrent(signature: string): void {
    current = signature;
    currentAt = Date.now();
}

// The in-memory data derived from the replays: the local ratings caches and the Glicko sets. Each
// step is synchronous CPU work on the one main thread, so the steps run in turns of the event loop:
// requests are answered between them, and the longest wait is the longest single step, not the sum.
// A step that throws is counted (rebuild_failures_total) and stops the rest. Resolves to the time each
// step took, or to null when nothing changed since the last run.
// shortcut: a step is still one block, make that step incremental or move it to a worker if it gets long.
async function rebuildDerivedData(server: DerivedDataSources, signature: string, force = false): Promise<number[] | null> {
    if (!force && signature === current && Date.now() - currentAt < MAX_AGE_MS) {
        logger.info("No replay was added or removed in the last day: the derived data is left as it is");
        return null;
    }

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
        try {
            step();
        }
        catch (error) {
            rebuildFailuresTotal.labels(name).inc();
            throw error;
        }
        durations.push(Date.now() - start);
        logger.info(`Rebuilt the ${name} data in ${durations[durations.length - 1]} ms`);
    }

    markDerivedDataCurrent(signature);
    rebuildLastSuccess.labels("derived-data").setToCurrentTime();
    return durations;
}

export { markDerivedDataCurrent, rebuildDerivedData };
