/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import AdmZip, { IZipEntry } from "adm-zip";
import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
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

const ReplayController: FastifyPluginCallback = (server, _, done) => {
    const schemaCommon = {
        tags: ["Replays"],
    };

    async function UploadReplayToDatabase(replay: Replay): Promise<boolean> {
        try {
            if (!replay.metadata.matchID)
                return false;
            await server.database.run(`INSERT INTO replays (match_id, metadata, filedata, creation_date) VALUES($matchId, $metadata, $filedata, $creationDate)`, await ToDbFormat(replay));
            return true;
        } catch (ex) {
            console.error(ex)
            return false;
        }
    }



    function ExtractCommandsData(text: string): any {
        try {
            const lines = text.replaceAll("\r\n", "\n").split("\n")
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
                    data.settings.PlayerData[player].Commands?.push(cmdData)
                }
            }

            data.settings.NbTurns = currentTurn;
            data.settings.MatchDuration = currentTurn * 200.0 / 1000.0;
            const playerData = data.settings.PlayerData;
            for (const player of playerData) {
                if(!player)
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

    function ExtractFileData(fileName: string, text: string): ReplayFileData {
        return {
            "Name": fileName,
            "Data": fileName.includes(".json") ? JSON.parse(text) : ExtractCommandsData(text),
            "Contents": text
        }
    }

    function ExtractFileNameFromPath(path: string): string {
        const splittedName = path.replace("\\", "/").split("/");
        return splittedName[splittedName.length - 1]
    }

    /**
     *
     * @param files
     * @param zip
     * @returns
     */
    function ExtractFolderData(files: IZipEntry[], zip: AdmZip): Replay {
        const b = files.map(c => ExtractFileData(ExtractFileNameFromPath(c.entryName), zip.readAsText(c)))
        const metadata: ReplayMetaData = b.reduce((metadata, a) => Object.assign(metadata, a.Data), {});
        const result = { metadata: {} as ReplayMetaData, filedata: {} } as Replay;
        result.metadata = Object.assign(result.metadata, metadata);


        if (metadata.settings && metadata.settings.PlayerData) {
            for (const player of metadata.settings.PlayerData) {
                if (metadata.playerStates?.length) {

                    const index = metadata.settings.PlayerData.indexOf(player) + 1;
                    if(index > metadata.playerStates.length - 1 || metadata.playerStates[index])
                        continue;

                    player.State = metadata.playerStates[index].state;
                }
            }
        }





        b.forEach(element => {
            result.filedata[element.Name] = element.Contents
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
        const data = await request.file({ "limits": { fileSize: 1024 * 1024 * 5 } })
        const response = { Success: false, AddedReplays: [] } as UploadReplayZipResponse
        if (!data) {
            reply.send(response)
            return;
        }

        if (request.claims.role < EUserRole.CONTRIBUTOR) {
            reply.code(401);
            return;
        }


        const buf = await data.toBuffer();
        const zip = new AdmZip(buf);
        const zipEntries = zip.getEntries();
        const folderNames = zipEntries.filter(a => a.isDirectory).map(a => a.entryName);
        const files = zipEntries.filter(a => !a.isDirectory);
        let replays : Replays = [];
        if (folderNames.length)
            replays = folderNames.map(folderName => ExtractFolderData(files.filter(b => b.entryName.includes(folderName)), zip))
        else
            replays = [ExtractFolderData(files, zip,)]

        const matchIds: Replays = await server.database.all('SELECT match_id FROM replays;');
        const newReplays = replays.filter((b : Replay) => !matchIds.some((a : Replay) => a.match_id === b.metadata.matchID));
        const datas = newReplays.map(a => { return { "matchId": a.metadata.matchID, "playerNames": a.metadata.settings?.PlayerData?.filter(a => a && !a.AI).map(a => a.NameWithoutRating || "") } })
        const names = new Set<{ name: string, matchId: string }>();
        for (const nameArray of datas) {
            if (!nameArray.playerNames)
                continue;

            if (!nameArray.matchId) {
                console.log(nameArray);
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
            let existingUser = await server.database.get("Select id From lobby_players where nick = $nick  LIMIT 1;", { "$nick": name.name });
            if (!existingUser) {
                server.database.run("Insert Into lobby_players (nick) Values ($nick)", { "$nick": name.name });
                existingUser = await server.database.get("Select id From lobby_players where nick = $nick LIMIT 1;", { "$nick": name.name });
            }

            userMap.set(name.name, existingUser.id)

            const existingLink = await server.database.get("Select 1 From replay_lobby_player_link where match_id = $matchId and lobby_player_id = $lobby_player_id;", { "$matchId": name.matchId, "$lobby_player_id": existingUser.id });
            if (!existingLink) {
                server.database.run("Insert Into replay_lobby_player_link (lobby_player_id, match_id) Values ($lobby_player_id, $matchId);", { "$lobby_player_id": existingUser.id, "$matchId": name.matchId });
            }
        }

        for (const replay of newReplays) {
            if (!replay.metadata.settings || !replay.metadata.settings.PlayerData)
                continue;

            for (const player of replay.metadata.settings.PlayerData) {
                if(!player)
                    continue;
                player.LobbyUserId = userMap.get(player.NameWithoutRating || "") ?? 0;
            }
        }

        const addedReplays: string[] = [];
        for (const replay of newReplays)
            if (replay.metadata.settings?.PlayerData && !replay.metadata.settings?.PlayerData.some(a => !a) && await UploadReplayToDatabase(replay))
                if (replay.metadata.matchID)
                {
                    // Add a link so users can delete the replays they uploaded
                    await server.database.run("Insert Into replay_user_link (user_id, match_id) Values ($user_id, $matchId);", { "$user_id": request.claims.id, "$matchId": replay.metadata.matchID })
                    addedReplays.push(replay.metadata.matchID);
                }
        response.AddedReplays = addedReplays;
        response.Success = addedReplays.length !== 0;

        if (response.Success) {
            update_LocalRatings({
                "ratingsDb": server.ratingsDb,
                "replayDb": server.replayDb,
                "aliasDb": server.aliasDb,
            });
        }

        reply.send(response)
    });

    server.get('/:matchId/zip', {
        schema: {
            response: {
                200: zodToJsonSchema(UploadReplayCommandsResponseSchema),
            },
            ...schemaCommon
        }
    }, async (request: FastifyRequest, reply: FastifyReply): Promise<any> => {
        const matchId = (<any>request.params)["matchId"];
        if (!matchId)
            return null;

        const files: Replay[] = await server.database.all('SELECT match_id, filedata FROM replays WHERE match_id = $matchId LIMIT 1', { "$matchId": matchId });
        if (!files.length)
            return null;

        const fileJson = JSON.parse(await snappy.uncompress(files[0].filedata, { asBuffer: false }) as string);

        const zip = new AdmZip();
        for (const file of Object.keys(fileJson))
            zip.addFile(file, Buffer.from(typeof (fileJson[file]) === "string" ? fileJson[file] : JSON.stringify(fileJson[file]), 'utf8'), '', 0o644)
        reply.header(
            'Content-Disposition',
            `attachment; filename=${files[0].match_id}.zip`);
        return reply.type('application/zip').send(zip.toBuffer());
    });

    server.get('/:matchId', {
        schema: {
            response: {
                200: zodToJsonSchema(ReplaySchema),
            },
            ...schemaCommon
        }
    }, async (request: FastifyRequest, reply: FastifyReply): Promise<any> => {
        const { matchId } = (<any>request.params);
        if (!matchId)
            return null;

        const replays: Replays = await server.database.all('SELECT match_id, metadata FROM replays WHERE match_id = $matchId LIMIT 1', { "$matchId": matchId });
        for (const element of replays)
            element.metadata = JSON.parse(await snappy.uncompress(element.metadata as string, { asBuffer: false }) as string)
        return replays.length ? replays[0] : null;
    });

    server.get('/latest', {
        schema: {
            response: {
                200: zodToJsonSchema(ReplaysSchema),
            },
            ...schemaCommon
        }
    }, async (request: FastifyRequest, reply: FastifyReply): Promise<any> => {
        const replays: Replays = await server.database.all('SELECT match_id, metadata FROM replays ORDER BY creation_date desc LIMIT 10');
        for (const element of replays)
            element.metadata = JSON.parse(await snappy.uncompress(element.metadata as string, { asBuffer: false }) as string)
        return replays;
    });

    server.get('/all', {
        schema: {
            response: {
                200: zodToJsonSchema(ReplaysSchema),
            },
            ...schemaCommon
        }
    }, async (_request: FastifyRequest, _reply: FastifyReply): Promise<any> => {
        const replays: Replays = await server.database.all('SELECT match_id, metadata FROM replays ORDER BY creation_date desc');
        for (const element of replays)
            element.metadata = JSON.parse(await snappy.uncompress(element.metadata as string, { asBuffer: false }) as string)
        return replays;
    });

    done();
};

export {
    ReplayController
}
