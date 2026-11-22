/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { CommandStatistics, PlayerCommandData } from "../types/Replay";
import { ReplayMetaData } from "../types/ReplayMetaData";
import { mode } from "../Utils";
import { logger } from "../logger";

export function extract_commands_stats(text: string) : CommandStatistics | null {
    if (!text)
        return null;


    const data : CommandStatistics = {
        turns : [] as number[],
        playerCommandDatas: [] as PlayerCommandData[]
    };

    const commands = JSON.parse(text)["commands.txt"];
    const lines = commands.replaceAll("\r\n", "\n").split("\n");
    if (!lines || !lines.length || !lines[0])
        return null;

    const metadata: ReplayMetaData = JSON.parse(lines[0].replace("start ", ""));

    let currentTurn = 0;

    for (const line of lines) {
        if (line.startsWith("turn")) {
            currentTurn = +line.split(" ")[1];
            data.turns.push(currentTurn);
        }
        else if (line.startsWith("cmd")) {
            const player = +line.substring(4, 5) - 1;
            if (!data.playerCommandDatas[player])
                data.playerCommandDatas[player] = { "playerCommands": [] as number[], "playerName": "" };

            if (metadata.settings?.PlayerData && metadata.settings.PlayerData[player] && metadata.settings.PlayerData[player].Name) {
                const playerData = metadata.settings?.PlayerData[player];
                const nameWithoutRating = playerData.Name?.split("(")[0].trimEnd();
                data.playerCommandDatas[player].playerName = nameWithoutRating ?? "Unknown" + player;
            }
            else
                data.playerCommandDatas[player].playerName = "Unknown" + player;

            data.playerCommandDatas[player].playerCommands[currentTurn] = (data.playerCommandDatas[player].playerCommands[currentTurn] ?? 0) + 1;
        }
    }

    for(let i = 0; i< data.playerCommandDatas.length; ++i)
    {
        const player = data.playerCommandDatas[i];
        if (!player)
        {
            data.playerCommandDatas[i] = { "playerCommands": [] as number[], "playerName": "" };
            if (metadata.settings?.PlayerData && metadata.settings.PlayerData[i] && metadata.settings.PlayerData[i].Name) {
                const playerData = metadata.settings?.PlayerData[i];
                const nameWithoutRating = playerData.Name?.split("(")[0].trimEnd();
                data.playerCommandDatas[i].playerName = nameWithoutRating ?? "Unknown" + i;
            }
            else
                data.playerCommandDatas[i].playerName = "Unknown" + i;
        }
    }

    // Fill in the missing commands
    for(let i = 0; i <= currentTurn; ++i){
        for(let j = 0; j < data.playerCommandDatas.length; ++j){
            if (data.playerCommandDatas[j].playerCommands[i] === undefined)
                data.playerCommandDatas[j].playerCommands[i] = 0;
        }
    }


    return data;
}

export function extract_commands_data(text: string): ReplayMetaData | null | undefined {
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
        logger.error(error);
    }
}
