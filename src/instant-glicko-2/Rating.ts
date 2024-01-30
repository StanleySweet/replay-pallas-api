/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

class Rating {
    static minRating: number = 400
    static maxRating: number = 4000
    static minDeviation: number = 45
    static standardRankableDeviation: number = 75
    static provisionalDeviation: number = 110
    static cluelessDeviation: number = 230
    static maxDeviation: number = 500
    static maxVolatility: number = 0.1

    rating: number;
    volatility: number;
    numberOfResults: number;
    ratingDeviation: number;
    lastRatingPeriodEnd?: Date;

    workingRatingDeviation: number;
    workingRating: number;
    workingVolatility: number;

    constructor(rating: number, ratingDeviation: number, volatility: number, numberOfResults: number, lastRatingPeriodEnd?: Date) {
        this.rating = rating;
        this.volatility = volatility;
        this.numberOfResults = numberOfResults;
        this.ratingDeviation = ratingDeviation
        this.workingRatingDeviation = 0;
        this.workingRating = 0;
        this.workingVolatility = 0;
        this.lastRatingPeriodEnd = lastRatingPeriodEnd;
    }

    incrementNumberOfResults(increment: number): void {
        this.numberOfResults = this.numberOfResults + increment
    }

   
}

export {
    Rating
}