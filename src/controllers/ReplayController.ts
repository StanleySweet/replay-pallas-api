/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import AdmZip, { IZipEntry } from "adm-zip";
import { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import { UploadReplayZipResponse, UploadReplayZipResponseSchema } from "../types/UploadReplayZipResponse";
import { ReplayFileData } from "../types/ReplayFileData";
import { Replay, ReplayDetailsSchema, Replays, ReplaysSchema, ToDbFormat } from "../types/Replay";
import { UploadReplayCommandsResponseSchema } from "../types/UploadReplayCommandsResponse";
import zodToJsonSchema from "zod-to-json-schema";
import { ReplayMetaData } from "../types/ReplayMetaData";
import { extract_commands_data, extract_commands_stats } from "../replays/commandsParser";
import { update_LocalRatings } from "../local-ratings/utilities/functions_utility";
import { isBrotliBlob, packBlob, unpackBlob } from "../replays/blobCodec";
import { gameRelease } from "../replays/gameRelease";
import { releaseParam } from "../replays/releaseParam";
import EUserRole from "../enumerations/EUserRole";
import { z } from "zod";
import { MetadataSettings } from "../types/MetadataSettings";
import { LobbyRankingHistoryEntries, LobbyRankingHistoryEntriesSchema, LobbyRankingHistoryEntry } from "../types/LobbyRankingHistoryEntry";
import { ReplayListItem, ReplayListItems, ReplayListItemsSchema } from "../types/ReplayListItem";
import { LocalRatingsReplay } from "../local-ratings/Replay";
import { logger } from '../logger';
import { replaysUploadedTotal } from "../prometheus";
import { toReplayListItem } from "./helpers/replayListItem";

function get_list_items_from_local_ratings(matchIds: string[], reply: FastifyReply, fastify: FastifyInstance) {
    const replays: ReplayListItems = matchIds
        .map((matchId) => toReplayListItem(fastify.replayDb.replayDatabase[matchId] as LocalRatingsReplay | undefined))
        .filter((replay): replay is ReplayListItem => replay !== null);

    if (!replays || !replays.length) {
        reply.code(204);
        reply.send();
        return;
    }

    reply.send(replays);
}

// ?release=28 keeps only the replays played on that 0 A.D. release.
function filterByRelease(request: FastifyRequest, fastify: FastifyInstance, matchIds: string[]): string[] {
    const release = releaseParam(request);
    if (release === null)
        return matchIds;

    const wanted = fastify.replays.matchIdsForRelease(release);
    return matchIds.filter(id => wanted.has(id));
}

function get_latest_replays(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    if ((request.claims?.role ?? 0) < EUserRole.READER) {
        reply.code(401);
        reply.send();
        return;
    }

    let matchIds: string[] = Object.keys(fastify.replayDb.replayDatabase) as string[];
    matchIds = matchIds.sort((b, a) => new Date(fastify.replayDb.replayDatabase[a].date as unknown as string).getTime() - new Date(fastify.replayDb.replayDatabase[b].date as unknown as string).getTime());
    get_list_items_from_local_ratings(filterByRelease(request, fastify, matchIds).slice(0, 10), reply, fastify);
}

function get_my_replays_list_items(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    if ((request.claims?.role ?? 0) < EUserRole.READER) {
        reply.code(401);
        reply.send();
        return;
    }

    const replays: Replays = fastify.replays.idsUploadedBy(request.claims?.id);
    const matchIds: string[] = replays.sort((b, a) => new Date(a.creation_date as unknown as string).getTime() - new Date(b.creation_date as unknown as string).getTime()).map(a => a.match_id);
    get_list_items_from_local_ratings(filterByRelease(request, fastify, matchIds), reply, fastify);
}

function get_list_items(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    if ((request.claims?.role ?? 0) < EUserRole.READER) {
        reply.code(401);
        reply.send();
        return;
    }

    let matchIds: string[] = Object.keys(fastify.replayDb.replayDatabase) as string[];
    matchIds = matchIds.sort((b, a) => new Date(fastify.replayDb.replayDatabase[a].date as unknown as string).getTime() - new Date(fastify.replayDb.replayDatabase[b].date as unknown as string).getTime());
    get_list_items_from_local_ratings(filterByRelease(request, fastify, matchIds), reply, fastify);
}

const BATCH_SIZE = 50;

function rebuild_replays_metadata(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance): void {
    if ((request.claims?.role ?? 0) < EUserRole.ADMINISTRATOR) {
        reply.code(401);
        reply.send();
        return;
    }
    let offset = 0;
    let hasMoreData = true;

    const count = fastify.replays.count();

    fastify.replays.clearLobbyLinks();
    fastify.replays.clearRankingHistory();

    while (hasMoreData) {

        const replays: Replays = fastify.replays.page(BATCH_SIZE, offset);

        // Check if there's no more data
        if (replays.length === 0) {
            hasMoreData = false;
            break;
        }

        logger.info(`Rebuilding replays metadata. Treating replay ${offset} to ${offset + replays.length} of ${count} replays.`);

        // Rows whose files are still stored the old way get rewritten as brotli below.
        const repackFiledata = new Set<string>();
        for (const replay of replays) {
            // One unreadable row must not abort the rebuild half way: the link tables were already
            // cleared above, so they would stay incomplete. Log it and keep the row as it is.
            try {
                if (Buffer.isBuffer(replay.metadata))
                    replay.metadata = JSON.parse(unpackBlob(replay.metadata));
                if (Buffer.isBuffer(replay.filedata)) {
                    if (!isBrotliBlob(replay.filedata))
                        repackFiledata.add(replay.match_id);
                    replay.filedata = unpackBlob(replay.filedata);
                }

                // filedata is the JSON map of the uploaded files, the parser wants the commands.txt text.
                const commands = JSON.parse(replay.filedata)["commands.txt"];
                if (typeof commands !== "string")
                    continue;

                const commandsData = extract_commands_data(commands);
                replay.metadata = Object.assign(replay.metadata, commandsData);
            }
            catch (error) {
                logger.error({ err: error, matchId: replay.match_id }, "Rebuilding replays metadata: skipped an unreadable replay");
                repackFiledata.delete(replay.match_id);
            }
        }

        const mpNames = replays.map(replay => {
            const names: string[] = [];
            if (replay.metadata.settings && replay.metadata.settings.PlayerData) {
                // AI players are in PlayerData but not in the lobby tables: upload leaves them out, and so does this.
                for (const nameWithoutRating of replay.metadata.settings.PlayerData.filter(a => a && !a.AI).map(a => a.NameWithoutRating))
                    if (nameWithoutRating)
                        names.push(nameWithoutRating);
            }

            return {
                "match_id": replay.metadata.matchID,
                "player_names": names
            };
        });

        const names = new Set<{ name: string, matchId: string }>();
        for (const nameArray of mpNames) {
            if (!nameArray.player_names || !nameArray.player_names.length || !nameArray.match_id)
                continue;

            for (const name of nameArray.player_names) {
                names.add({
                    "matchId": nameArray.match_id,
                    "name": name
                });
            }
        }

        const userMap = new Map<string, number>();
        for (const name of names) {
            userMap.set(name.name, fastify.players.findOrCreateId(name.name));
        }

        for (const replay of replays) {
            const metadataSettings: MetadataSettings = replay.metadata.settings as MetadataSettings;
            if (!metadataSettings || !metadataSettings.PlayerData)
                continue;

            for (const player of metadataSettings.PlayerData) {
                if (!player)
                    continue;

                player.LobbyUserId = userMap.get(player.NameWithoutRating || "") ?? 0;
                if (replay.metadata.playerStates?.length) {

                    const index = metadataSettings.PlayerData.indexOf(player) + 1;
                    if (index > replay.metadata.playerStates.length - 1 || !replay.metadata.playerStates[index])
                        continue;

                    player.State = replay.metadata.playerStates[index].state;
                }
            }
        }

        for (const replay of replays) {
            if (replay.metadata.matchID && replay.metadata.settings?.PlayerData && !replay.metadata.settings?.PlayerData.some(a => !a)) {
                const currentDate = new Date();
                const formattedDate = `${currentDate.getFullYear()}-${padNumber(currentDate.getMonth() + 1)}-${padNumber(currentDate.getDate())} ${padNumber(currentDate.getHours())}:${padNumber(currentDate.getMinutes())}:${padNumber(currentDate.getSeconds())}`;
                fastify.replays.updateMetadata(replay.metadata.matchID, packBlob(JSON.stringify(replay.metadata)), formattedDate);
                fastify.replays.setGameRelease(replay.metadata.matchID, gameRelease(replay.metadata) ?? 0);
            }
        }

        for (const replay of replays) {
            if (repackFiledata.has(replay.match_id))
                fastify.replays.updateFiledata(replay.match_id, packBlob(replay.filedata as string));
        }

        for (const name of names) {
            const existingUser_id = userMap.get(name.name);
            fastify.replays.linkLobbyPlayer(name.matchId, existingUser_id);
        }

        const ranks = get_ranks(replays);
        fastify.replays.addRankingHistory(ranks);

        // Update offset for the next batch
        offset += BATCH_SIZE;
    }

    fastify.replayDb.rebuild();
    fastify.ratingsDb.rebuild();
    fastify.releases.rebuild();
    fastify.glicko2Manager.rebuild();

    reply.code(200);
    reply.send();
}

const rebuild_glicko_rank_history = (request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance): void => {
    if ((request.claims?.role ?? 0) < EUserRole.ADMINISTRATOR) {
        reply.code(401);
        reply.send();
        return;
    }

    fastify.glicko2Manager.rebuild();
    reply.code(200);
    reply.send();
};

function padNumber(number: number) {
    return number.toString().padStart(2, '0');
}

const get_ranks = (replays: Replays): LobbyRankingHistoryEntries => {
    const ranks: LobbyRankingHistoryEntries = [];
    for (const element of replays) {
        if (Buffer.isBuffer(element.metadata))
            element.metadata = JSON.parse(unpackBlob(element.metadata as Buffer));
        const playerData = element.metadata.settings?.PlayerData;
        if (!playerData)
            continue;

        for (const player of playerData) {
            if (!player || !player.Name)
                continue;

            if (!player.Name.includes('('))
                continue;

            const matches = player.Name.match(/^.*\(([0-9]*)\)$/);
            if (!matches || matches.length !== 2)
                continue;

            const elo: number = +matches[1];
            const currentDate = new Date((element.metadata.timestamp ?? 0) * 1000);
            const formattedDate = `${currentDate.getFullYear()}-${padNumber(currentDate.getMonth() + 1)}-${padNumber(currentDate.getDate())} ${padNumber(currentDate.getHours())}:${padNumber(currentDate.getMinutes())}:${padNumber(currentDate.getSeconds())}`;
            ranks.push({
                match_id: element.metadata.matchID,
                elo: elo,
                lobby_player_id: player.LobbyUserId,
                date: formattedDate
            } as LobbyRankingHistoryEntry);
        }
    }
    return ranks;
};

const rebuild_lobby_rank_history = (request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance): void => {
    if ((request.claims?.role ?? 0) < EUserRole.ADMINISTRATOR) {
        reply.code(401);
        reply.send();
        return;
    }

    const replays: Replays = fastify.replays.metadataWithDates();
    fastify.replays.clearRankingHistory();
    const ranks = get_ranks(replays);
    fastify.replays.addRankingHistory(ranks);

    reply.send(ranks);
};

function UploadReplayToDatabase(replay: Replay, server: FastifyInstance): boolean {
    try {
        server.replays.insert(ToDbFormat(replay) as Parameters<typeof server.replays.insert>[0]);
        return true;
    } catch (ex) {
        server.log.error(ex);
        return false;
    }
}

const ReplayController: FastifyPluginCallback = (server, _, done) => {
    const schemaCommon = {
        tags: ["Replays"],
    };

    function ExtractFileData(fileName: string, text: string): ReplayFileData {
        return {
            "Name": fileName,
            "Data": fileName.includes(".json") ? JSON.parse(text) : extract_commands_data(text),
            "Contents": text
        };
    }

    function ExtractFileNameFromPath(path: string): string {
        const splittedName = path.replace("\\", "/").split("/");
        return splittedName[splittedName.length - 1];
    }

    /**
     *
     * @param files
     * @param zip
     * @returns
     */
    function ExtractFolderData(files: IZipEntry[], zip: AdmZip): Replay {
        const b = files.map(c => ExtractFileData(ExtractFileNameFromPath(c.entryName), zip.readAsText(c)));
        const metadata: ReplayMetaData = b.reduce((metadata, a) => Object.assign(metadata, a.Data), {});
        const result = { metadata: {} as ReplayMetaData, filedata: {} } as Replay;
        result.metadata = Object.assign(result.metadata, metadata);

        b.forEach(element => {
            result.filedata[element.Name] = element.Contents;
        });
        return result;
    }

    server.post('/upload-zip', {
        schema: {
            response: {
                200: zodToJsonSchema(UploadReplayZipResponseSchema),
            },
            ...schemaCommon
        }
    }, async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        const data = await request.file({ "limits": { fileSize: 1024 * 1024 * 5 } });
        const response = { Success: false, AddedReplays: [] } as UploadReplayZipResponse;
        if (!data) {
            reply.send(response);
            return;
        }

        if ((request.claims?.role ?? 0) < EUserRole.CONTRIBUTOR) {
            reply.code(401);
            reply.send();
            return;
        }

        const buf = await data.toBuffer();
        const zip = new AdmZip(buf);
        const zipEntries = zip.getEntries();
        const folderNames = zipEntries.filter(a => a.isDirectory).map(a => a.entryName);
        const files = zipEntries.filter(a => !a.isDirectory);
        let replays: Replays = [];
        if (folderNames.length)
            replays = folderNames.map(folderName => ExtractFolderData(files.filter(b => b.entryName.includes(folderName)), zip));
        else
            replays = [ExtractFolderData(files, zip,)];

        // Ask the database only about the match IDs in this upload. It used to pull every
        // match_id row and then scan that array per uploaded replay, which is O(uploads x
        // number of stored replays) and grows with the database.
        const candidateIds = [...new Set(replays
            .map(b => b.metadata.matchID)
            .filter((id): id is string => typeof id === "string" && id.length > 0))];
        const knownIds = server.replays.existingMatchIds(candidateIds);

        // A replay with no matchID cannot be deduplicated or linked, and the insert loop below
        // skipped it anyway, so filter it out here rather than carrying it further.
        // Dedup is also applied within the upload: replays.match_id is UNIQUE, so the same
        // match twice in one zip used to blow up on the constraint and 500 the request.
        const uploadedIds = new Set<string>();
        const newReplays = replays.filter((b: Replay) => {
            const id = b.metadata.matchID;
            if (!id || knownIds.has(id) || uploadedIds.has(id))
                return false;

            uploadedIds.add(id);
            return true;
        });
        const datas = newReplays.map(a => { return { "matchId": a.metadata.matchID, "playerNames": a.metadata.settings?.PlayerData?.filter(a => a && !a.AI).map(a => a.NameWithoutRating || "") }; });
        const names = new Set<{ name: string, matchId: string }>();
        for (const nameArray of datas) {
            if (!nameArray.playerNames)
                continue;

            if (!nameArray.matchId) {
                continue;
            }

            for (const name of nameArray.playerNames) {
                names.add({
                    "matchId": nameArray.matchId,
                    "name": name
                });
            }
        }

        const userMap = new Map<string, number>();
        for (const name of names) {
            userMap.set(name.name, server.players.findOrCreateId(name.name));
        }

        for (const replay of newReplays) {
            const metadataSettings: MetadataSettings = replay.metadata.settings as MetadataSettings;
            if (!metadataSettings || !metadataSettings.PlayerData)
                continue;

            for (const player of metadataSettings.PlayerData) {
                if (!player)
                    continue;

                player.LobbyUserId = userMap.get(player.NameWithoutRating || "") ?? 0;

                if (replay.metadata.playerStates?.length) {

                    const index = metadataSettings.PlayerData.indexOf(player) + 1;
                    if (index > replay.metadata.playerStates.length - 1 || !replay.metadata.playerStates[index])
                        continue;

                    player.State = replay.metadata.playerStates[index].state;
                }
            }
        }

        for (const replay of newReplays) {
            if (replay.metadata.matchID && replay.metadata.settings?.PlayerData && !replay.metadata.settings?.PlayerData.some(a => !a) && UploadReplayToDatabase(replay, server)) {
                // Add a link so users can delete the replays they uploaded
                server.replays.linkUploader(request.claims?.id, replay.metadata.matchID);
                response.AddedReplays.push(replay.metadata.matchID);
                replaysUploadedTotal.inc();
            }
        }

        for (const name of names) {
            const existingUser_id = userMap.get(name.name);
            server.replays.linkLobbyPlayer(name.matchId, existingUser_id);
        }

        const ranks = get_ranks(newReplays);
        server.replays.addRankingHistory(ranks);

        response.Success = response.AddedReplays.length !== 0;

        if (response.Success) {
            update_LocalRatings({
                "ratingsDb": server.ratingsDb,
                "replayDb": server.replayDb,
                "aliasDb": server.aliasDb,
                "releases": server.releases,
            });
        }

        reply.send(response);
    });

    type GetMatchZipByIdRequest = FastifyRequest<{ Params: { matchId: string } }>;

    server.get('/:matchId/zip', {
        schema: {
            response: {
                200: zodToJsonSchema(UploadReplayCommandsResponseSchema),
                "403": {
                    type: 'null',
                    description: 'Unauthorized'
                }
            },
            ...schemaCommon
        }
    }, async (request: GetMatchZipByIdRequest, reply: FastifyReply): Promise<void> => {
        if ((request.claims?.role ?? 0) < EUserRole.READER) {
            reply.code(403);
            reply.send();
            return;
        }

        const matchId = request.params.matchId;
        if (!matchId) {
            reply.send(null);
            return;
        }

        const file = server.replays.getFiles(matchId);
        if (!file) {
            reply.send(null);
            return;
        }

        const fileJson = JSON.parse(unpackBlob(file.filedata));

        const zip = new AdmZip();
        for (const file of Object.keys(fileJson))
            zip.addFile(file, Buffer.from(typeof (fileJson[file]) === "string" ? fileJson[file] : JSON.stringify(fileJson[file]), 'utf8'), '', 0o644);
        reply.header(
            'Content-Disposition',
            `attachment; filename=${file.match_id}.zip`);
        reply.type('application/zip').send(zip.toBuffer());
    });

    type GetMatchByIdRequest = FastifyRequest<{ Params: { matchId: string } }>;

    server.get('/:matchId', {
        schema: {
            response: {
                200: zodToJsonSchema(ReplayDetailsSchema),
                "403": {
                    type: 'null',
                    description: 'Unauthorized'
                }
            },
            ...schemaCommon
        }
    }, async (request: GetMatchByIdRequest, reply: FastifyReply): Promise<void> => {
        if ((request.claims?.role ?? 0) < EUserRole.READER) {
            reply.code(403);
            reply.send();
            return;
        }

        const { matchId } = request.params;
        if (!matchId) {
            reply.send(null);
            return;
        }

        const replay = server.replays.getDetails(matchId);
        if(replay?.metadata)
            replay.metadata = JSON.parse(unpackBlob(replay.metadata as string));

        if(replay?.filedata)
        {
            const data = unpackBlob(replay.filedata as string);

            // Compute the commands data per player to give a graph for chart.js
            const result = extract_commands_stats(data);
            if(result)
                replay.command_statistics = result;

            replay.filedata = null;
        }

        reply.send(replay ? replay : null);
    });


    server.get('/my-list-items', {
        schema: {
            response: {
                "200": zodToJsonSchema(ReplayListItemsSchema),
                "204": { type: 'null', description: 'No Content' },
                "401": { type: 'null', description: 'Unauthorized' },
                "403": { type: 'null', description: 'Unauthorized' }
            },
            ...schemaCommon
        }
    }, (request: FastifyRequest, reply: FastifyReply) => get_my_replays_list_items(request, reply, server));

    server.get('/all-list-items', {
        schema: {
            response: {
                "200": zodToJsonSchema(ReplayListItemsSchema),
                "204": { type: 'null', description: 'No Content' },
                "401": { type: 'null', description: 'Unauthorized' },
                "403": { type: 'null', description: 'Unauthorized' }
            },
            ...schemaCommon
        }
    }, (request: FastifyRequest, reply: FastifyReply) => get_list_items(request, reply, server));

    server.get('/latest-list-items', {
        schema: {
            response: {
                "200": zodToJsonSchema(ReplayListItemsSchema),
                "204": { type: 'null', description: 'No Content' },
                "401": { type: 'null', description: 'Unauthorized' },
                "403": { type: 'null', description: 'Unauthorized' }
            },
            ...schemaCommon
        }
    }, (request: FastifyRequest, reply: FastifyReply) => get_latest_replays(request, reply, server));


    server.get('/latest', {
        schema: {
            response: {
                200: zodToJsonSchema(ReplaysSchema),
                "403": {
                    type: 'null',
                    description: 'Unauthorized'
                }
            },
            ...schemaCommon
        }
    }, async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        if ((request.claims?.role ?? 0) < EUserRole.READER) {
            reply.code(403);
            reply.send();
            return;
        }
        const replays: Replays = server.replays.latestMetadata();
        for (const element of replays)
            element.metadata = JSON.parse(unpackBlob(element.metadata as string));
        reply.send(replays);
    });

    server.get('/rebuild-lobby-rank-history', {
        schema: {
            response: {
                200: zodToJsonSchema(LobbyRankingHistoryEntriesSchema),
                "403": {
                    type: 'null',
                    description: 'Unauthorized'
                }
            },
            ...schemaCommon
        }
    }, (reply, request) => rebuild_lobby_rank_history(reply, request, server));

    server.get('/rebuild-glicko-rank-history', {
        schema: {
            response: {
                200: zodToJsonSchema(LobbyRankingHistoryEntriesSchema),
                "403": {
                    type: 'null',
                    description: 'Unauthorized'
                }
            },
            ...schemaCommon
        }
    }, (reply, request) => rebuild_glicko_rank_history(reply, request, server));

    server.get('/all', {
        schema: {
            response: {
                200: zodToJsonSchema(ReplaysSchema),
                "403": {
                    type: 'null',
                    description: 'Unauthorized'
                }
            },
            ...schemaCommon
        }
    }, async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        if ((request.claims?.role ?? 0) < EUserRole.READER) {
            reply.code(403);
            reply.send();
            return;
        }

        const replays: Replays = server.replays.allMetadataNewestFirst();
        for (const element of replays)
            element.metadata = JSON.parse(unpackBlob(element.metadata as string));
        reply.send(replays);
    });

    type DeleteMyReplayRequest = FastifyRequest<{ Params: { match_id: string } }>;

    server.delete('/:match_id', {
        "schema": {
            "params": zodToJsonSchema(z.object({ "match_id": z.string() })),
            "response": {
                "200": {
                    type: 'null',
                    description: 'Nothing'
                },
                "403": {
                    type: 'null',
                    description: 'Unauthorized'
                },
            },
            ...schemaCommon
        }

    }, async (request: DeleteMyReplayRequest, reply: FastifyReply): Promise<void> => {
        if ((request.claims?.role ?? 0) < EUserRole.CONTRIBUTOR) {
            reply.code(403);
            reply.send();
            return;
        }

        // Only the uploader of a replay (or an administrator) may delete it.
        // Without this check any contributor could delete any replay by its match ID.
        const isAdministrator = request.claims?.role === EUserRole.ADMINISTRATOR;
        const ownsReplay = server.replays.isUploadedBy(request.params.match_id, request.claims?.id);

        if (!ownsReplay && !isAdministrator) {
            reply.code(403);
            reply.send();
            return;
        }

        // The uploader links, player links, ranking history and local-ratings cache row all
        // cascade from the replay (migrations/012 and 013).
        server.replays.delete(request.params.match_id);

        // Drop it from memory and recompute the ratings, so a deleted replay stops counting at once.
        server.replayDb.delete(request.params.match_id);
        server.ratingsDb.rebuild();
        server.releases.rebuild();
        update_LocalRatings({
            "ratingsDb": server.ratingsDb,
            "replayDb": server.replayDb,
            "aliasDb": server.aliasDb,
            "releases": server.releases,
        });

        reply.code(200);
        reply.send();
    });

    server.get('/rebuild-replay-metadata', {
        "schema": {
            "response": {
                "200": zodToJsonSchema(ReplaysSchema),
                "204": {
                    type: 'null',
                    description: 'No Content'
                },
                "403": {
                    type: 'null',
                    description: 'Unauthorized'
                },
            },
            ...schemaCommon
        }
    }, (request: FastifyRequest, reply: FastifyReply) => rebuild_replays_metadata(request, reply, server));

    server.get('/my-replays', {
        "schema": {
            "response": {
                "200": zodToJsonSchema(ReplaysSchema),
                "204": {
                    type: 'null',
                    description: 'No Content'
                },
                "403": {
                    type: 'null',
                    description: 'Unauthorized'
                },
            },
            ...schemaCommon
        }
    }, async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        if ((request.claims?.role ?? 0) < EUserRole.READER) {
            reply.code(403);
            reply.send();
            return;
        }

        const replays: Replays = server.replays.metadataUploadedBy(request.claims?.id);
        if (!replays || !replays.length) {
            reply.code(204);
            reply.send();
            return;
        }

        for (const element of replays)
            element.metadata = JSON.parse(unpackBlob(element.metadata as string));

        reply.send(replays);
    });
    done();
};

export {
    ReplayController
};
