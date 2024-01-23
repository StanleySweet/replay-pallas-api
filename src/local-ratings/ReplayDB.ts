import { LocalRatingsCache } from "./Cache";
import { LocalRatingsMinifier } from "./Minifier";
import { EngineInstance as Engine } from "../types/Engine";
import { LocalRatingsReplay } from "./Replay";
import { LocalRatingsMetadataContainer } from "./types/MetadataContainer";
import { LocalRatingsReplayDatabase } from "./types/ReplayDatabase";

/**
 * This class is responsible for updating or rebuilding the replay database stored in the cache folder.
 */
class LocalRatingsReplayDB {
    replayDatabase: LocalRatingsReplayDatabase;
    newReplays: LocalRatingsReplayDatabase;
    cache: LocalRatingsCache;
    minifier: LocalRatingsMinifier;
    constructor() {
        this.replayDatabase = {} as LocalRatingsReplayDatabase;
        this.newReplays = {} as LocalRatingsReplayDatabase;
        this.cache = new LocalRatingsCache();
        this.minifier = new LocalRatingsMinifier();
    }

    addReplays(replaySet : LocalRatingsMetadataContainer[], database : LocalRatingsReplayDatabase) {
        for (const replay of replaySet) {
            const replayObj = new LocalRatingsReplay(replay);
            if (replayObj.isValid)
                database[replay.directory] = replayObj;
        }
    }

    isEmpty() {
        const database = this.cache.load("replayDatabase");
        return Object.keys(database).length === 0;
    }

    load() {
        this.replayDatabase = this.minifier.magnifyReplayDatabase(this.cache.load("replayDatabase"));
    }

    save() {
        this.cache.save("replayDatabase", this.minifier.minifyReplayDatabase(this.replayDatabase));
    }

    rebuild() {
        this.addReplays(Engine.GetReplays(), this.replayDatabase);
        this.cache.updateVersion();
        this.save();
    }

    update() {
        this.load();

        // Update the replay database with new replays
        const unScanned = Engine.GetReplays().filter((x: LocalRatingsMetadataContainer) => !(x.directory in this.replayDatabase));

        if (unScanned.length == 0)
            return;

        // Add new replays
        this.addReplays(unScanned, this.newReplays);
        Object.assign(this.replayDatabase, this.newReplays);

        // Save
        this.save();
    }

}


export {
    LocalRatingsReplayDB
}
