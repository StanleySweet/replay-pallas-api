import { z } from "zod";
import { CommandSchema } from "./Command";

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
    Commands: z.array(CommandSchema),
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
