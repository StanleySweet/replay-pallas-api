/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { fastify, FastifyRequest, FastifyReply } from "fastify";
import { open } from 'sqlite'
import { Replay } from './Replay'
import { ReplayFileData } from './ReplayFileData'
import { UploadReplayCommandsResponse } from './UploadReplayCommandsResponse'
import { UploadReplayZipResponse } from './UploadReplayZipResponse'
import AdmZip from 'adm-zip';
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import sqlite3, { Database } from 'sqlite3'
const server = fastify({ logger: true });
server.register(cors, {
    // put your options here
})
server.register(multipart);
server.decorate('sqlite', {})
var snappy = require('snappy')


/**
 *
 * @param files
 * @param zip
 * @returns
 */
function ExtractFolderData(files: any[], zip: AdmZip): Replay {
    const b = files.map(c => ExtractFileData(ExtractFileNameFromPath(c.entryName), zip.readAsText(c)))
    const metadata = b.reduce((metadata, a) => Object.assign(metadata, a.Data), {});
    var result = new Replay();
    result.MetaData = Object.assign(result.MetaData, metadata);
    b.forEach(element => {
        result.FileData[element.Name] = element.Contents
    });
    return result;
}

function ExtractCommandsData(text: string): any {
    try {
        const lines = text.replaceAll("\r\n", "\n").split("\n")
        if (!lines || !lines.length || !lines[0])
            return null;
        let data = JSON.parse(lines[0].replace("start ", ""));
        let currentTurn = 0;
        if(!data.settings.PlayerData)
            data.settings.PlayerData = [];
        for (const line of lines) {
            if (line.startsWith("turn")) {
                currentTurn = +line.split(" ")[1];
            }
            else if (line.startsWith("cmd")) {
                const player = +line.substring(4, 5) - 1;
                if(!data.settings.PlayerData[player])
                    data.settings.PlayerData[player] = {}
                if(!data.settings.PlayerData[player].Commands)
                    data.settings.PlayerData[player].Commands = [];
                const cmdData = JSON.parse(line.substring(6));
                cmdData.turn = currentTurn;
                data.settings.PlayerData[player].Commands.push(cmdData)
            }
        }
        data.settings.NbTurns = currentTurn;
        data.settings.MatchDuration = currentTurn * 200.0 / 1000.0;
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


server.get('/replays/:matchId/zip', async (request: FastifyRequest, reply: FastifyReply): Promise<any> => {
    const matchId = (<any>request.params)["matchId"];
    if (!matchId)
        return null;

    const files: any[] = await (<any>server).sqlite.db.all('SELECT matchId, filedata FROM Replays WHERE matchId=\'' + matchId + '\' LIMIT 1');
    if (!files.length)
        return null;

    const fileJson = JSON.parse(await snappy.uncompress(files[0].filedata, { asBuffer: false }));

    const zip = new AdmZip();
    for (const file of Object.keys(fileJson))
        zip.addFile(file, Buffer.from(typeof (fileJson[file]) === "string" ? fileJson[file] : JSON.stringify(fileJson[file]), 'utf8'), '', 0o644)
    reply.header(
        'Content-Disposition',
        `attachment; filename=${files[0].matchId}.zip`);
    return reply.type('application/zip').send(zip.toBuffer());
});



server.get('/replays/:matchId/metadata', async (request: FastifyRequest, reply: FastifyReply): Promise<any> => {
    const matchId = (<any>request.params)["matchId"];
    if (!matchId)
        return null;

    const files: any[] = await (<any>server).sqlite.db.all('SELECT filedata FROM Replays WHERE matchId=\'' + matchId + '\' LIMIT 1');
    if (!files.length)
        return null;

    const fileJson = JSON.parse(await snappy.uncompress(files[0].filedata, { asBuffer: false }));
    return fileJson["metadata.json"] ? fileJson["metadata.json"] : null;
});


server.get('/replays/:matchId/commands', async (request: FastifyRequest, reply: FastifyReply): Promise<any> => {
    const matchId = (<any>request.params)["matchId"];
    if (!matchId)
        return null;

    const files: any[] = await (<any>server).sqlite.db.all('SELECT filedata FROM Replays WHERE matchId=\'' + matchId + '\' LIMIT 1');
    if (!files.length)
        return null;

    const fileJson = JSON.parse(await snappy.uncompress(files[0].filedata, { asBuffer: false }));
    return fileJson["commands.txt"] ? fileJson["commands.txt"] : null;
});

server.get('/replays/:matchId', async (request: FastifyRequest, reply: FastifyReply): Promise<any> => {


    const { matchId } = (<any>request.params);
    if (!matchId)
        return null;

    const replays: any[] = await (<any>server).sqlite.db.all('SELECT matchId, metadata FROM Replays WHERE matchId=\'' + matchId + '\' LIMIT 1');
    for(let element of replays)
        element.metadata = JSON.parse(await snappy.uncompress(element.metadata, { asBuffer: false }))
    return replays.length ? replays[0] : null;
});



server.get('/replays', async (request: FastifyRequest, reply: FastifyReply): Promise<any> => {
    const replays: any[] = await (<any>server).sqlite.db.all('SELECT matchId, metadata FROM Replays');
    for(let element of replays)
        element.metadata = JSON.parse(await snappy.uncompress(element.metadata, { asBuffer: false }))
    return replays;
});

server.post('/replays/upload-commands', async (request: FastifyRequest, reply: any): Promise<UploadReplayCommandsResponse> => {
    const data = await request.file()
    const response = new UploadReplayCommandsResponse();
    if (!data)
        return response;

    const buf = await data.toBuffer();
    const b = ExtractFileData("commands.txt", buf.toString());
    const metadata = b.Data
    const replay = new Replay();
    replay.MetaData = metadata;
    replay.FileData["commands.txt"] = metadata.Contents
    const matchIds: any[] = await (<any>(<Database>(<any>server).sqlite.db).all('SELECT matchId FROM Replays;'));
    if (!matchIds.some(a => a.matchId === replay.MetaData.matchID) && await UploadReplayToDatabase(replay))
        response.AddedReplay = replay.MetaData.matchID
    response.Success = !!response.AddedReplay;
    return response;
});

server.get('/vacuum', async (request: FastifyRequest, reply: any): Promise<any> => {
    await (<Database>(<any>server).sqlite.db).run('VACUUM;');
});

server.post('/replays/upload-zip', async (request: FastifyRequest, reply: any): Promise<UploadReplayZipResponse> => {
    const data = await request.file({ "limits": { fileSize: 1024 * 1024 * 5 } })
    const response = new UploadReplayZipResponse();
    if (!data)
        return response;

    const buf = await data.toBuffer();
    let zip = new AdmZip(buf);
    let zipEntries = zip.getEntries();
    const folderNames = zipEntries.filter(a => a.isDirectory).map(a => a.entryName);
    const files = zipEntries.filter(a => !a.isDirectory);
    let replays = [];
    if (folderNames.length)
        replays = folderNames.map(folderName => ExtractFolderData(files.filter(b => b.entryName.includes(folderName)), zip))
    else
        replays = [ExtractFolderData(files, zip)]

    const addedReplays: string[] = [];
    const matchIds: any[] = await (<any>(<Database>(<any>server).sqlite.db).all('SELECT matchId FROM Replays;'));
    for (const replay of replays.filter(b => !matchIds.some(a => a.matchId === b.MetaData.matchID)))
        if (await UploadReplayToDatabase(replay))
            addedReplays.push(replay.MetaData.matchID);
    response.AddedReplays = addedReplays;
    response.Success = addedReplays.length !== 0;
    return response;
});

async function UploadReplayToDatabase(replay: Replay): Promise<boolean> {
    try {
        if (!replay.MetaData.matchID)
            return false;
        await (<Database>(<any>server).sqlite.db).run(`INSERT INTO Replays (matchId, metadata, filedata) VALUES($matchId, $metadata, $filedata)`, await replay.ToDbFormat());
        return true;
    } catch (ex) {
        console.error(ex)
        return false;
    }
}



server.listen({ port: 8080 }, async (err, address) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    sqlite3.verbose();
    const db = await open({ filename: "replays.db", mode: (sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE), driver: sqlite3.Database })
    await db.migrate({
        migrationsPath: 'src/migrations'
    });
    (<any>server).sqlite["db"] = db
});
