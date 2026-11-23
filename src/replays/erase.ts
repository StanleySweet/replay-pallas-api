/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2026 Stanislas Daniel Claude Dolcini
 */

import { Database } from "better-sqlite3";
import { Suppression, pseudonymize } from "./pseudonym";
import { packBlob, unpackBlob } from "./blobCodec";

export interface EraseResult { players: number, replays: number, aliasGroups: number }

// Rewrites what is already stored for the players in the suppression list: their lobby player row
// takes the pseudonym (case variants of one nick are merged into it), the stored metadata and files
// of their replays are pseudonymized, and their nicks leave the Local Ratings alias groups. The
// ratings, history and caches derived from the replays must be rebuilt afterwards. Safe to run again.
export function erasePlayers(db: Database, suppression: Suppression, aliasGroups?: Record<string, string[]>): EraseResult {
    const result: EraseResult = { players: 0, replays: 0, aliasGroups: 0 };
    const rows = db.prepare("SELECT id, nick FROM lobby_players ORDER BY id").all() as { id: number, nick: string }[];
    const byPseudonym = new Map<string, number[]>();
    for (const row of rows) {
        const pseudonym = suppression.pseudonymOf(row.nick);
        if (pseudonym)
            byPseudonym.set(pseudonym, [...(byPseudonym.get(pseudonym) ?? []), row.id]);
    }

    const rewrite = db.transaction(() => {
        for (const [pseudonym, ids] of byPseudonym) {
            const target = (db.prepare("SELECT id FROM lobby_players WHERE nick = ?").get(pseudonym) as { id: number } | undefined)?.id ?? ids[0];
            for (const id of ids.filter(i => i !== target)) {
                db.prepare("UPDATE replay_lobby_player_link SET lobby_player_id = ? WHERE lobby_player_id = ?").run(target, id);
                db.prepare("UPDATE lobby_ranking_history SET lobby_player_id = ? WHERE lobby_player_id = ?").run(target, id);
                db.prepare("DELETE FROM glicko2_rankings WHERE lobby_player_id = ?").run(id);
                db.prepare("DELETE FROM user_statistics_cache WHERE lobby_player_id = ?").run(id);
                db.prepare("DELETE FROM lobby_players WHERE id = ?").run(id);
            }
            // A pseudonym can not be taken by a stale row of the same nick: free it, then rename.
            db.prepare("UPDATE lobby_players SET nick = ? WHERE id = ?").run(pseudonym, target);
            db.prepare("DELETE FROM user_statistics_cache WHERE lobby_player_id = ?").run(target);
            db.prepare("DELETE FROM replay_lobby_player_link WHERE id NOT IN (SELECT MIN(id) FROM replay_lobby_player_link GROUP BY lobby_player_id, match_id)").run();
            ++result.players;

            const matchIds = (db.prepare("SELECT match_id FROM replay_lobby_player_link WHERE lobby_player_id = ?").all(target) as { match_id: string }[]).map(r => r.match_id);
            for (const matchId of matchIds) {
                const row = db.prepare("SELECT metadata, filedata FROM replays WHERE match_id = ?").get(matchId) as { metadata: Buffer, filedata: Buffer };
                const metadata = pseudonymize(JSON.parse(unpackBlob(row.metadata)), suppression) as { settings?: { PlayerData?: { NameWithoutRating?: string, LobbyUserId?: number }[] } };
                for (const player of metadata.settings?.PlayerData ?? [])
                    if (player?.NameWithoutRating === pseudonym)
                        player.LobbyUserId = target;
                const filedata = pseudonymize(JSON.parse(unpackBlob(row.filedata)), suppression);
                db.prepare("UPDATE replays SET metadata = ?, filedata = ?, modification_date = ? WHERE match_id = ?")
                    .run(packBlob(JSON.stringify(metadata)), packBlob(JSON.stringify(filedata)), new Date().toISOString(), matchId);
                ++result.replays;
            }
        }
    });
    rewrite();

    // The alias groups hold nicks in clear: drop every nick that is suppressed, and a group left with
    // only one nick has nothing to merge.
    if (aliasGroups) {
        for (const [primary, aliases] of Object.entries(aliasGroups)) {
            const kept = [primary, ...aliases].filter(nick => !suppression.pseudonymOf(nick));
            if (kept.length === aliases.length + 1)
                continue;
            delete aliasGroups[primary];
            if (kept.length > 1)
                aliasGroups[kept[0]] = kept.slice(1);
            ++result.aliasGroups;
        }
    }
    return result;
}
