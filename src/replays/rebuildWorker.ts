/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { parentPort, workerData } from "worker_threads";
import Database from "better-sqlite3";
import { rebuildReplayMetadata } from "./rebuildMetadata";

// Runs the metadata rebuild on its own database connection, so the API keeps answering meanwhile.
// WAL lets the main thread keep reading, and busy_timeout lets the final transaction wait for a write
// that is in progress, an upload for instance, instead of failing.
const db = new Database((workerData as { databasePath: string }).databasePath);
db.pragma("busy_timeout = 60000");
db.pragma("foreign_keys = ON");

try {
    const result = rebuildReplayMetadata(db, progress => parentPort?.postMessage({ type: "progress", progress }));
    parentPort?.postMessage({ type: "done", progress: result });
}
catch (error) {
    parentPort?.postMessage({ type: "failed", message: error instanceof Error ? error.message : String(error) });
}
finally {
    db.close();
}
