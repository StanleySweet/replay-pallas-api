/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Rating } from "./Rating";
import { IResult } from "./IResult";

const POINTS_FOR_WIN = 1.0;
const POINTS_FOR_LOSS = 0.0;
const POINTS_FOR_DRAW = 0.5;

class GameResult implements IResult {
    winner: Rating;
    isDraw: Boolean;
    loser: Rating;
    players: Rating[];

    constructor(winner: Rating, loser: Rating, isDraw: Boolean) {
        this.winner = winner;
        this.loser = loser;
        this.players = [winner, loser];
        this.isDraw = isDraw;
    }

    getScore(player: Rating): number {
        if (this.isDraw)
            return POINTS_FOR_DRAW;
        else if (this.winner === player)
            return POINTS_FOR_WIN;
        else if (this.loser === player)
            return POINTS_FOR_LOSS;
        else
            throw new Error("Player did not participate in match")
    }

    getOpponent(player: Rating): Rating {
        if (this.winner === player)
            return this.loser
        else if (this.loser === player)
            return this.winner
        else
            throw new Error("Player did not participate in match")
    }

    participated(player: Rating): Boolean {
        return player === this.winner || player === this.loser;
    }
}

export {
    GameResult
}