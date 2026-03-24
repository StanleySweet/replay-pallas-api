import { logger } from "../../logger";
import { LocalRatingsReplay } from "../../local-ratings/Replay";
import { ReplayListItem } from "../../types/ReplayListItem";

function sanitizeStringArray(value: unknown, fieldName: string, invalidFields: string[]): string[] {
    if (!Array.isArray(value)) {
        invalidFields.push(fieldName);
        return [];
    }

    return value.map((item, index) => {
        if (typeof item === "string")
            return item;

        invalidFields.push(`${fieldName}[${index}]`);
        return "";
    });
}

function toReplayListItem(replay: LocalRatingsReplay | undefined): ReplayListItem | null {
    if (!replay) {
        logger.warn("Skipping replay list item: replay not found in local ratings database");
        return null;
    }

    const invalidFields: string[] = [];
    const mapName = typeof replay.mapName === "string" ? replay.mapName : (invalidFields.push("mapName"), "");
    const matchId = typeof replay.directory === "string" ? replay.directory : (invalidFields.push("directory"), "");
    const date = typeof replay.date === "string" ? replay.date : (invalidFields.push("date"), "");
    const playerNames = sanitizeStringArray(replay.players, "players", invalidFields);
    const civs = sanitizeStringArray(replay.civs, "civs", invalidFields);

    if (invalidFields.length) {
        logger.warn(
            { replay: replay.directory, isValid: replay.isValid, invalidFields },
            "Repairing replay list item: replay has invalid fields for API serialization"
        );
    }

    return {
        mapName,
        playerNames,
        matchId,
        date,
        civs
    };
}

export {
    toReplayListItem
};
