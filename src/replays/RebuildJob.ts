/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Worker } from "worker_threads";
import path from "path";
import { logger } from "../logger";
import { RebuildProgress } from "./rebuildMetadata";

type RebuildState = "idle" | "reading" | "writing" | "finishing" | "done" | "failed";

interface RebuildStatus {
    state: RebuildState;
    done: number;
    total: number;
    skipped: number;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
}

const idle = (): RebuildStatus => ({ state: "idle", done: 0, total: 0, skipped: 0, startedAt: null, finishedAt: null, error: null });

// One metadata rebuild at a time, run in a worker thread, with a status anyone can read while it runs.
class MetadataRebuildJob {
    status: RebuildStatus = idle();
    private running = false;

    isRunning(): boolean {
        return this.running;
    }

    // Starts the rebuild unless one is running. `afterwards` runs on the main thread once the worker
    // has written its results: it refreshes the in-memory caches that are derived from them.
    start(databasePath: string, afterwards: () => void | Promise<void>): boolean {
        if (this.running)
            return false;

        this.running = true;
        this.status = { ...idle(), state: "reading", startedAt: new Date().toISOString() };

        const worker = new Worker(path.join(__dirname, "rebuildWorker.js"), { workerData: { databasePath } });
        worker.on("message", async (message: { type: string, progress?: RebuildProgress, message?: string }) => {
            if (message.progress)
                this.status = { ...this.status, state: message.progress.phase, done: message.progress.done, total: message.progress.total, skipped: message.progress.skipped };

            if (message.type === "done") {
                this.status.state = "finishing";
                try {
                    await afterwards();
                    this.finish("done", null);
                }
                catch (error) {
                    this.finish("failed", error);
                }
            }
            else if (message.type === "failed") {
                this.finish("failed", message.message);
            }
        });
        worker.on("error", error => this.finish("failed", error));
        worker.on("exit", code => {
            if (this.running && code !== 0)
                this.finish("failed", `the rebuild worker stopped with code ${code}`);
        });
        return true;
    }

    private finish(state: "done" | "failed", error: unknown): void {
        this.running = false;
        this.status = { ...this.status, state, finishedAt: new Date().toISOString(), error: error ? String(error) : null };
        if (state === "failed")
            logger.error({ err: error }, "The replay metadata rebuild failed");
    }
}

export { MetadataRebuildJob };
export type { RebuildStatus };
