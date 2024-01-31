import { z } from 'zod';

const LobbyRankingHistoryEntrySchema = z.object({
    id: z.number().optional(),
    match_id: z.string(),
    lobby_player_id: z.number(),
    elo: z.number(),
    date: z.string()
});
const LobbyRankingHistoryEntriesSchema = z.array(LobbyRankingHistoryEntrySchema);

type LobbyRankingHistoryEntry = z.infer<typeof LobbyRankingHistoryEntrySchema>;
type LobbyRankingHistoryEntries = z.infer<typeof LobbyRankingHistoryEntriesSchema>;

export {
    LobbyRankingHistoryEntrySchema,
    LobbyRankingHistoryEntriesSchema
};
export type {
    LobbyRankingHistoryEntry,
    LobbyRankingHistoryEntries
};