/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Replays } from "../types/Replay";
import { LobbyRankingHistoryEntries, LobbyRankingHistoryEntry } from "../types/LobbyRankingHistoryEntry";
import { unpackBlob } from "./blobCodec";

function padNumber(number: number) {
    return number.toString().padStart(2, '0');
}

// The lobby rating each player had in each replay, read from the "(1500)" after the name in the lobby.
const getRanks = (replays: Replays): LobbyRankingHistoryEntries => {
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

export { getRanks };
