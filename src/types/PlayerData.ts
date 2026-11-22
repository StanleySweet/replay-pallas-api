import { z } from "zod";

const PlayerDataSchema = z.object({
    AI: z.any(),
    Name: z.string(),
    NameWithoutRating: z.string(),
    Color: z.any(),
    Team: z.number(),
    Civ: z.string(),
    AverageCPM: z.number(),
    State: z.string(),
    LobbyUserId : z.number(),
    NumberOfCommands: z.number(),
    // Rows that were not rebuilt yet still hold the commands. The response schema strips unknown keys,
    // so the field stays declared until every replay is rebuilt, or their order count would show blank.
    Commands: z.array(z.any()),
    SecondMostUsedCmd: z.string(),
    MostUsedCmd: z.string()
}).partial();

type PlayerData = z.infer<typeof PlayerDataSchema>;

export type {
    PlayerData
};

export {
    PlayerDataSchema
};
