/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { ReplayMetaDataSchema } from "./ReplayMetaData";
import { z } from "zod";
import snappy from 'snappy';

const ReplaySchema = z.object({
    metadata: ReplayMetaDataSchema,
    filedata: z.any(),
    match_id: z.string(),
    creation_date: z.date().optional()
});

const PlayerCommandDataSchema = z.object({
    playerCommands : z.array(z.number()),
    playerName : z.string(),
});

const CommandStatisticsSchema = z.object({
    turns: z.array(z.number()),
    playerCommandDatas: z.array(PlayerCommandDataSchema)
});

const ReplayDetailsSchema = z.object({
    metadata: ReplayMetaDataSchema,
    filedata: z.any(),
    match_id: z.string(),
    creation_date: z.date().optional(),
    command_statistics : CommandStatisticsSchema
});

type Replay = z.infer<typeof ReplaySchema>;
type CommandStatistics = z.infer<typeof CommandStatisticsSchema>;
type PlayerCommandData = z.infer<typeof PlayerCommandDataSchema>;
type ReplayDetails = z.infer<typeof ReplayDetailsSchema>;
const ReplaysSchema = z.array(ReplaySchema);
type Replays = z.infer<typeof ReplaysSchema>;

function padNumber(number : number) {
    return number.toString().padStart(2, '0');
}

const ToDbFormat = (replay: Replay) => {
    const currentDate = new Date((replay.metadata.timestamp ?? 0) * 1000);
    // UTC, not local. metadata.timestamp is an absolute instant, but the local time
    // getters rendered it in the server's timezone, so the same replay was stored at a
    // different instant depending on where the API ran - and a match played late in the
    // UTC day landed on the next calendar date, which is what date filters key on.
    const formattedDate = `${currentDate.getUTCFullYear()}-${padNumber(currentDate.getUTCMonth() + 1)}-${padNumber(currentDate.getUTCDate())} ${padNumber(currentDate.getUTCHours())}:${padNumber(currentDate.getUTCMinutes())}:${padNumber(currentDate.getUTCSeconds())}`;

    return {
        "matchId": replay.metadata.matchID,
        "metadata": snappy.compressSync(JSON.stringify(replay.metadata)),
        "filedata": snappy.compressSync(JSON.stringify(replay.filedata)),
        "creationDate": formattedDate
    };
};

export type {
    Replay, Replays, ReplayDetails, CommandStatistics, PlayerCommandData
};

export {
    ReplaySchema, ReplaysSchema, ReplayDetailsSchema, ToDbFormat
};



