import { LocalRatingsCache } from "./Cache";
import { LocalRatingsMinifier } from "./Minifier";
import { EngineInstance as Engine } from "../types/Engine";
import { LocalRatingsReplay } from "./Replay";
import { LocalRatingsReplayDatabase } from "./types/ReplayDatabase";
import pino from 'pino';
import { LocalRatingsMinifiedRatingDatabase } from "./types/RatingDatabase";

/**
 * This class is responsible for updating or rebuilding the replay database stored in the cache folder.
 */
class LocalRatingsReplayDB {
    replayDatabase: LocalRatingsReplayDatabase;
    cache: LocalRatingsCache;
    minifier: LocalRatingsMinifier;
    batchSize: number;
    constructor(cache: LocalRatingsCache, minifier: LocalRatingsMinifier) {
        this.replayDatabase = {} as LocalRatingsReplayDatabase;
        this.cache = cache;
        this.minifier = minifier;
        this.batchSize = 50;
    }

    isEmpty() {
        const database = this.cache.load("replayDatabase");
        return Object.keys(database).length === 0;
    }

    load() {
        this.replayDatabase = this.minifier.magnifyReplayDatabase(this.cache.load("replayDatabase") as LocalRatingsMinifiedRatingDatabase);
    }

    save() {
        this.cache.save("replayDatabase", this.minifier.minifyReplayDatabase(this.replayDatabase));
    }

    delete(matchId: string) {
        if (matchId in this.replayDatabase) {
            delete this.replayDatabase[matchId];
            this.save();
        }
    }

    rebuild() {
        let count = 0;
        let offset = 0;
        let hasMoreData = true;
        while (hasMoreData) {
            const replays = Engine.GetReplays(this.batchSize, offset);
            offset += replays.length;
            if (replays.length === 0) {
                hasMoreData = false;
                break;
            }

            for (const replay of replays) {
                const replayObj = new LocalRatingsReplay(replay);
                if (replayObj.isValid) {
                    ++count;
                    this.replayDatabase[replay.directory] = replayObj;
                }
            }
        }

        pino().info(`Found ${offset} replays. Added ${count} valid new replay(s) to the replay database.`);
        this.cache.updateVersion();
        this.save();
    }

    update(): LocalRatingsReplayDatabase {
        this.load();
        let count = 0;
        let offset = 0;
        let hasMoreData = true;
        const currentKeys = Object.keys(this.replayDatabase);
        const newReplayDatabase = {} as LocalRatingsReplayDatabase;
        while (hasMoreData) {
            const replays = Engine.GetNewReplays(currentKeys, this.batchSize, offset);
            offset += replays.length;
            if (replays.length === 0) {
                hasMoreData = false;
                break;
            }

            for (const replay of replays) {
                const replayObj = new LocalRatingsReplay(replay);
                if (replayObj.isValid) {
                    ++count;
                    this.replayDatabase[replay.directory] = replayObj;
                    newReplayDatabase[replay.directory] = replayObj;
                }
            }
        }

        pino().info(`Found ${offset} new replays. Added ${count} valid new replay(s) to the replay database.`);
        this.save();

        return newReplayDatabase;
    }
}


export {
    LocalRatingsReplayDB
};
