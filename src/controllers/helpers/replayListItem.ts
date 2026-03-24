import { logger } from "../../logger";
import { LocalRatingsReplay } from "../../local-ratings/Replay";
import { ReplayListItem } from "../../types/ReplayListItem";

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function toReplayListItem(replay: LocalRatingsReplay | undefined): ReplayListItem | null {
    if (!replay) {
        logger.warn("Skipping replay list item: replay not found in local ratings database");
        return null;
    }

    if (
        typeof replay.mapName !== "string" ||
        typeof replay.directory !== "string" ||
        typeof replay.date !== "string" ||
        !isStringArray(replay.players) ||
        !isStringArray(replay.civs)
    ) {
        logger.warn(
            { replay: replay.directory, isValid: replay.isValid },
            "Skipping replay list item: replay has invalid fields for API serialization"
        );
        return null;
    }

    return {
        mapName: replay.mapName,
        playerNames: replay.players,
        matchId: replay.directory,
        date: replay.date,
        civs: replay.civs
    };
}

export {
    toReplayListItem
};
