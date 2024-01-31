/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { FloatingResult } from "./FloatingResult";
import { GameResult } from "./GameResult";
import { IResult } from "./IResult";
import { Rating } from "./Rating";

abstract class RatingPeriodResults<T extends IResult> {
    results: T[];

    constructor(results: T[]) {
        this.results = results;
    }

    getResults(player: Rating): T[] {
        return this.results.filter(a => a.players.some(b => b === player));
    }

    getParticipants(): Set<Rating> {
        return new Set<Rating>(this.results.flatMap(a => a.players));
    }
}

class GameRatingPeriodResults extends RatingPeriodResults<GameResult> {}

class FloatingRatingPeriodResults extends RatingPeriodResults<FloatingResult> {}

export {
    RatingPeriodResults,
    GameRatingPeriodResults,
    FloatingRatingPeriodResults
};