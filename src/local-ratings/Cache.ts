import { EngineInstance as Engine } from '../types/Engine'

/**
 * This class is responsible for interactions with cache files, like loading or saving.
 * It is able to detect whether the database structure has changed, due to installation of a new version of the mod.
 */
class LocalRatingsCache {
    version = 5;
    replayDatabaseFile: string;
    ratingsDatabaseFile: string;
    historyDatabaseFile: string;
    aliasesDatabaseFile: string;
    cacheVersionFile: string;

    constructor() {
        const version = Engine.GetEngineInfo().mods.filter(x => x.mod == "public")[0].version;
        const path = "dist/cache/";
        this.replayDatabaseFile = path + version + "/replayDatabase.json";
        this.ratingsDatabaseFile = path + version + "/ratingsDatabase.json";
        this.historyDatabaseFile = path + version + "/historyDatabase.json";
        this.aliasesDatabaseFile = path + version + "/aliasesDatabase.json";
        this.cacheVersionFile = path + version + "/cacheVersion.json";

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
        Engine.ProfileStart("LocalRatingsCacheUpdateVersion");
        Engine.WriteJSONFile(this.cacheVersionFile, { "version": this.version });
        Engine.ProfileStop();
    }

    isUpdateRequired() {
        return !Engine.FileExists(this.cacheVersionFile) || Engine.ReadJSONFile(this.cacheVersionFile).version !== this.version;
    }

    load(tag: string) {
        Engine.ProfileStart("LocalRatingsLoadCacheFile");
        const file = this.tagToFilename(tag);
        const data = Engine.FileExists(file) && Engine.ReadJSONFile(file);
        Engine.ProfileStop();
        return (data) ? data : {};
    }

    save(tag: string, json: any) {
        Engine.ProfileStart("LocalRatingsSaveCacheFile");
        const file = this.tagToFilename(tag);
        Engine.WriteJSONFile(file, json);
        Engine.ProfileStop();
    }

}

export {
    LocalRatingsCache
}
