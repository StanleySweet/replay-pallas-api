import pino from "pino";
import { LocalRatingsCache } from "./Cache";
import { LocalRatingsCalculator } from "./Calculator";
import { LocalRatingsMinifier } from "./Minifier";
import { LocalRatingsHistoryDatabase } from "./types/HistoryDatabase";
import { LocalRatingsRatingDatabase } from "./types/RatingDatabase";
import { LocalRatingsReplayDatabase } from "./types/ReplayDatabase";

/**
 * This class is responsible for updating the ratings and history databases stored in the cache folder.
 */
class LocalRatingsRatingsDB {
    ratingsDatabase: LocalRatingsRatingDatabase
    historyDatabase: LocalRatingsHistoryDatabase
    cache: LocalRatingsCache;
    minifier: LocalRatingsMinifier;
    calculator: LocalRatingsCalculator;

    constructor(cache: LocalRatingsCache, minifier: LocalRatingsMinifier) {
        this.ratingsDatabase = {};
        this.historyDatabase = {};
        this.cache = cache;
        this.minifier = minifier;
        this.calculator = new LocalRatingsCalculator();
        this.calculator.ratingsDatabase = this.ratingsDatabase;
        this.calculator.historyDatabase = this.historyDatabase;
    }

    load() {
        this.ratingsDatabase = this.minifier.magnifyRatingsDatabase(this.cache.load("ratingsDatabase"));
        this.historyDatabase = this.minifier.magnifyHistoryDatabase(this.cache.load("historyDatabase"));
    }

    save() {
        this.cache.save("ratingsDatabase", this.minifier.minifyRatingsDatabase(this.ratingsDatabase));
        this.cache.save("historyDatabase", this.minifier.minifyHistoryDatabase(this.historyDatabase));
    }

    rebuild() {
        this.calculator.rebuild(this.cache, this.minifier);

        // Update globals
        this.ratingsDatabase = this.calculator.ratingsDatabase;
        this.historyDatabase = this.calculator.historyDatabase;
        pino().info(`Rebuilding the rating database. ${Object.keys(this.ratingsDatabase).length} ratings and ${Object.keys(this.historyDatabase).length} history points  were added.`)
        this.save();
    }

    merge(newReplays: LocalRatingsReplayDatabase) {
        pino().info(`Merging ${Object.keys(newReplays).length} replay(s) in the rating database.`)
        this.calculator.merge(newReplays);

        // Update globals
        this.ratingsDatabase = this.calculator.ratingsDatabase;
        this.historyDatabase = this.calculator.historyDatabase;
    }
}

export {
    LocalRatingsRatingsDB
}
