import { renameSync } from 'fs';
import { LocalCacheRepository, Rows } from '../repositories/LocalCacheRepository';
import { EngineInstance as Engine } from '../types/Engine';

// Where the cache version is recorded. local_ratings_configuration already exists
// (migrations/004) and Engine.ConfigDB_* already speak to it, so tracking the version
// in SQLite needs no new table and no new migration.
const VERSION_SECTION = "localratings";
const VERSION_KEY = "cacheversion";

// One table per cache (migrations/013). Names are constants, never user input, so they
// are interpolated into the SQL.
// scoped tables hold one set per scope: 0 is every replay, a number above 0 is that 0 A.D. release.
const TABLES: { [tag: string]: { table: string, key: string, legacyFile: string, scoped?: boolean } } = {
    "replayDatabase": { "table": "local_replays", "key": "match_id", "legacyFile": "dist/cache/replayDatabase.json" },
    "ratingsDatabase": { "table": "local_ratings", "key": "player", "legacyFile": "dist/cache/ratingsDatabase.json", "scoped": true },
    "historyDatabase": { "table": "local_history", "key": "player", "legacyFile": "dist/cache/historyDatabase.json", "scoped": true },
    "aliasesDatabase": { "table": "local_aliases", "key": "alias_group", "legacyFile": "dist/cache/aliasesDatabase.json" },
};

/**
 * This class is responsible for interactions with the local-ratings caches, like loading or saving.
 * It is able to detect whether the database structure has changed, due to installation of a new version of the mod.
 */
class LocalRatingsCache {
    // Bump to invalidate every cache. 7: replay `date` is now the UTC calendar
    // day instead of the host-local one, so the cached replay database must be rebuilt.
    version = 7;

    /**
     * The SQLite row is authoritative: a database restored from an older backup reads as
     * stale and rebuilds rather than trusting caches that may predate it.
     */
    isUpdateRequired(): boolean {
        // No database means no way to tell, so assume the worst and rebuild.
        if (Engine.database === null)
            return true;

        const recorded = Engine.ConfigDB_GetValue(VERSION_SECTION, VERSION_KEY);
        return recorded === null || +recorded !== this.version;
    }

    /**
     * Record that the caches now match `version`. Call this only once every rebuild
     * has persisted, so a failure part-way through leaves the version unrecorded and the
     * next boot rebuilds.
     */
    markAsCurrent(): void {
        if (Engine.database !== null)
            Engine.ConfigDB_CreateValue(VERSION_SECTION, VERSION_KEY, `${this.version}`);
    }

    private store(): LocalCacheRepository | null {
        return Engine.database === null ? null : new LocalCacheRepository(Engine.database);
    }

    load(tag: string, scope = 0): Rows {
        const spec = TABLES[tag];
        const store = this.store();
        if (!spec || !store)
            return {};

        if (scope === 0)
            this.importLegacyFile(store, tag);

        return store.load(spec, scope);
    }

    /** Replace the whole cache. */
    save(tag: string, json: unknown, scope = 0): void {
        const spec = TABLES[tag];
        const store = this.store();
        if (!spec || !store)
            return;

        store.replace(spec, json as Rows, scope);

        // The table now holds this cache; a leftover file would only ever be stale.
        if (scope === 0 && Engine.FileExists(spec.legacyFile))
            renameSync(spec.legacyFile, `${spec.legacyFile}.migrated`);
    }

    /** Add or overwrite some entries, leaving the others as they are. */
    merge(tag: string, json: unknown, scope = 0): void {
        const spec = TABLES[tag];
        const store = this.store();
        if (!spec || !store)
            return;

        store.merge(spec, json as Rows, scope);
    }

    /**
     * One-time import of the JSON files this cache used before migrations/013: when a table is
     * empty and its file still exists, the file's content moves into the table (save() then renames
     * the file so it cannot be imported twice). Replay entries whose replay no longer exists are
     * skipped, as the foreign key would refuse them anyway.
     */
    private importLegacyFile(store: LocalCacheRepository, tag: string): void {
        const spec = TABLES[tag];
        if (!Engine.FileExists(spec.legacyFile) || !store.isEmpty(spec))
            return;

        let rows = Engine.ReadJSONFile(spec.legacyFile) as Rows;
        if (tag === "replayDatabase")
            rows = Object.fromEntries(Object.entries(rows).filter(([matchId]) => store.replayExists(matchId)));

        this.save(tag, rows);
    }
}

export {
    LocalRatingsCache
};
