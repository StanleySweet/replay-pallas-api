import { EngineInstance as Engine } from '../types/Engine';

// Where the cache version is recorded. local_ratings_configuration already exists
// (migrations/004) and Engine.ConfigDB_* already speak to it, so tracking the version
// in SQLite needs no new table and no new migration.
const VERSION_SECTION = "localratings";
const VERSION_KEY = "cacheversion";

/**
 * This class is responsible for interactions with cache files, like loading or saving.
 * It is able to detect whether the database structure has changed, due to installation of a new version of the mod.
 */
class LocalRatingsCache {
    // Bump to invalidate every cached JSON file. 7: replay `date` is now the UTC calendar
    // day instead of the host-local one, so the cached replay database must be rebuilt.
    version = 7;
    replayDatabaseFile: string;
    ratingsDatabaseFile: string;
    historyDatabaseFile: string;
    aliasesDatabaseFile: string;
    cacheVersionFile: string;

    constructor() {
        const path = "dist/cache";
        this.replayDatabaseFile = path + "/replayDatabase.json";
        this.ratingsDatabaseFile = path + "/ratingsDatabase.json";
        this.historyDatabaseFile = path + "/historyDatabase.json";
        this.aliasesDatabaseFile = path + "/aliasesDatabase.json";
        this.cacheVersionFile = path + "/cacheVersion.json";

        this.createCacheFilesIfNotExist();
    }

    createCacheFilesIfNotExist() {
        [
            this.replayDatabaseFile,
            this.ratingsDatabaseFile,
            this.historyDatabaseFile,
            this.aliasesDatabaseFile
        ]
            .filter(x => !Engine.FileExists(x))
            .forEach(x => Engine.WriteJSONFile(x, {}));
    }

    tagToFilename(tag: string) {
        return (tag == "replayDatabase") ?
            this.replayDatabaseFile :
            (tag == "ratingsDatabase") ?
                this.ratingsDatabaseFile :
                (tag == "historyDatabase") ?
                    this.historyDatabaseFile :
                    (tag == "aliasesDatabase") ?
                        this.aliasesDatabaseFile :
                        "";
    }

    /**
     * The SQLite row is authoritative.
     *
     * This used to read cacheVersion.json, and nothing ever wrote that file: Cache.updateVersion()
     * was deleted in f122d0d, so a code version of 7 sat permanently against a stored 6 and every
     * boot paid a full rebuild of all 491 replays. Tracking the version next to the data it
     * describes keeps the two in step, and a database restored from an older backup reads as
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
     * Record that the cached JSON files now match `version`. Call this only once every rebuild
     * has persisted its file, so a failure part-way through leaves the version unrecorded and the
     * next boot rebuilds.
     *
     * The sidecar file is still written on purpose: a container running the previous build reads
     * nothing but that file, so during a rollout it is what keeps the old container from paying
     * the same rebuild. It can be dropped once no old container can reach the database.
     */
    markAsCurrent(): void {
        if (Engine.database !== null)
            Engine.ConfigDB_CreateValue(VERSION_SECTION, VERSION_KEY, `${this.version}`);

        Engine.WriteJSONFile(this.cacheVersionFile, { "version": this.version });
    }

    load(tag: string) {
        const file = this.tagToFilename(tag);
        const data = Engine.FileExists(file) && Engine.ReadJSONFile(file);
        return (data) ? data : {};
    }

    save(tag: string, json: unknown) {
        const file = this.tagToFilename(tag);
        Engine.WriteJSONFile(file, json);
    }

}

export {
    LocalRatingsCache
};
