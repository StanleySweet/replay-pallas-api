import { LocalRatingsRatingsDB } from "./RatingsDB";
import { LocalRatingsReplay } from "./Replay";
import { LocalRatingsReplayDB } from "./ReplayDB";
import { LocalRatingsHistoryDatabase, LocalRatingsHistoryDatabaseElement, LocalRatingsHistoryDirectoryElement, LocalRatingsHistoryMinifiedDatabase, LocalRatingsHistoryMinifiedDatabaseElement, LocalRatingsHistoryMinifiedDirectoryElement } from "./types/HistoryDatabase";
import { LocalRatingsMinifiedRatingDatabase, LocalRatingsRatingDatabase } from "./types/RatingDatabase";
import { LocalRatingsMinifiedReplayDatabase, LocalRatingsMinifiedReplayDatabaseElement, LocalRatingsReplayDatabase } from "./types/ReplayDatabase";

/**
 * This class helps in reducing the space occupied by a replay object in the database
 */
class LocalRatingsMinifier {
    replayKeys: (keyof LocalRatingsReplayDatabase)[];
    minifiedReplayKeys: (keyof LocalRatingsMinifiedReplayDatabase)[];
    scoreKeys: string[];
    civs: string[];

    constructor() {
        // These keys MUST be the same as in Replay.js
        this.replayKeys = [
            "duration",
            "directory",
            "date",
            "players",
            "civs",
            "teamsSize",
            "startingResources",
            "populationCap",
            "worldPopulation",
            "hasAiPlayers",
            "cheatsEnabled",
            "revealedMap",
            "exploredMap",
            "nomad",
            "mods",
            "isValid",
            "scores"
        ];

        this.minifiedReplayKeys = [
            "duration",
            "directory",
            "date",
            "players",
            "civs",
            "teamsSize",
            "startingResources",
            "populationCap",
            "worldPopulation",
            "hasAiPlayers",
            "cheatsEnabled",
            "revealedMap",
            "exploredMap",
            "nomad",
            "mods",
            "isValid",
            "scores"
        ];


        // These keys MUST be the same as in Sequences.js
        this.scoreKeys = [
            "resourcesGathered",
            "resourcesUsed",
            "resourcesBought",
            "resourcesSold",
            "tributesSent",
            "tradeIncome",
            "enemyUnitsKilledValue",
            "enemyUnitsKilled",
            "unitsCapturedValue",
            "unitsCaptured",
            "enemyBuildingsDestroyedValue",
            "enemyBuildingsDestroyed",
            "buildingsCapturedValue",
            "buildingsCaptured",
            "percentMapExplored",
            "percentMapControlled",
            "peakPercentMapControlled",
            "successfulBribes"
        ];

        this.civs = [
            "ptol",
            "cart",
            "han",
            "spart",
            "mace",
            "rome",
            "athen",
            "maur",
            "sele",
            "gaul",
            "brit",
            "iber",
            "kush",
            "pers",
        ]
    }

    minifyNumber(number: number) {
        return Math.round(number * 1e4) / 1e4;
    }

    minifyReplay(replayObj: LocalRatingsReplay) : LocalRatingsMinifiedReplayDatabaseElement {
        return this.replayKeys.map((replayKey) => {
            if (replayKey === "scores") {
                return replayObj.scores.map((_, playerIndex: number) =>
                    this.scoreKeys.map(scoreKey =>
                        this.minifyNumber(replayObj[replayKey][playerIndex][scoreKey])
                    )
                );
            }
            if (replayKey == "civs")
                return replayObj.civs.map(x => this.civs.indexOf(x));
            if (["worldPopulation", "hasAiPlayers", "cheatsEnabled", "revealedMap", "exploredMap", "nomad", "isValid"].includes(replayKey as keyof typeof LocalRatingsReplay))
                return replayObj[replayKey] ? 1 : 0;
            return replayObj[replayKey];
        });
    }

