/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

class Rating {
    static minRating = 400;
    static maxRating = 4000;
    static minDeviation = 45;
    static standardRankableDeviation = 75;
    static provisionalDeviation = 110;
    static cluelessDeviation = 230;
    static maxDeviation = 500;
    static maxVolatility = 0.1;
    static defaultVolatility = 0.09;
    static defaultDeviation = 350;
    static defaultRating = 1500.0;

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
        this.ratingDeviation = ratingDeviation;
        this.workingRatingDeviation = 0;
        this.workingRating = 0;
        this.workingVolatility = 0;
        this.lastRatingPeriodEnd = lastRatingPeriodEnd;
    }

    incrementNumberOfResults(increment: number): void {
        this.numberOfResults = this.numberOfResults + increment;
    }
}

export {
    Rating
};