/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

interface LocalRatingsRatingDatabaseElement {
    rating: number;
    matches: number;
}

interface LocalRatingsMinfiedRatingDatabaseElement {
    [index : number] : number
}

interface LocalRatingsRatingDatabase {
    [playerName: string]: LocalRatingsRatingDatabaseElement
}

interface LocalRatingsMinifiedRatingDatabase {
    [player: string]: LocalRatingsMinfiedRatingDatabaseElement
}

export type {
    LocalRatingsRatingDatabase,
    LocalRatingsRatingDatabaseElement,
    LocalRatingsMinifiedRatingDatabase,
    LocalRatingsMinfiedRatingDatabaseElement
}
