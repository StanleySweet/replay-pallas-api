import { LocalRatingsCache } from "./Cache";
import { LocalRatingsCalculator } from "./Calculator";
import { LocalRatingsMinifier } from "./Minifier";
import { LocalRatingsHistoryDatabase } from "./types/HistoryDatabase";
import { LocalRatingsRatingDatabase } from "./types/RatingDatabase";
import { LocalRatingsReplayDatabase } from "./types/ReplayDatabase";

/**
 * This class is responsible for updating the ratings and history databases stored in the cache folder.
 */
class LocalRatingsRatingsDB
{
    ratingsDatabase : LocalRatingsRatingDatabase
    historyDatabase : LocalRatingsHistoryDatabase
    cache: LocalRatingsCache;
    minifier: LocalRatingsMinifier;

    constructor()
    {
        this.ratingsDatabase = {};
        this.historyDatabase = {};
        this.cache = new LocalRatingsCache();
        this.minifier = new LocalRatingsMinifier();
    }

    load()
    {
        this.ratingsDatabase = this.minifier.magnifyRatingsDatabase(this.cache.load("ratingsDatabase"));
        this.historyDatabase = this.minifier.magnifyHistoryDatabase(this.cache.load("historyDatabase"));
    }

    save()
    {
        this.cache.save("ratingsDatabase", this.minifier.minifyRatingsDatabase(this.ratingsDatabase));
        this.cache.save("historyDatabase", this.minifier.minifyHistoryDatabase(this.historyDatabase));
    }

    rebuild()
    {
        // Run calculator
        const calculator = new LocalRatingsCalculator();
        calculator.rebuild();

        // Update globals
        this.ratingsDatabase = calculator.ratingsDatabase;
        this.historyDatabase = calculator.historyDatabase;
    }

    merge(newReplays : LocalRatingsReplayDatabase)
    {
        // Run calculator
        const calculator = new LocalRatingsCalculator();
        calculator.ratingsDatabase = this.ratingsDatabase;
        calculator.historyDatabase = this.historyDatabase;
        calculator.merge(newReplays);

        // Update globals
        this.ratingsDatabase = calculator.ratingsDatabase;
        this.historyDatabase = calculator.historyDatabase;
    }
}

export {
    LocalRatingsRatingsDB
}
