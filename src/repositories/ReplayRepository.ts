/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Database } from "better-sqlite3";
import { Replay, ReplayDetails, Replays } from "../types/Replay";
import { LobbyRankingHistoryEntry } from "../types/LobbyRankingHistoryEntry";

// SQLite caps the number of host parameters (999 before 3.32, 32766 after).
const IN_CHUNK = 500;

// Everything that touches the replays table and the tables that cascade from it. Rows come back
// with their blobs still packed: unpacking them is src/replays/blobCodec.ts's job, so a query that
// does not need a blob never pays for it.
class ReplayRepository {
    constructor(private readonly db: Database) { }

    count(): number {
        return (this.db.prepare('Select Count(*) as count From replays;').get() as { count: number }).count;
    }

    page(batchSize: number, offset: number): Replays {
        return this.db.prepare(`
        SELECT * FROM replays r
        LIMIT @batchSize OFFSET @offset;`
        ).all({ "batchSize": batchSize, "offset": offset }) as Replays;
    }

    metadataWithDates(): Replays {
        return this.db.prepare('Select metadata, creation_date, match_id From replays;').all() as Replays;
    }

    latestMetadata(): Replays {
        return this.db.prepare(`SELECT match_id, metadata FROM replays ORDER BY creation_date desc LIMIT 10;`).all() as Replays;
    }

    allMetadataNewestFirst(): Replays {
        return this.db.prepare('SELECT match_id, metadata FROM replays ORDER BY creation_date desc').all() as Replays;
    }

    // The replays a user uploaded, newest link first.
    idsUploadedBy(userId: number | undefined): Replays {
        return this.db.prepare('SELECT r.match_id, r.creation_date FROM replays r Inner Join replay_user_link rul On r.match_id = rul.match_id And rul.user_id = @userId ORDER BY rul.creation_date desc').all({ "userId": userId }) as Replays;
    }

    metadataUploadedBy(userId: number | undefined): Replays {
        return this.db.prepare('SELECT r.match_id, metadata FROM replays r Inner Join replay_user_link rul On r.match_id = rul.match_id And rul.user_id = @userId ORDER BY rul.creation_date desc').all({ "userId": userId }) as Replays;
    }

    getFiles(matchId: string): Replay | undefined {
        return this.db.prepare('SELECT match_id, filedata FROM replays WHERE match_id = @matchId LIMIT 1').get({ "matchId": matchId }) as Replay | undefined;
    }

    getDetails(matchId: string): ReplayDetails | undefined {
        return this.db.prepare('SELECT match_id, metadata, filedata FROM replays WHERE match_id = @matchId LIMIT 1').get({ "matchId": matchId }) as ReplayDetails | undefined;
    }

    existingMatchIds(ids: string[]): Set<string> {
        const known = new Set<string>();
        for (let i = 0; i < ids.length; i += IN_CHUNK) {
            const chunk = ids.slice(i, i + IN_CHUNK);
            const rows = this.db
                .prepare(`SELECT match_id FROM replays WHERE match_id IN (${chunk.map(() => "?").join(', ')});`)
                .all(...chunk) as { match_id: string }[];
            for (const row of rows)
                known.add(row.match_id);
        }
        return known;
    }

    insert(row: { matchId: string, metadata: Buffer, filedata: Buffer, creationDate: string, gameRelease: number }): void {
        this.db.prepare(`INSERT INTO replays (match_id, metadata, filedata, creation_date, game_release) VALUES($matchId, $metadata, $filedata, $creationDate, $gameRelease)`).run(row);
    }

    // The replays of one 0 A.D. release.
    matchIdsForRelease(release: number): Set<string> {
        const rows = this.db.prepare('SELECT match_id FROM replays WHERE game_release = @release').all({ release }) as { match_id: string }[];
        return new Set(rows.map(row => row.match_id));
    }

    withoutRelease(): { match_id: string, metadata: Buffer }[] {
        return this.db.prepare('SELECT match_id, metadata FROM replays WHERE game_release IS NULL').all() as { match_id: string, metadata: Buffer }[];
    }

    setGameRelease(matchId: string, release: number): void {
        this.db.prepare('Update replays Set game_release = @release Where match_id = @match_id;').run({ match_id: matchId, release });
    }

    updateMetadata(matchId: string, metadata: Buffer, modificationDate: string): void {
        this.db.prepare(`
    Update replays
    Set
    modification_date = @modification_date,
    metadata = @metadata
    Where match_id = @match_id;`).run({ match_id: matchId, metadata: metadata, modification_date: modificationDate });
    }

    updateFiledata(matchId: string, filedata: Buffer): void {
        this.db.prepare('Update replays Set filedata = @filedata Where match_id = @match_id;').run({ match_id: matchId, filedata: filedata });
    }

    // The uploader links, player links, ranking history and local-ratings cache row all cascade
    // from the replay (migrations/012 and 013).
    delete(matchId: string): void {
        this.db.prepare("Delete From replays Where match_id = @match_id;").run({ "match_id": matchId });
    }

    // Whether the user uploaded the replay: only the uploader or an administrator may delete it.
    isUploadedBy(matchId: string, userId: number | undefined): boolean {
        return !!this.db.prepare("Select 1 From replay_user_link Where match_id = @match_id and user_id = @user_id LIMIT 1;").get({
            "match_id": matchId,
            "user_id": userId
        });
    }

    linkUploader(userId: number | undefined, matchId: string): void {
        this.db.prepare("Insert Or Ignore Into replay_user_link (user_id, match_id) Values (@user_id, @matchId);").run({ "user_id": userId, "matchId": matchId });
    }

    clearLobbyLinks(): void {
        this.db.prepare('Delete From replay_lobby_player_link;').run();
    }

    clearRankingHistory(): void {
        this.db.prepare("Delete From lobby_ranking_history;").run();
    }

    linkLobbyPlayer(matchId: string, lobbyPlayerId: number | undefined): void {
        const existingLink = this.db.prepare("Select 1 From replay_lobby_player_link where match_id = @matchId and lobby_player_id = @lobby_player_id LIMIT 1;").get({ "matchId": matchId, "lobby_player_id": lobbyPlayerId });
        if (!existingLink)
            this.db.prepare("Insert Into replay_lobby_player_link (lobby_player_id, match_id) Values (@lobby_player_id, @matchId);").run({ "lobby_player_id": lobbyPlayerId, "matchId": matchId });
    }

    addRankingHistory(ranks: LobbyRankingHistoryEntry[]): void {
        const insert = this.db.prepare('Insert Into lobby_ranking_history (match_id, lobby_player_id, elo, date) Values (@match_id, @lobby_player_id, @elo, @date)');
        for (const rank of ranks) {
            insert.run({
                "match_id": rank.match_id,
                "elo": rank.elo,
                "lobby_player_id": rank.lobby_player_id,
                "date": rank.date
            });
        }
    }
}

export { ReplayRepository };
