import { EngineInstance as Engine } from "../types/Engine";
import { PlayerFilterConfigurationOptions } from "./types/PlayerFilterConfigurationOptions";
import { LocalRatingsRatingDatabase } from "./types/RatingDatabase";

/**
 * This class is responsible for reading the user-defined player filters from the user.cfg configuraton file and use them to check whether a replay object must be filtered or not.
 * The method applies(playerName) returns true if player must be filtered, false otherwise.
 */
class LocalRatingsPlayerFilter {
    ratingsDatabase: LocalRatingsRatingDatabase;
    configOptions: PlayerFilterConfigurationOptions;

    constructor(ratingsDatabase: LocalRatingsRatingDatabase) {
        this.ratingsDatabase = ratingsDatabase;
        this.configOptions = {
            "mingames": this.getMinGames(),
            "limitmaxgames": this.getLimitMaxGames(),
            "maxgames": this.getMaxGames(),
            "limitminrating": this.getLimitMinRating(),
            "minrating": this.getMinRating(),
            "limitmaxrating": this.getLimitMaxRating(),
            "maxrating": this.getMaxRating()
        };
    }

    // Config option retrieval functions

    getMinGames() {
        const minGamesValue = Engine.ConfigDB_GetValue("user", "localratings.playerfilter.mingames");
        const minGamesValueInt = +(minGamesValue ?? 0);
        return minGamesValueInt;
    }

    getLimitMaxGames() {
        const limitMaxGamesValue = Engine.ConfigDB_GetValue("user", "localratings.playerfilter.limitmaxgames");
        const limitMaxGamesValueBoolean = (limitMaxGamesValue === "true");
        return limitMaxGamesValueBoolean;
    }

    getMaxGames() {
        const maxGamesValue = Engine.ConfigDB_GetValue("user", "localratings.playerfilter.maxgames");
        const maxGamesValueInt = +(maxGamesValue ?? 0);
        return maxGamesValueInt;
    }

    getLimitMinRating() {
        const limitMinRatingValue = Engine.ConfigDB_GetValue("user", "localratings.playerfilter.limitminrating");
        const limitMinRatingValueBoolean = (limitMinRatingValue === "true");
        return limitMinRatingValueBoolean;
    }

    getMinRating() {
        const minRatingValue = Engine.ConfigDB_GetValue("user", "localratings.playerfilter.minrating");
        const minRatingValueFloat = +(minRatingValue ?? 0);
        return minRatingValueFloat;
    }

    getLimitMaxRating() {
        const limitMaxRatingValue = Engine.ConfigDB_GetValue("user", "localratings.playerfilter.limitmaxrating");
        const limitMaxRatingValueBoolean = (limitMaxRatingValue === "true");
        return limitMaxRatingValueBoolean;
    }

    getMaxRating() {
        const maxRatingValue = Engine.ConfigDB_GetValue("user", "localratings.playerfilter.maxrating");
        const maxRatingValueFloat = +(maxRatingValue ?? 0);
        return maxRatingValueFloat;
    }

    // Filtering functions

    filterMinGames(playerName: string) {
        return (this.ratingsDatabase[playerName].matches < this.configOptions.mingames);
    }

    filterMaxGames(playerName : string) {
        if (!this.configOptions.limitmaxgames)
            return false;
        return (this.ratingsDatabase[playerName].matches > this.configOptions.maxgames);
    }

    filterMinRating(playerName : string) {
        if (!this.configOptions.limitminrating)
            return false;
        return (this.ratingsDatabase[playerName].rating < this.configOptions.minrating / 100);
    }

    filterMaxRating(playerName : string) {
        if (!this.configOptions.limitmaxrating)
            return false;
        return (this.ratingsDatabase[playerName].rating > this.configOptions.maxrating / 100);
    }

    // Main function

    applies(playerName : string) {
        if (this.filterMinGames(playerName))
            return true;
        if (this.filterMaxGames(playerName))
            return true;
        if (this.filterMinRating(playerName))
            return true;
        if (this.filterMaxRating(playerName))
            return true;
        return false;
    }

}

export {
    LocalRatingsPlayerFilter
};
