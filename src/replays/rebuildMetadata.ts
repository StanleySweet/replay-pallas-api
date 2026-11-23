/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Database } from "better-sqlite3";
import { ReplayRepository } from "../repositories/ReplayRepository";
import { PlayerRepository } from "../repositories/PlayerRepository";
import { Replays } from "../types/Replay";
import { MetadataSettings } from "../types/MetadataSettings";
import { LobbyRankingHistoryEntry } from "../types/LobbyRankingHistoryEntry";
import { extract_commands_data } from "./commandsParser";
import { gameRelease } from "./gameRelease";
import { getRanks } from "./ranking";
import { isBrotliBlob, packBlob, unpackBlob } from "./blobCodec";
import { logger } from "../logger";

const BATCH_SIZE = 50;

interface RebuildProgress {
    phase: "reading" | "writing";
    done: number;
    total: number;
    skipped: number;
}

interface Computed {
    updates: { matchId: string, metadata: Buffer, release: number }[];
    links: { matchId: string, playerId: number }[];
    ranks: LobbyRankingHistoryEntry[];
    skipped: number;
    done: number;
}

const padNumber = (value: number) => value.toString().padStart(2, "0");

const localTimestamp = (date: Date) =>
    `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}:${padNumber(date.getSeconds())}`;

// Derives the metadata of every replay again from its commands.txt, and the lobby links, ranking
// history and 0 A.D. release that come from it.
//
// Nothing visible changes while it reads: all the work is done first, and the results are applied in one
// short transaction at the end. A reader, such as the site while a worker thread runs this, sees the old
// complete data until that commit and the new complete data after it, never links cleared half way.
// Replays that arrive while it reads are picked up inside that transaction.
function rebuildReplayMetadata(db: Database, onProgress?: (progress: RebuildProgress) => void): RebuildProgress {
    const replays = new ReplayRepository(db);
    const players = new PlayerRepository(db);
    const total = replays.count();
    const seen = new Set<string>();
    const playerIds = new Map<string, number>();

    const computed: Computed = { updates: [], links: [], ranks: [], skipped: 0, done: 0 };

    // Reads a batch of rows and adds what the rebuild would write to `computed`. The rows' own files are
    // only touched to rewrite the ones still stored the old way, which is idempotent.
    const compute = (batch: Replays) => {
        const usable: Replays = [];
        const repackFiledata = new Set<string>();
        for (const replay of batch) {
            seen.add(replay.match_id);

            // One unreadable replay must not stop the rebuild: it is logged and left as it is.
            try {
                if (Buffer.isBuffer(replay.metadata))
                    replay.metadata = JSON.parse(unpackBlob(replay.metadata));
            }
            catch (error) {
                logger.error({ err: error, matchId: replay.match_id }, "Rebuilding replays metadata: skipped a replay whose metadata cannot be read");
                computed.skipped++;
                continue;
            }

            try {
                if (Buffer.isBuffer(replay.filedata)) {
                    if (!isBrotliBlob(replay.filedata))
                        repackFiledata.add(replay.match_id);
                    replay.filedata = unpackBlob(replay.filedata);
                }

                // filedata is the JSON map of the uploaded files, the parser wants the commands.txt text.
                const commands = JSON.parse(replay.filedata)["commands.txt"];
                if (typeof commands === "string")
                    replay.metadata = Object.assign(replay.metadata, extract_commands_data(commands));
            }
            catch (error) {
                logger.error({ err: error, matchId: replay.match_id }, "Rebuilding replays metadata: skipped an unreadable replay");
                computed.skipped++;
                repackFiledata.delete(replay.match_id);
            }
            usable.push(replay);
        }

        // AI players are in PlayerData but not in the lobby tables: upload leaves them out, and so does this.
        const names: { name: string, matchId: string }[] = [];
        for (const replay of usable) {
            if (!replay.metadata.matchID)
                continue;
            for (const player of (replay.metadata.settings?.PlayerData ?? []).filter(a => a && !a.AI))
                if (player.NameWithoutRating)
                    names.push({ name: player.NameWithoutRating, matchId: replay.metadata.matchID });
        }

        for (const { name } of names)
            if (!playerIds.has(name))
                playerIds.set(name, players.findOrCreateId(name));

        for (const replay of usable) {
            const settings = replay.metadata.settings as MetadataSettings;
            if (!settings || !settings.PlayerData)
                continue;

            for (const player of settings.PlayerData) {
                if (!player)
                    continue;

                player.LobbyUserId = playerIds.get(player.NameWithoutRating || "") ?? 0;
                if (replay.metadata.playerStates?.length) {
                    const index = settings.PlayerData.indexOf(player) + 1;
                    if (index > replay.metadata.playerStates.length - 1 || !replay.metadata.playerStates[index])
                        continue;

                    player.State = replay.metadata.playerStates[index].state;
                }
            }
        }

        for (const replay of usable) {
            if (replay.metadata.matchID && replay.metadata.settings?.PlayerData && !replay.metadata.settings?.PlayerData.some(a => !a))
                computed.updates.push({ matchId: replay.metadata.matchID, metadata: packBlob(JSON.stringify(replay.metadata)), release: gameRelease(replay.metadata) ?? 0 });
        }

        for (const replay of usable)
            if (repackFiledata.has(replay.match_id))
                replays.updateFiledata(replay.match_id, packBlob(replay.filedata as string));

        for (const { name, matchId } of names)
            computed.links.push({ matchId, playerId: playerIds.get(name) as number });

        computed.ranks.push(...getRanks(usable));
        computed.done += batch.length;
    };

    for (let offset = 0; ; offset += BATCH_SIZE) {
        const batch = replays.page(BATCH_SIZE, offset);
        if (batch.length === 0)
            break;

        logger.info(`Rebuilding replays metadata. Treating replay ${offset} to ${offset + batch.length} of ${total} replays.`);
        compute(batch);
        onProgress?.({ phase: "reading", done: computed.done, total, skipped: computed.skipped });
    }

    onProgress?.({ phase: "writing", done: computed.done, total, skipped: computed.skipped });

    // immediate(): take the write lock now, so nothing can be added between reading the stragglers and
    // clearing the tables.
    db.transaction(() => {
        const unseen = replays.allMatchIds().filter(id => !seen.has(id));
        if (unseen.length > 0)
            compute(replays.rowsByMatchIds(unseen));

        replays.clearLobbyLinks();
        replays.clearRankingHistory();

        const modified = localTimestamp(new Date());
        for (const update of computed.updates) {
            replays.updateMetadata(update.matchId, update.metadata, modified);
            replays.setGameRelease(update.matchId, update.release);
        }
        for (const link of computed.links)
            replays.linkLobbyPlayer(link.matchId, link.playerId);
        replays.addRankingHistory(computed.ranks);
    }).immediate();

    return { phase: "writing", done: computed.done, total: replays.count(), skipped: computed.skipped };
}

export { rebuildReplayMetadata };
export type { RebuildProgress };
