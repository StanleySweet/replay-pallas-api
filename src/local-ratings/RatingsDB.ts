import { logger } from "../logger";
import { LocalRatingsCache } from "./Cache";
import { LocalRatingsCalculator } from "./Calculator";
import { LocalRatingsMinifier } from "./Minifier";
import { LocalRatingsHistoryDatabase, LocalRatingsHistoryMinifiedDatabase } from "./types/HistoryDatabase";
import { LocalRatingsMinifiedRatingDatabase, LocalRatingsRatingDatabase } from "./types/RatingDatabase";
import { LocalRatingsReplayDatabase } from "./types/ReplayDatabase";
import { ratingsCalculationDuration, ratingsInDatabase, playersWithRatingsGauge } from "../prometheus";

/**
 * This class is responsible for updating the ratings and history databases stored in the cache folder.
 */
class LocalRatingsRatingsDB {
    ratingsDatabase: LocalRatingsRatingDatabase;
    historyDatabase: LocalRatingsHistoryDatabase;
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
        this.ratingsDatabase = this.minifier.magnifyRatingsDatabase(this.cache.load("ratingsDatabase") as LocalRatingsMinifiedRatingDatabase);
        this.historyDatabase = this.minifier.magnifyHistoryDatabase(this.cache.load("historyDatabase") as LocalRatingsHistoryMinifiedDatabase);
        this.calculator.ratingsDatabase = this.ratingsDatabase;
        this.calculator.historyDatabase = this.historyDatabase;
    }

    save() {
        this.cache.save("ratingsDatabase", this.minifier.minifyRatingsDatabase(this.ratingsDatabase));
        this.cache.save("historyDatabase", this.minifier.minifyHistoryDatabase(this.historyDatabase));
    }

    rebuild() {
        const timer = ratingsCalculationDuration.startTimer({ operation: 'rebuild' });
        this.calculator.rebuild(this.cache, this.minifier);

        // Update globals
        this.ratingsDatabase = this.calculator.ratingsDatabase;
        this.historyDatabase = this.calculator.historyDatabase;
        const ratingsCount = Object.keys(this.ratingsDatabase).length;
        const playersCount = Object.keys(this.historyDatabase).length;
        logger.info(`Rebuilding the rating database. ${ratingsCount} ratings and ${playersCount} history points were added.`);
        
        // Update metrics
        ratingsInDatabase.set(Object.keys(this.ratingsDatabase).length);
        playersWithRatingsGauge.set(Object.keys(this.historyDatabase).length);
        timer();
        this.save();
    }

    merge(newReplays: LocalRatingsReplayDatabase) {
        const timer = ratingsCalculationDuration.startTimer({ operation: 'merge' });
        logger.info(`Merging ${Object.keys(newReplays).length} replay(s) in the rating database.`);
        this.calculator.merge(newReplays);

        // Update globals
        this.ratingsDatabase = this.calculator.ratingsDatabase;
        this.historyDatabase = this.calculator.historyDatabase;
        
        // Update metrics
        ratingsInDatabase.set(Object.keys(this.ratingsDatabase).length);
        playersWithRatingsGauge.set(Object.keys(this.historyDatabase).length);
        timer();
    }
}

export {
    LocalRatingsRatingsDB
};