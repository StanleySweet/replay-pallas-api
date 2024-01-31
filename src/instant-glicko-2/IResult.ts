/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Rating } from "./Rating";

interface IResult {
    getScore: (player: Rating) => number
    getOpponent: (player: Rating) => Rating
    participated: (player: Rating) => boolean
    players: Rating[]
}

export {
    IResult
};