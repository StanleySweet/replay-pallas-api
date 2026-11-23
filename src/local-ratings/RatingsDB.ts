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
    // 0 is the set over every replay, a number above 0 the set over that 0 A.D. release only.
    scope: number;
    // For a release: which replays belong to it.
    keep?: (matchId: string) => boolean;

    constructor(cache: LocalRatingsCache, minifier: LocalRatingsMinifier, scope = 0) {
        this.scope = scope;
        this.ratingsDatabase = {};
        this.historyDatabase = {};
        this.cache = cache;
        this.minifier = minifier;
        this.calculator = new LocalRatingsCalculator();
        this.calculator.ratingsDatabase = this.ratingsDatabase;
        this.calculator.historyDatabase = this.historyDatabase;
    }

    load() {
        this.ratingsDatabase = this.minifier.magnifyRatingsDatabase(this.cache.load("ratingsDatabase", this.scope) as LocalRatingsMinifiedRatingDatabase);
        this.historyDatabase = this.minifier.magnifyHistoryDatabase(this.cache.load("historyDatabase", this.scope) as LocalRatingsHistoryMinifiedDatabase);
        this.calculator.ratingsDatabase = this.ratingsDatabase;
        this.calculator.historyDatabase = this.historyDatabase;
    }

    save() {
        this.cache.save("ratingsDatabase", this.minifier.minifyRatingsDatabase(this.ratingsDatabase), this.scope);
        this.cache.save("historyDatabase", this.minifier.minifyHistoryDatabase(this.historyDatabase), this.scope);
    }

    rebuild(source?: LocalRatingsReplayDatabase) {
        const timer = ratingsCalculationDuration.startTimer({ operation: 'rebuild' });
        this.calculator.rebuild(this.cache, this.minifier, this.keep, source);

        // Update globals
        this.ratingsDatabase = this.calculator.ratingsDatabase;
        this.historyDatabase = this.calculator.historyDatabase;
        const ratingsCount = Object.keys(this.ratingsDatabase).length;
        const playersCount = Object.keys(this.historyDatabase).length;
        logger.info(`Rebuilding the rating database. ${ratingsCount} ratings and ${playersCount} history points were added.`);
        
        // Update metrics: they describe the set over every replay only.
        if (this.scope === 0) {
            ratingsInDatabase.set(Object.keys(this.ratingsDatabase).length);
            playersWithRatingsGauge.set(Object.keys(this.historyDatabase).length);
        }
        timer();
        this.save();
    }

    merge(newReplays: LocalRatingsReplayDatabase) {
        const timer = ratingsCalculationDuration.startTimer({ operation: 'merge' });
        logger.info(`Merging ${Object.keys(newReplays).length} replay(s) in the rating database.`);
        const keep = this.keep;
        this.calculator.merge(keep
            ? Object.fromEntries(Object.entries(newReplays).filter(([matchId]) => keep(matchId)))
            : newReplays);

        // Update globals
        this.ratingsDatabase = this.calculator.ratingsDatabase;
        this.historyDatabase = this.calculator.historyDatabase;
        
        // Update metrics
        if (this.scope === 0) {
            ratingsInDatabase.set(Object.keys(this.ratingsDatabase).length);
            playersWithRatingsGauge.set(Object.keys(this.historyDatabase).length);
        }
        timer();
    }
}

export {
    LocalRatingsRatingsDB
};