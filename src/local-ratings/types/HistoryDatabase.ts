/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

interface LocalRatingsHistoryDirectoryElement {
    [directoryName: string]: LocalRatingsHistoryDatabaseElement
}

interface LocalRatingsHistoryDatabaseElement {
    rating: number;
    civ: string;
}

interface LocalRatingsHistoryDatabase {
    [playerName: string]: LocalRatingsHistoryDirectoryElement
}

interface LocalRatingsHistoryMinifiedDatabaseElement {
    [index: number]: number
}

interface LocalRatingsHistoryMinifiedDirectoryElement {
    [playerName: string]: LocalRatingsHistoryMinifiedDatabaseElement
}

interface LocalRatingsHistoryMinifiedDatabase {
    [playerName: string]: LocalRatingsHistoryMinifiedDirectoryElement
}

export type {
    LocalRatingsHistoryDatabase,
    LocalRatingsHistoryDatabaseElement,
    LocalRatingsHistoryDirectoryElement,
    LocalRatingsHistoryMinifiedDatabase,
    LocalRatingsHistoryMinifiedDirectoryElement,LocalRatingsHistoryMinifiedDatabaseElement
};
