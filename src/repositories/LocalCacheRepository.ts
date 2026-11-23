/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Database } from "better-sqlite3";

// What one cache table looks like (migrations/013 and 016). Names are constants in Cache.ts, never user
// input, so they are interpolated into the SQL. A scoped table holds one set per scope.
interface CacheTable {
    table: string;
    key: string;
    scoped?: boolean;
}

type Rows = { [key: string]: unknown };

// The local ratings cache tables: one row per entry, the entry as JSON.
class LocalCacheRepository {
    constructor(private readonly db: Database) { }

    // rowid order keeps the insertion order the JSON object used to have.
    load(spec: CacheTable, scope: number): Rows {
        const rows = this.db.prepare(`Select ${spec.key} as k, data From ${spec.table} ${spec.scoped ? "Where scope = @scope" : ""} Order By rowid;`).all(spec.scoped ? { scope } : {}) as { k: string, data: string }[];
        const result: Rows = {};
        for (const row of rows)
            result[row.k] = JSON.parse(row.data);
        return result;
    }

    // Replaces the whole set of the scope with rows.
    replace(spec: CacheTable, rows: Rows, scope: number): void {
        this.db.transaction(() => {
            if (spec.scoped)
                this.db.prepare(`Delete From ${spec.table} Where scope = @scope;`).run({ scope });
            else
                this.db.prepare(`Delete From ${spec.table};`).run();
            this.upsert(spec, rows, scope);
        })();
    }

    // Adds or overwrites some entries, leaving the others as they are.
    merge(spec: CacheTable, rows: Rows, scope: number): void {
        this.db.transaction(() => this.upsert(spec, rows, scope))();
    }

    // True when the table (scope 0 for a scoped one) holds nothing yet.
    isEmpty(spec: CacheTable): boolean {
        return !this.db.prepare(`Select 1 From ${spec.table} ${spec.scoped ? "Where scope = 0" : ""} Limit 1;`).get();
    }

    // Whether a replay exists, to drop cache entries whose replay is gone (the foreign key would refuse them).
    replayExists(matchId: string): boolean {
        return !!this.db.prepare("Select 1 From replays Where match_id = ?;").get(matchId);
    }

    private upsert(spec: CacheTable, rows: Rows, scope: number): void {
        const statement = spec.scoped
            ? this.db.prepare(`Insert Into ${spec.table} (scope, ${spec.key}, data) Values (@scope, @k, @data) On Conflict(scope, ${spec.key}) Do Update Set data = excluded.data;`)
            : this.db.prepare(`Insert Into ${spec.table} (${spec.key}, data) Values (@k, @data) On Conflict(${spec.key}) Do Update Set data = excluded.data;`);
        for (const [k, value] of Object.entries(rows))
            statement.run(spec.scoped ? { scope, k, "data": JSON.stringify(value) } : { k, "data": JSON.stringify(value) });
    }
}

export { LocalCacheRepository };
export type { CacheTable, Rows };
