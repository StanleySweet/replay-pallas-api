/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import AdmZip, { IZipEntry } from "adm-zip";
import { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import { UploadReplayZipResponse, UploadReplayZipResponseSchema } from "../types/UploadReplayZipResponse";
import { ReplayFileData } from "../types/ReplayFileData";
import { Replay, ReplaySchema, Replays, ReplaysSchema, ToDbFormat } from "../types/Replay";
import { UploadReplayCommandsResponseSchema } from "../types/UploadReplayCommandsResponse";
import zodToJsonSchema from "zod-to-json-schema";
import { ReplayMetaData } from "../types/ReplayMetaData";
import { mode } from "../Utils";
import { update_LocalRatings } from "../local-ratings/utilities/functions_utility";
import snappy from 'snappy';
import EUserRole from "../enumerations/EUserRole";
import { z } from "zod";
import { MetadataSettings } from "../types/MetadataSettings";
import { LobbyRankingHistoryEntries, LobbyRankingHistoryEntriesSchema, LobbyRankingHistoryEntry } from "../types/LobbyRankingHistoryEntry";
import { ReplayListItem, ReplayListItems, ReplayListItemsSchema } from "../types/ReplayListItem";
import { LocalRatingsReplay } from "../local-ratings/Replay";

function get_list_items_from_local_ratings(matchIds : string[], reply: FastifyReply, fastify: FastifyInstance) {
    const replays: ReplayListItems = matchIds.map(matchId => fastify.replayDb.replayDatabase[matchId]).map((replay: LocalRatingsReplay) => ({
        "mapName": replay.mapName,
        "playerNames": replay.players,
        "machId": replay.directory,
        "date": replay.date,
        "civs": replay.civs
    } as ReplayListItem));

    if (!replays || !replays.length) {
        reply.code(204);
        return;
    }

    reply.send(replays);
}

function get_latest_replays(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    if ((request.claims?.role ?? 0) < EUserRole.READER) {
        reply.code(401);
        return;
    }
    
    const replays: Replays = fastify.database.prepare('SELECT r.match_id, r.creation_date FROM replays r').all() as Replays;
    const matchIds : string[] = replays.sort((a,b) => new Date(a.creation_date as unknown as string).getTime() - new Date(b.creation_date as unknown as string).getTime()).map(a => a.match_id);
    get_list_items_from_local_ratings(matchIds.slice(0, 10), reply, fastify);
}

function get_my_replays_list_items(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    if ((request.claims?.role ?? 0) < EUserRole.READER) {
        reply.code(401);
        return;
    }

    const replays: Replays = fastify.database.prepare('SELECT r.match_id FROM replays r Inner Join replay_user_link rul On r.match_id = rul.match_id And rul.user_id = @userId ORDER BY rul.creation_date desc').all({ "userId": request.claims?.id }) as Replays;
    const matchIds : string[] = replays.map(a => a.match_id);
    get_list_items_from_local_ratings(matchIds, reply, fastify);
}

function get_list_items(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    if ((request.claims?.role ?? 0) < EUserRole.READER) {
        reply.code(401);
        return;
    }

    const matchIds: string[] = Object.keys(fastify.replayDb.replayDatabase) as string[];
    get_list_items_from_local_ratings(matchIds, reply, fastify);
}


function rebuild_replays_metadata(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance): void {
    if ((request.claims?.role ?? 0) < EUserRole.ADMINISTRATOR) {
        reply.code(401);
        return;
    }

    const replays: Replays = fastify.database.prepare("Select * From replays r;").all() as Replays;
    for (const replay of replays) {
        if (Buffer.isBuffer(replay.metadata))
            replay.metadata = JSON.parse(snappy.uncompressSync(replay.metadata, { asBuffer: false }) as string);
        if (Buffer.isBuffer(replay.filedata))
            replay.filedata = snappy.uncompressSync(replay.filedata, { asBuffer: false }) as string;

        const commandsData = extract_commands_data(replay.filedata);
        replay.metadata = Object.assign(replay.metadata, commandsData);
    }

    const mpNames = replays.map(replay => {
        const names: string[] = [];
        if (replay.metadata.settings && replay.metadata.settings.PlayerData) {
            for (const nameWithoutRating of replay.metadata.settings.PlayerData.map(a => a.NameWithoutRating))
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
        let existingUser: { id: number } = fastify.database.prepare("Select id From lobby_players where nick = @nick  LIMIT 1;").get({ "nick": name.name }) as { id: number };
        if (!existingUser) {
            fastify.database.prepare("Insert Into lobby_players (nick) Values (@nick)").run({ "nick": name.name });
            existingUser = fastify.database.prepare("Select id From lobby_players where nick = @nick LIMIT 1;").get({ "nick": name.name }) as { id: number };
        }

        userMap.set(name.name, existingUser.id);
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

    const updateStatement = fastify.database.prepare(`
    Update replays 
    Set 
    modification_date = @modification_date, 
    metadata = @metadata 
    Where match_id = @match_id;`);
    for (const replay of replays) {
        if (replay.metadata.matchID && replay.metadata.settings?.PlayerData && !replay.metadata.settings?.PlayerData.some(a => !a)) {
            const currentDate = new Date();
            const formattedDate = `${currentDate.getFullYear()}-${padNumber(currentDate.getMonth() + 1)}-${padNumber(currentDate.getDate())} ${padNumber(currentDate.getHours())}:${padNumber(currentDate.getMinutes())}:${padNumber(currentDate.getSeconds())}`;
            updateStatement.run({
                match_id: replay.metadata.matchID,
                metadata: snappy.compressSync(JSON.stringify(replay.metadata)),
                modification_date: formattedDate
            });
        }
    }

    fastify.database.prepare('Delete From replay_lobby_player_link;').run();
    for (const name of names) {
        const existingUser_id = userMap.get(name.name);
        const existingLink = fastify.database.prepare("Select 1 From replay_lobby_player_link where match_id = @matchId and lobby_player_id = @lobby_player_id;").get({ "matchId": name.matchId, "lobby_player_id": existingUser_id });
        if (!existingLink) {
            fastify.database.prepare("Insert Into replay_lobby_player_link (lobby_player_id, match_id) Values (@lobby_player_id, @matchId);").run({ "lobby_player_id": existingUser_id, "matchId": name.matchId });
        }
    }

    fastify.database.prepare("Delete From lobby_ranking_history;").run();
    const ranks = get_ranks(replays);
    const insertStatement = fastify.database.prepare('Insert Into lobby_ranking_history (match_id, lobby_player_id, elo, date) Values (@match_id, @lobby_player_id, @elo, @date)');
    for (const rank of ranks) {
        insertStatement.run({
            "match_id": rank.match_id,
            "elo": rank.elo,
            "lobby_player_id": rank.lobby_player_id,
            "date": rank.date
        });
    }

    fastify.replayDb.rebuild();
    fastify.ratingsDb.rebuild();
    fastify.glicko2Manager.rebuild();

    reply.code(200);
}

function extract_commands_data(text: string): ReplayMetaData | null | undefined {
    try {
        const lines = text.replaceAll("\r\n", "\n").split("\n");
        if (!lines || !lines.length || !lines[0])
            return null;
        const data: ReplayMetaData = JSON.parse(lines[0].replace("start ", ""));

        data.previewImage = data.mapPreview?.split(":")[2];
        if (!data.previewImage)
            data.previewImage = "session/icons/mappreview/unknown.png";

        if (!data.settings)
            return null;

        let currentTurn = 0;
        if (!data.settings.PlayerData)
            data.settings.PlayerData = [];

        for (const line of lines) {
            if (line.startsWith("turn")) {
                currentTurn = +line.split(" ")[1];
            }
            else if (line.startsWith("cmd")) {
                const player = +line.substring(4, 5) - 1;
                if (!data.settings.PlayerData[player])
                    data.settings.PlayerData[player] = {};
                if (!data.settings.PlayerData[player].Commands)
                    data.settings.PlayerData[player].Commands = [];
                const cmdData = JSON.parse(line.substring(6));
                cmdData.turn = currentTurn;
                data.settings.PlayerData[player].Commands?.push(cmdData);
            }
        }

        data.settings.NbTurns = currentTurn;
        data.settings.MatchDuration = currentTurn * 200.0 / 1000.0;
        const playerData = data.settings.PlayerData;
        for (const player of playerData) {
            if (!player)
                continue;

            player.NameWithoutRating = player.Name?.split("(")[0].trimEnd();
            if (!player.Commands)
                continue;

            player.MostUsedCmd = mode(player.Commands.map(a => a.type));
            player.SecondMostUsedCmd = mode(
                player.Commands.filter((a) => a.type !== player.MostUsedCmd).map(
                    (a) => a.type
                )
            );

            player.AverageCPM = (player.Commands.length / (data.settings.MatchDuration / 60.0));
        }

        return data;

    } catch (error) {
        console.error(error);
    }
}

const rebuild_glicko_rank_history = (request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance): void => {
    if ((request.claims?.role ?? 0) < EUserRole.ADMINISTRATOR) {
        reply.code(401);
        return;
    }

    fastify.glicko2Manager.rebuild();
    reply.code(200);
};

function padNumber(number: number) {
    return number.toString().padStart(2, '0');
}

const get_ranks = (replays: Replays): LobbyRankingHistoryEntries => {
    const ranks: LobbyRankingHistoryEntries = [];
    for (const element of replays) {
        if (Buffer.isBuffer(element.metadata))
            element.metadata = JSON.parse(snappy.uncompressSync(element.metadata as Buffer, { asBuffer: false }) as string);
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
        return;
    }

    const replays: Replays = fastify.database.prepare('Select metadata, creation_date, match_id From replays;').all() as Replays;
    fastify.database.prepare('Delete From lobby_ranking_history;').run();
    const ranks = get_ranks(replays);
    for (const rank of ranks) {
        fastify.database.prepare('Insert Into lobby_ranking_history (match_id, lobby_player_id, elo, date) Values (@match_id, @lobby_player_id, @elo, @date)').run({
            "match_id": rank.match_id,
            "elo": rank.elo,
            "lobby_player_id": rank.lobby_player_id,
            "date": rank.date
        });
    }

    reply.send(ranks);
};

function UploadReplayToDatabase(replay: Replay, server: FastifyInstance): boolean {
    try {
        server.database.prepare(`INSERT INTO replays (match_id, metadata, filedata, creation_date) VALUES($matchId, $metadata, $filedata, $creationDate)`).run(ToDbFormat(replay));
        return true;
    } catch (ex) {
        console.error(ex);
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

        const matchIds: Replays = server.database.prepare('SELECT match_id FROM replays;').all() as Replays;
        const newReplays = replays.filter((b: Replay) => !matchIds.some((a: Replay) => a.match_id === b.metadata.matchID));
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
            let existingUser: { id: number } = server.database.prepare("Select id From lobby_players where nick = @nick LIMIT 1;").get({ "nick": name.name }) as { id: number };
            if (!existingUser) {
                server.database.prepare("Insert Into lobby_players (nick) Values (@nick)").run({ "nick": name.name });
                existingUser = server.database.prepare("Select id From lobby_players where nick = @nick LIMIT 1;").get({ "nick": name.name }) as { id: number };
            }

            userMap.set(name.name, existingUser.id);
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
                server.database.prepare("Insert Into replay_user_link (user_id, match_id) Values (@user_id, @matchId);").run({ "user_id": request.claims?.id, "matchId": replay.metadata.matchID });
                response.AddedReplays.push(replay.metadata.matchID);
            }
        }

        for (const name of names) {
            const existingUser_id = userMap.get(name.name);
            const existingLink = server.database.prepare("Select 1 From replay_lobby_player_link where match_id = @matchId and lobby_player_id = @lobby_player_id;").get({ "matchId": name.matchId, "lobby_player_id": existingUser_id });
            if (!existingLink) {
                server.database.prepare("Insert Into replay_lobby_player_link (lobby_player_id, match_id) Values (@lobby_player_id, @matchId);").run({ "lobby_player_id": existingUser_id, "matchId": name.matchId });
            }
        }

        const ranks = get_ranks(newReplays);
        for (const rank of ranks) {
            server.database.prepare('Insert Into lobby_ranking_history (match_id, lobby_player_id, elo, date) Values (@match_id, @lobby_player_id, @elo, @date)').run({
                "match_id": rank.match_id,
                "elo": rank.elo,
                "lobby_player_id": rank.lobby_player_id,
                "date": rank.date
            });
        }

        response.Success = response.AddedReplays.length !== 0;

        if (response.Success) {
            update_LocalRatings({
                "ratingsDb": server.ratingsDb,
                "replayDb": server.replayDb,
                "aliasDb": server.aliasDb,
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
            return;
        }

        const matchId = request.params.matchId;
        if (!matchId) {
            reply.send(null);
            return;
        }

        const files: Replays = server.database.prepare('SELECT match_id, filedata FROM replays WHERE match_id = @matchId LIMIT 1').all({ "matchId": matchId }) as Replays;
        if (!files.length) {
            reply.send(null);
            return;
        }

        const fileJson = JSON.parse(await snappy.uncompress(files[0].filedata, { asBuffer: false }) as string);

        const zip = new AdmZip();
        for (const file of Object.keys(fileJson))
            zip.addFile(file, Buffer.from(typeof (fileJson[file]) === "string" ? fileJson[file] : JSON.stringify(fileJson[file]), 'utf8'), '', 0o644);
        reply.header(
            'Content-Disposition',
            `attachment; filename=${files[0].match_id}.zip`);
        reply.type('application/zip').send(zip.toBuffer());
    });

    type GetMatchByIdRequest = FastifyRequest<{ Params: { matchId: string } }>;

    server.get('/:matchId', {
        schema: {
            response: {
                200: zodToJsonSchema(ReplaySchema),
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
            return;
        }

        const { matchId } = request.params;
        if (!matchId) {
            reply.send(null);
            return;
        }

        const replays: Replays = server.database.prepare('SELECT match_id, metadata FROM replays WHERE match_id = @matchId LIMIT 1').all({ "matchId": matchId }) as Replays;
        for (const element of replays)
            element.metadata = JSON.parse(await snappy.uncompress(element.metadata as string, { asBuffer: false }) as string);

        reply.send(replays.length ? replays[0] : null);
    });


    server.get('/my-list-items', {
        schema: {
            response: {
                "200": zodToJsonSchema(ReplayListItemsSchema),
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
            return;
        }
        const replays: Replays = server.database.prepare('SELECT match_id, metadata FROM replays ORDER BY creation_date desc LIMIT 10;').all() as Replays;
        for (const element of replays)
            element.metadata = JSON.parse(await snappy.uncompress(element.metadata as string, { asBuffer: false }) as string);
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
            return;
        }

        const replays: Replays = server.database.prepare('SELECT match_id, metadata FROM replays ORDER BY creation_date desc').all() as Replays;
        for (const element of replays)
            element.metadata = JSON.parse(await snappy.uncompress(element.metadata as string, { asBuffer: false }) as string);
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
            return;
        }

        server.database.prepare("Delete From replay_user_link Where match_id = @match_id and user_id = @user_id;").run({
            "match_id": request.params.match_id,
            "user_id": request.claims?.id
        });

        server.database.prepare("Delete From lobby_ranking_history Where match_id = @match_id;").run({
            "match_id": request.params.match_id,
        });

        server.database.prepare("Delete From replay_lobby_player_link Where match_id = @match_id;").run({
            "match_id": request.params.match_id,
        });

        server.database.prepare("Delete From replays Where match_id = @match_id;").run({
            "match_id": request.params.match_id
        });

        reply.code(200);
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
            return;
        }

        const replays: Replays = server.database.prepare('SELECT r.match_id, metadata FROM replays r Inner Join replay_user_link rul On r.match_id = rul.match_id And rul.user_id = @userId ORDER BY rul.creation_date desc').all({ "userId": request.claims?.id }) as Replays;
        if (!replays || !replays.length) {
            reply.code(204);
            return;
        }

        for (const element of replays)
            element.metadata = JSON.parse(await snappy.uncompress(element.metadata as string, { asBuffer: false }) as string);

        reply.send(replays);
    });
    done();
};

export {
    ReplayController
};
