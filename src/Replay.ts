/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { ReplayMetaData } from "./ReplayMetaData";
var snappy = require('snappy')
export class Replay {
    MetaData: ReplayMetaData;
    FileData: any;

    constructor() {
        this.MetaData = new ReplayMetaData();
        this.FileData = {};
    }

    async ToDbFormat() {
        return {
            "$matchId": this.MetaData.matchID,
            "$metadata": await snappy.compress(JSON.stringify(this.MetaData)),
            "$filedata": await snappy.compress(JSON.stringify(this.FileData))
        }
    }
}
