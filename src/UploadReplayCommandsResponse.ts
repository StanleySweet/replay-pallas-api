/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

export class UploadReplayCommandsResponse {
    public Success: boolean;
    public AddedReplay: string;

    constructor()
    {
        this.AddedReplay = "";
        this.Success = false;
    }
}
