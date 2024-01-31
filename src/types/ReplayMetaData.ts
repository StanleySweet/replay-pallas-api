/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { z } from "zod";
import { MetadataSettingsSchema } from "./MetadataSettings";

const ReplayMetaDataSchema = z.object({
    matchID: z.string(),
    timestamp: z.number(),
    mapPreview: z.nullable(z.string()),
    playerStates : z.array(z.any()),
    previewImage : z.string(),
    mods: z.any(),
    settings: MetadataSettingsSchema,
    engine_version: z.string()
}).partial();

type ReplayMetaData = z.infer<typeof ReplayMetaDataSchema>;

export type {
    ReplayMetaData
};

export {
    ReplayMetaDataSchema
};
