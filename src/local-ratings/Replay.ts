import { getPlayerName_LocalRatings } from "./utilities/functions_utility";
import { LocalRatingsMetadataContainer } from "./types/MetadataContainer";
import { LocalRatingsSequences } from "./Sequences";
import pino from 'pino';

/**
 * This class represents a replay object.
 * It stores replay data taken from replayCache.json and sequences, taken from the metadata.json in the replay folder.
 */
class LocalRatingsReplay {

    [key: string]: unknown;
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
    mapName : string;
    startingResources : number;
    teamsSize : { [team: string]: number };
    worldPopulation: boolean;
    players: string[];
    hasAiPlayers: boolean;
    scores: LocalRatingsSequences[];
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
        this.mapName = metadata.getMapName();
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
            pino().info("Replay " + this.directory + " was skipped");
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
            pino().info("Replay " + this.directory + " was skipped because the following values are undefined", invalidValues);
        }

        return invalidValues.length === 0;
    }
}

export {
    LocalRatingsReplay
};

