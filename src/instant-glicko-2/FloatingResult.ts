/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Rating } from "./Rating";
import { IResult } from "./IResult";

class FloatingResult implements IResult {
    player: Rating;
    opponent: Rating;
    score: number;
    players: Rating[];
    constructor(player: Rating, opponent: Rating, score: number) {
        this.player = player;
        this.opponent = opponent;
        this.score = score;
        this.players = [player, opponent];
    }

    getScore(player: Rating): number {
        return player === this.player ? this.score : 1.0 - this.score;
    }
    getOpponent(player: Rating): Rating {
        return player === this.player ? this.opponent : this.player;
    }
    participated(player: Rating): boolean {
        return player === this.player || player === this.opponent;
    }
}

export {
    FloatingResult
};