    magnifyReplay(minifiedReplayObj: LocalRatingsMinifiedReplayDatabaseElement) : LocalRatingsReplay {
        return Object.fromEntries(this.minifiedReplayKeys.map((replayKey, replayKeyIndex) => {
            if (replayKey == "scores") {
                return [replayKey, minifiedReplayObj[replayKeyIndex].map((_: any, playerIndex: number) =>
                    Object.fromEntries(this.scoreKeys.map((scoreKey, scoreKeyIndex) =>
                        [scoreKey, minifiedReplayObj[replayKeyIndex][playerIndex][scoreKeyIndex]]
                    ))
                )];
            }
            if (replayKey == "civs")
                return [replayKey, minifiedReplayObj[replayKeyIndex].map((x: any) => this.civs[x])];
            if (["worldPopulation", "hasAiPlayers", "cheatsEnabled", "revealedMap", "exploredMap", "nomad", "isValid"].includes(replayKey as keyof typeof LocalRatingsReplay))
                return [replayKey, minifiedReplayObj[replayKeyIndex] ? true : false];
            return [replayKey, minifiedReplayObj[replayKeyIndex]];
        })) as LocalRatingsReplay;
    }

    minifyReplayDatabase(replayDatabase: LocalRatingsReplayDatabase): LocalRatingsMinifiedReplayDatabase {
        const minifiedReplayDatabase: LocalRatingsMinifiedReplayDatabase = {} as LocalRatingsMinifiedReplayDatabase;
        for (const key in replayDatabase)
            minifiedReplayDatabase[key] = this.minifyReplay(replayDatabase[key]);
        return minifiedReplayDatabase;
    }

    magnifyReplayDatabase(minifiedReplayDatabase: LocalRatingsMinifiedReplayDatabase): LocalRatingsReplayDatabase {
        const replayDatabase: LocalRatingsReplayDatabase = {} as LocalRatingsReplayDatabase;
        for (const key in minifiedReplayDatabase)
            replayDatabase[key] = this.magnifyReplay(minifiedReplayDatabase[key]);
        return replayDatabase;
    }

    minifyRatingsDatabase(ratingsDatabase: LocalRatingsRatingDatabase) {
        const minifiedRatingsDatabase = {} as LocalRatingsMinifiedRatingDatabase;
        for (const player in ratingsDatabase) {
            const playerData = ratingsDatabase[player];
            minifiedRatingsDatabase[player] = [this.minifyNumber(playerData.rating), playerData.matches];
        }
        return minifiedRatingsDatabase;
    }

    magnifyRatingsDatabase(minifiedRatingsDatabase: LocalRatingsMinifiedRatingDatabase) {
        const ratingsDatabase = {} as LocalRatingsRatingDatabase;
        for (const player in minifiedRatingsDatabase) {
            const playerData = minifiedRatingsDatabase[player];
            ratingsDatabase[player] = { "rating": playerData[0], "matches": playerData[1] };
        }
        return ratingsDatabase;
    }

    minifyHistoryDatabase(historyDatabase: LocalRatingsHistoryDatabase) {
        const minifiedHistoryDatabase = {} as LocalRatingsHistoryMinifiedDatabase;
        for (const player in historyDatabase) {
            const playerData = {} as LocalRatingsHistoryMinifiedDirectoryElement;
            for (const replayDir in historyDatabase[player]) {
                const replayData = historyDatabase[player][replayDir];
                playerData[replayDir] = [this.minifyNumber(replayData.rating), this.civs.indexOf(replayData.civ)];
            }
            minifiedHistoryDatabase[player] = playerData;
        }
        return minifiedHistoryDatabase;
    }

    magnifyHistoryDatabase(minifiedHistoryDatabase: LocalRatingsHistoryMinifiedDatabase) {
        const historyDatabase = {} as LocalRatingsHistoryDatabase;
        for (const player in minifiedHistoryDatabase) {
            const playerData = {} as LocalRatingsHistoryDirectoryElement;
            for (const replayDir in minifiedHistoryDatabase[player]) {
                const replayData = minifiedHistoryDatabase[player][replayDir];
                playerData[replayDir] = {
                    "rating": replayData[0],
                    "civ": this.civs[replayData[1]]
                } as LocalRatingsHistoryDatabaseElement;
            }
            historyDatabase[player] = playerData;
        }
        return historyDatabase;
    }

}

export {
    LocalRatingsMinifier
}
