/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { z } from "zod"
import { PlayerDataSchema } from "./PlayerData";

const MetadataSettingsSchema = z.object({
    MatchDuration: z.number(),
    NbTurns: z.number(),
    Biome: z.string(),
    RatingEnabled: z.boolean(),
    LockTeams: z.boolean(),
    Seed: z.string(),
    StartingResources: z.any(),
    PopulationCap: z.number(),
    WorldPopulation: z.optional(z.number()),
    WorldPopulationCap: z.number(),
    RevealMap: z.boolean(),
    ExploreMap: z.boolean(),
    Size: z.number(),
    Name: z.string(),
    CheatsEnabled: z.boolean(),
    Nomad: z.optional(z.boolean()),
    mapName: z.string(),
    PlayerData: z.array(PlayerDataSchema)
}).partial();

type MetadataSettings = z.infer<typeof MetadataSettingsSchema>;

export type {
    MetadataSettings
};

export {
    MetadataSettingsSchema
}
