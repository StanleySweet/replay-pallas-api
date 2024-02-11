/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */
export class ReplayFileData {
    Name: string;
    Data: unknown;
    Contents: unknown;

    constructor() {
        this.Name = "";
        this.Data = null;
        this.Contents = null;
    }
}
