/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { ReplayMetaData, ReplayMetaDataSchema } from "./ReplayMetaData";
import { z } from "zod"
const snappy = require('snappy')

const ReplaySchema = z.object({
    metadata: ReplayMetaDataSchema,
    filedata: z.any(),
    match_id: z.string()
});

type Replay = z.infer<typeof ReplaySchema>;
const ReplaysSchema = z.array(ReplaySchema);
type Replays = z.infer<typeof ReplaysSchema>;

function padNumber(number : number) {
    return number.toString().padStart(2, '0');
}

const ToDbFormat = async (replay: Replay) => {
    const currentDate = new Date((replay.metadata.timestamp ?? 0) * 1000);
    const formattedDate = `${currentDate.getFullYear()}-${padNumber(currentDate.getMonth() + 1)}-${padNumber(currentDate.getDate())} ${padNumber(currentDate.getHours())}:${padNumber(currentDate.getMinutes())}:${padNumber(currentDate.getSeconds())}`;

    return {
        "$matchId": replay.metadata.matchID,
        "$metadata": await snappy.compress(JSON.stringify(replay.metadata)),
        "$filedata": await snappy.compress(JSON.stringify(replay.filedata)),
        "$creationDate": formattedDate
    }
}

export type {
    Replay, Replays
};

export {
    ReplaySchema, ReplaysSchema, ToDbFormat
}



