import { EngineInstance as Engine } from '../types/Engine';

/**
 * This class is responsible for interactions with cache files, like loading or saving.
 * It is able to detect whether the database structure has changed, due to installation of a new version of the mod.
 */
class LocalRatingsCache {
    version = 6;
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

    updateVersion() {
        Engine.WriteJSONFile(this.cacheVersionFile, { "version": this.version });
    }

    isUpdateRequired() {
        return !Engine.FileExists(this.cacheVersionFile) || (Engine.ReadJSONFile(this.cacheVersionFile) as { "version": number }).version !== this.version;
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
