/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Database, Statement } from "better-sqlite3";
import { Replay, ReplayDetails, Replays } from "../types/Replay";
import { LobbyRankingHistoryEntry } from "../types/LobbyRankingHistoryEntry";

// SQLite caps the number of host parameters (999 before 3.32, 32766 after).
const IN_CHUNK = 500;

// Everything that touches the replays table and the tables that cascade from it. Rows come back
// with their blobs still packed: unpacking them is src/replays/blobCodec.ts's job, so a query that
// does not need a blob never pays for it.
type RawMetadataRow = { attribs: Buffer | string, directory: string };

class ReplayRepository {
    // The releases that have replays, for the selector, newest first. 0 is the replays whose version is
    // unknown, so it comes last. Kept in memory and dropped whenever a replay
    // is added or removed or gets its release set, so it is never stale and costs one query otherwise.
    private releasesCache: { release: number, replays: number }[] | null = null;

    constructor(private readonly db: Database) { }

    // The raw metadata of every replay, one page at a time, for the local ratings replay cache.
    metadataPage(limit: number, offset: number): RawMetadataRow[] {
        return this.db.prepare("SELECT metadata as attribs, match_id as directory FROM replays LIMIT @limit OFFSET @offset;").all({ limit, offset }) as RawMetadataRow[];
    }

    // The raw metadata of one replay.
    metadataOf(matchId: string): Buffer | string | undefined {
        return (this.db.prepare("Select metadata as attribs From replays where match_id = @match_id LIMIT 1;").get({ "match_id": matchId }) as { attribs: Buffer | string } | undefined)?.attribs;
    }

    // Lazily built by newMetadataPage. Bound to this connection's temp schema.
    private staging: { clear: Statement, insert: Statement, select: Statement } | null = null;

    // One page of the replays whose id is not in knownIds.
    newMetadataPage(knownIds: string[], limit: number, offset: number): RawMetadataRow[] {
        // The known ids used to be glued into the SQL as a literal NOT IN list. match_id comes
        // from uploaded replay metadata, so one upload whose matchID contains a quote produced
        // invalid SQL here and threw. Because update() runs on the boot path, that single upload
        // broke every subsequent start. A temp table avoids both the injection and the SQLite
        // host-parameter ceiling.
        //
        // better-sqlite3 prepares eagerly and rejects a statement against a table that does not
        // exist yet, so the staging table has to be created before the statements touching it
        // are prepared. They are then cached: update() calls this once per batch, and
        // re-preparing all four on every call is pure overhead.
        if (!this.staging) {
            this.db.exec("CREATE TEMP TABLE IF NOT EXISTS known_match_ids (match_id TEXT PRIMARY KEY);");
            this.staging = {
                clear: this.db.prepare("DELETE FROM known_match_ids;"),
                insert: this.db.prepare("INSERT OR IGNORE INTO known_match_ids (match_id) VALUES (?);"),
                select: this.db.prepare(`
                    SELECT metadata as attribs, match_id as directory
                    FROM replays
                    WHERE match_id NOT IN (SELECT match_id FROM known_match_ids)
                    LIMIT @limit
                    OFFSET @offset;
                `)
            };
        }

        const { clear, insert, select } = this.staging;
        this.db.transaction((ids: string[]) => {
            clear.run();
            for (const id of ids)
                insert.run(id);
        })(knownIds);

        const rows = select.all({ limit, offset }) as RawMetadataRow[];

        // Left empty on purpose: the table is scratch space, and anything left behind would
        // silently hide replays from the next call.
        clear.run();
        return rows;
    }

    // Changes whenever a replay is added or removed (an upload changes max rowid, a delete the count): what
    // the derived data was last computed from, so an hour without either costs nothing.
    dataSignature(): string {
        const { count, last } = this.db.prepare('SELECT COUNT(*) AS count, COALESCE(MAX(rowid), 0) AS last FROM replays').get() as { count: number, last: number };
        return `${count}:${last}`;
    }

    releases(): { release: number, replays: number }[] {
        this.releasesCache ??= this.db.prepare('SELECT game_release AS release, COUNT(*) AS replays FROM replays WHERE game_release IS NOT NULL GROUP BY game_release ORDER BY game_release DESC').all() as { release: number, replays: number }[];
        return this.releasesCache;
    }

    count(): number {
        return (this.db.prepare('Select Count(*) as count From replays;').get() as { count: number }).count;
    }

    allMatchIds(): string[] {
        return (this.db.prepare('SELECT match_id FROM replays').all() as { match_id: string }[]).map(row => row.match_id);
    }

    // Whole rows for the given replays.
    rowsByMatchIds(matchIds: string[]): Replays {
        const rows: Replays = [];
        for (let i = 0; i < matchIds.length; i += IN_CHUNK) {
            const chunk = matchIds.slice(i, i + IN_CHUNK);
            rows.push(...this.db.prepare(`SELECT * FROM replays WHERE match_id IN (${chunk.map(() => "?").join(', ')});`).all(...chunk) as Replays);
        }
        return rows;
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

    // The three below take an optional 0 A.D. release; null keeps every replay.
    latestMetadata(release: number | null = null): Replays {
        return this.db.prepare(`SELECT match_id, metadata FROM replays WHERE (@release IS NULL OR game_release = @release) ORDER BY creation_date desc LIMIT 10;`).all({ release }) as Replays;
    }

    allMetadataNewestFirst(release: number | null = null): Replays {
        return this.db.prepare('SELECT match_id, metadata FROM replays WHERE (@release IS NULL OR game_release = @release) ORDER BY creation_date desc').all({ release }) as Replays;
    }

    // The replays a user uploaded, newest link first.
    idsUploadedBy(userId: number | undefined): Replays {
        return this.db.prepare('SELECT r.match_id, r.creation_date FROM replays r Inner Join replay_user_link rul On r.match_id = rul.match_id And rul.user_id = @userId ORDER BY rul.creation_date desc').all({ "userId": userId }) as Replays;
    }

    metadataUploadedBy(userId: number | undefined, release: number | null = null): Replays {
        return this.db.prepare('SELECT r.match_id, metadata FROM replays r Inner Join replay_user_link rul On r.match_id = rul.match_id And rul.user_id = @userId Where (@release IS NULL OR r.game_release = @release) ORDER BY rul.creation_date desc').all({ "userId": userId, release }) as Replays;
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
        this.releasesCache = null;
    }

    // The replays of one 0 A.D. release.
    matchIdsForRelease(release: number): Set<string> {
        const rows = this.db.prepare('SELECT match_id FROM replays WHERE game_release = @release').all({ release }) as { match_id: string }[];
        return new Set(rows.map(row => row.match_id));
    }

    // The release of every replay, for splitting work per release without a query per replay.
    releaseByMatchId(): Map<string, number> {
        const rows = this.db.prepare('SELECT match_id, game_release FROM replays').all() as { match_id: string, game_release: number | null }[];
        return new Map(rows.map(row => [row.match_id, row.game_release ?? 0]));
    }

    withoutRelease(): { match_id: string, metadata: Buffer }[] {
        return this.db.prepare('SELECT match_id, metadata FROM replays WHERE game_release IS NULL').all() as { match_id: string, metadata: Buffer }[];
    }

    setGameRelease(matchId: string, release: number): void {
        this.db.prepare('Update replays Set game_release = @release Where match_id = @match_id;').run({ match_id: matchId, release });
        this.releasesCache = null;
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
        this.releasesCache = null;
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
export type { RawMetadataRow };
