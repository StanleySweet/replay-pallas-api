import { getPlayerName_LocalRatings } from "./utilities/functions_utility";
import { LocalRatingsMetadataContainer } from "./types/MetadataContainer";
import { LocalRatingsSequences } from "./Sequences";

/**
 * This class represents a replay object.
 * It stores replay data taken from replayCache.json and sequences, taken from the metadata.json in the replay folder.
 */
class LocalRatingsReplay {

    [key: string]: any;
    cheatsEnabled: boolean;
    civs: string[];
    date: string;
    directory : string;
    duration: number;
    exploredMap: boolean;
    mods: string[];
    nomad : boolean;
    populationCap: number | undefined;
    revealedMap  : boolean;
    startingResources : any;
    teamsSize : { [team: string]: number };
    worldPopulation: boolean;
    players: string[]
    hasAiPlayers: boolean;
    scores: LocalRatingsSequences[]
    isValid: boolean;


    constructor(metadata: LocalRatingsMetadataContainer) {

        this.cheatsEnabled = metadata.getCheatsEnabled();
        this.civs = metadata.getCivs();
        this.date = metadata.getDate();
        this.directory = metadata.directory;
        this.duration = metadata.getDuration();
        this.exploredMap = metadata.getExploredMap();
        this.mods = metadata.getMods();
        this.nomad = metadata.getNomad();
        this.populationCap = metadata.getPopulationCap();
        this.revealedMap = metadata.getRevealedMap();
        this.startingResources = metadata.getStartingResources();
        this.teamsSize = metadata.getTeamsSize();
        this.worldPopulation = metadata.getWorldPopulation();
        const playerNames = metadata.getPlayerNames();
        this.players = playerNames.map((x) => getPlayerName_LocalRatings(x));
        this.hasAiPlayers = playerNames.some((x) => metadata.isPlayerAI(x));
        this.isValid = false;

        try {
            this.scores = playerNames.map((x) => metadata.getScores(x));
            this.isValid = this.validate();
        }
        catch (error) {
            this.scores = [];
            console.log("Replay " + this.directory + " was skipped");
            console.log("=======================================================");
            this.isValid = false;
        }
    }

    validate() {
        const invalidValues = [];
        for (const value of Object.keys(this)) {
            if (typeof this[value] === 'undefined')
                invalidValues.push(value);
        }

        if (invalidValues.length) {
            console.log("Replay " + this.directory + " was skipped because the following values are undefined", invalidValues);
            console.log("=======================================================")
        }

        return invalidValues.length === 0;
    }
}

export {
    LocalRatingsReplay
}

