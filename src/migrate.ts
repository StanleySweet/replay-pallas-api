/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Database } from "better-sqlite3";
import { readdirSync, readFileSync } from "fs";
import path from "path";

// Applies the numbered NNN-name.sql files that are not in the migrations table yet.
//
// The table has the layout the `sqlite` package used, so databases migrated before this
// runner existed are recognised. Unlike that package, this never runs a Down section by
// itself: a row without a file, or an edited file, is left alone.
function migrate(db: Database, directory: string): string[] {
    db.exec(`CREATE TABLE IF NOT EXISTS "migrations" (
  id   INTEGER PRIMARY KEY,
  name TEXT    NOT NULL,
  up   TEXT    NOT NULL,
  down TEXT    NOT NULL
)`);

    const last = (db.prepare("SELECT MAX(id) AS id FROM migrations").get() as { id: number | null }).id ?? 0;
    const insert = db.prepare("INSERT INTO migrations (id, name, up, down) VALUES (?, ?, ?, ?)");

    const pending = readdirSync(directory)
        .map((file) => ({ file, match: file.match(/^(\d+)[-_.](.*?)\.sql$/) }))
        .filter((entry): entry is { file: string, match: RegExpMatchArray } => entry.match !== null)
        .map(({ file, match }) => ({ id: Number(match[1]), name: match[2], file }))
        .sort((a, b) => a.id - b.id)
        .filter((migration) => migration.id > last);

    // better-sqlite3 turns foreign keys on, the driver the migrations were written for did not. With
    // them on, a migration that drops and recreates a table would cascade-delete its child rows.
    // The pragma cannot change inside a transaction, so it is switched around the whole run.
    const foreignKeys = db.pragma("foreign_keys", { simple: true });
    db.pragma("foreign_keys = OFF");

    const applied: string[] = [];
    try {
        for (const migration of pending) {
            const [up, down = ""] = readFileSync(path.join(directory, migration.file), "utf8").split(/^--\s+?down\b/im);
            const strip = (sql: string) => sql.replace(/^-- .*?$/gm, "").trim();

            // One transaction per file: a failing migration leaves no half-applied state and no row.
            db.transaction(() => {
                db.exec(strip(up));
                insert.run(migration.id, migration.name, strip(up), strip(down));
            })();
            applied.push(migration.name);
        }
    } finally {
        db.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
    }

    return applied;
}

export { migrate };
