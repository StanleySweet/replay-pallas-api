/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

export class UploadReplayZipResponse {
    public Success: boolean;
    public AddedReplays: string[];

    constructor()
    {
        this.AddedReplays = [];
        this.Success = false;
    }
}
