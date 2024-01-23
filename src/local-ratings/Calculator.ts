import { LocalRatingsFilter } from "./Filter";
import { LocalRatingsReplay } from "./Replay";
import { LocalRatingsReplayDB } from "./ReplayDB";
import { LocalRatingsWeights } from "./Weights";
import { getMean_LocalRatings } from "./utilities/functions_utility";
import { LocalRatingsHistoryDatabase, LocalRatingsHistoryDirectoryElement } from "./types/HistoryDatabase";
import { LocalRatingsRatingDatabase } from "./types/RatingDatabase";
import { LocalRatingsReplayDatabase } from "./types/ReplayDatabase";

/**
 * This class is responsible for performing the rating computation.
 * It operates only onto its attributes and not on actual database files stored in the cache.
 */
class LocalRatingsCalculator
{

    ratingsDatabase: LocalRatingsRatingDatabase
    historyDatabase: LocalRatingsHistoryDatabase

    constructor()
    {
        this.ratingsDatabase = {};
        this.historyDatabase = {};
    }

    getScore(replayObj : LocalRatingsReplay, player : string)
    {
        const playerIndex = replayObj.players.indexOf(player);
        const scores = replayObj.scores[playerIndex];
        const weights = new LocalRatingsWeights();
        const score = Object.keys(scores).reduce((pv, cv) => pv + scores[cv] * weights[cv.toLowerCase()], 0);
        return score;
    }

    getRating(playerScore : number, averageScore : number) : number
    {
        return (averageScore == 0) ? 0 : (playerScore - averageScore) / averageScore;
    }

    run(replayDatabase : LocalRatingsReplayDatabase)
    {
        // Load match filters
        const filterObj = new LocalRatingsFilter();
        // Generate a temporary history database
        const tmpHistoryDatabase = {} as LocalRatingsHistoryDatabase;

        const safeDb = Object.values(JSON.parse(JSON.stringify(replayDatabase)));

        for (const replayObj of safeDb as LocalRatingsReplay[])
        {
            // Skip replay if invalid
            if (!replayObj.isValid)
                continue;


            // Skip replay if filters apply
            if (filterObj.applies(replayObj))
                continue;


            // Compute replay data
            const players = replayObj.players;
            const scores = players.map((x) => this.getScore(replayObj, x));
            const averageScore = getMean_LocalRatings(scores);
            const ratings = players.map((x, i) => this.getRating(scores[i], averageScore));

            // Update temporary history database
            for (const player in players)
            {
                const playerName = players[player];
                if (!(playerName in tmpHistoryDatabase))
                    tmpHistoryDatabase[playerName] = {} as LocalRatingsHistoryDirectoryElement;
                tmpHistoryDatabase[playerName][replayObj.directory] = {
                    "rating": ratings[player],
                    "civ": replayObj.civs[player]
                }
            }
        }

        // Now that temporary history database is populated, we can update the databases
        for (const player in tmpHistoryDatabase)
        {
            const tmpMatches = Object.values(tmpHistoryDatabase[player]).length;
            const tmpRating = getMean_LocalRatings(Object.values(tmpHistoryDatabase[player]).map(x => x.rating))

            // Known player
            if (player in this.ratingsDatabase)
            {
                const oldMatches = this.ratingsDatabase[player].matches;
                const oldRating = this.ratingsDatabase[player].rating;
                const newMatches = oldMatches + tmpMatches;
                const newRating = (oldRating*oldMatches + tmpRating*tmpMatches) / newMatches;
                this.ratingsDatabase[player] = {
                    "rating": newRating,
                    "matches": newMatches
                };
                Object.assign(this.historyDatabase[player], tmpHistoryDatabase[player]);
            }

            // Unknown player
            else
            {
                this.ratingsDatabase[player] = {
                    "rating": tmpRating,
                    "matches": tmpMatches
                };
                this.historyDatabase[player] = Object.assign({}, tmpHistoryDatabase[player]);
            }
        }
    }

    rebuild()
    {
        this.ratingsDatabase = {};
        this.historyDatabase = {};
        const replayDB = new LocalRatingsReplayDB();
        replayDB.load();
        this.merge(replayDB.replayDatabase);
    }

    merge(newReplays: LocalRatingsReplayDatabase)
    {
        this.run(newReplays);
    }

}

export {
    LocalRatingsCalculator
}

