import { LocalRatingsCache } from "./Cache";
import { sortString_LocalRatings } from "./utilities/functions_utility";
import { LocalRatingsHistoryDatabase } from "./types/HistoryDatabase";
import { LocalRatingsRatingDatabase } from "./types/RatingDatabase";

/**
 * This class is responsible for updating the aliases database stored in the cache folder
 * and for updating ratings and history databases bases on alias association.
 */
class LocalRatingsAlias {

    aliasesDatabase: any;
    cache: LocalRatingsCache;

    constructor(cache: LocalRatingsCache) {
        this.aliasesDatabase = {};
        this.cache = cache;
    }

    load() {
        this.aliasesDatabase = this.cache.load("aliasesDatabase");
    }

    save() {
        this.cache.save("aliasesDatabase", this.aliasesDatabase);
    }

    merge(ratingsDatabase: LocalRatingsRatingDatabase | undefined, historyDatabase: LocalRatingsHistoryDatabase | undefined) {
        if (!ratingsDatabase && !historyDatabase)
            return;

        this.load();

        const database = !historyDatabase ? ratingsDatabase! : historyDatabase;
        const entries: [string, string[]][] = Object.entries(this.aliasesDatabase);
        const groups = entries
            .map(([primary, aliases]) =>
                [primary, ...aliases]
                    .filter(x => x in database)
                    .sort(sortString_LocalRatings))
            .filter(x => x.length > 0);

        // We merge aliases based on the first identity of the group, alphabetically ordered.
        // This ensures that the order of replay keys (YYYY-MM-DD_XXXX) follows this order, and is
        // independent on who is the primary identity.
        // This affects, for example, the chart representation, where the order of replays matters.
        for (const group of groups) {
            const first = group[0];
            const aliases = group.slice(1);
            const duplicates: { [index: string]: number } = {};
            for (const alias of aliases) {
                // If ratingsDatabase is defined, merge information on first
                if (ratingsDatabase) {
                    ratingsDatabase[first].rating = (ratingsDatabase[first].rating * ratingsDatabase[first].matches + ratingsDatabase[alias].rating * ratingsDatabase[alias].matches) / (ratingsDatabase[first].matches + ratingsDatabase[alias].matches);
                    ratingsDatabase[first].matches += ratingsDatabase[alias].matches;
                }
                // If historyDatabase is defined, merge information on first
                if (historyDatabase) {
                    // Change keys for duplicates. This occurs when multiple aliases are in the same game
                    Object.keys(historyDatabase[first])
                        .filter(x => Object.keys(historyDatabase[alias]).includes(x))
                        .forEach(x => {
                            (x in duplicates) ? duplicates[x] += 1 : duplicates[x] = 1;
                            historyDatabase[alias][x + "_" + duplicates[x]] = historyDatabase[alias][x];
                            delete historyDatabase[alias][x];
                        });
                    Object.assign(historyDatabase[first], historyDatabase[alias]);
                }
            }
            for (const alias of aliases) {
                // If ratingsDatabase is defined, copy information on aliases
                if (ratingsDatabase)
                    ratingsDatabase[alias] = ratingsDatabase[first];
                // If historyDatabase is defined, copy information on aliases
                if (historyDatabase)
                    historyDatabase[alias] = historyDatabase[first];
            }
        }
    }

    removeDuplicates(ratingsDatabase: LocalRatingsRatingDatabase, historyDatabase: LocalRatingsHistoryDatabase | undefined) {
        this.load();
        Object.values(this.aliasesDatabase).flat().forEach(alias => {


            delete ratingsDatabase[alias as keyof typeof ratingsDatabase];
            if (historyDatabase)
                delete historyDatabase[alias as keyof typeof historyDatabase];
        });
    }

}

export {
    LocalRatingsAlias
};
