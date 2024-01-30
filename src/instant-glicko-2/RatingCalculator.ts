/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Rating } from "./Rating";
import { RatingCalculatorSettings } from "./RatingCalculatorSettings";
import { RatingPeriodResults } from "./RatingPeriodResults";
import { IResult } from "./IResult";

const DAYS_PER_MILLI: number = 1.0 / (1000 * 60 * 60 * 24)

class RatingCalculator {
    settings: RatingCalculatorSettings;
    ratingPeriodsPerMilli: number;
    constructor(settings: RatingCalculatorSettings) {
        this.settings = settings;
        this.ratingPeriodsPerMilli = settings.RatingPeriodsPerDay * DAYS_PER_MILLI;
    }

    convertRatingToOriginalGlickoScale(rating: number): number {
        return ((rating * this.settings.Multiplier) + this.settings.DefaultRating)
    }

    convertRatingToGlicko2Scale(rating: number): number {
        return ((rating - this.settings.DefaultRating) / this.settings.Multiplier)
    }

    convertRatingDeviationToOriginalGlickoScale(ratingDeviation: number): number {
        return (ratingDeviation * this.settings.Multiplier)
    }

    convertRatingDeviationToGlicko2Scale(ratingDeviation: number): number {
        return (ratingDeviation / this.settings.Multiplier)
    }

    predict(player1: Rating, player2: Rating): number {
        var diffRD = Math.sqrt(Math.pow(player1.ratingDeviation, 2) + Math.pow(player2.ratingDeviation, 2));
        return 1 / (1 + Math.exp(-1 * this.g(diffRD) * (player1.rating - player2.rating)));
    };

    private f(x: number, delta: number, phi: number, v: number, a: number, tau: number): number {
        return (Math.exp(x) * (Math.pow(delta, 2) - Math.pow(phi, 2) - v - Math.exp(x)) /
            (2.0 * Math.pow(Math.pow(phi, 2) + v + Math.exp(x), 2))) -
            ((x - a) / Math.pow(tau, 2))
    }

    /**
     * Run through all players within a resultset and calculate their new ratings.
     * Players within the resultset who did not compete during the rating period 
     * will have see their deviation increase (in line with Prof Glickman's paper).
     * Note that this method will clear the results held in the association resultset.
     * @param results 
     * @param skipDeviationIncrease 
     */
    updateRatings(results: RatingPeriodResults<IResult>, skipDeviationIncrease: Boolean = false): void {
        var players = results.getParticipants()
        players.forEach((player) => {
            var elapsedRatingPeriods = skipDeviationIncrease ? 0 : 1;
            if (results.getResults(player).length > 0)
                this.calculateNewRating(player, results.getResults(player), elapsedRatingPeriods)
            else {
                // if a player does not compete during the rating period, then only Step 6 applies.
                // the player's rating and volatility parameters remain the same but deviation increases
                player.workingRating = this.getGlicko2Rating(player)
                player.workingRatingDeviation = this.calculateNewRD(this.getGlicko2RatingDeviation(player), player.volatility, elapsedRatingPeriods)
                player.workingVolatility = player.volatility
            }
        });

        // now iterate through the participants and confirm their new ratings
        players.forEach((player) => { this.finaliseRating(player) });
    }


    /** 
     * Used by the calculation engine, to move interim calculations into their "proper" places.
     */
    finaliseRating(rating : Rating): void {
        rating.rating = this.convertRatingToOriginalGlickoScale(rating.workingRatingDeviation)
        rating.ratingDeviation = this.convertRatingDeviationToOriginalGlickoScale(rating.workingRatingDeviation)
        rating.volatility = rating.workingVolatility
        rating.workingRatingDeviation = 0;
        rating.workingRating = 0;
        rating.workingVolatility = 0;
    }

    previewDeviation(player: Rating, ratingPeriodEndDate: Date, reverse: Boolean): number {
        var elapsedRatingPeriods: number = 0;

        if (player.lastRatingPeriodEnd && this.ratingPeriodsPerMilli > 0) {
            const interval = player.lastRatingPeriodEnd.getTime() - ratingPeriodEndDate.getTime();
            elapsedRatingPeriods = interval * this.ratingPeriodsPerMilli
        }
        if (reverse)
            elapsedRatingPeriods = -elapsedRatingPeriods
        const newRD = this.calculateNewRD(this.getGlicko2RatingDeviation(player), player.volatility, elapsedRatingPeriods)
        let value = this.convertRatingDeviationToOriginalGlickoScale(newRD);
        if (isNaN(value))
            value = player.ratingDeviation;
        return Math.max(Rating.minDeviation, Math.min(Rating.maxDeviation, value))
    }

    calculateNewRating(player: Rating, results: IResult[], elapsedRatingPeriods: number): void {
        const phi = this.getGlicko2RatingDeviation(player)
        const sigma = player.volatility
        const a = Math.log(Math.pow(sigma, 2))
        const delta = this.deltaOf(player, results)
        const v = this.vOf(player, results)

        // step 5.2 - set the initial values of the iterative algorithm to come in step 5.4
        var A: number = a
        var B: number = 0
        if (Math.pow(delta, 2) > Math.pow(phi, 2) + v) {
            B = Math.log(Math.pow(delta, 2) - Math.pow(phi, 2) - v)
        }
        else {
            var k = 1.0
            B = a - (k * Math.abs(this.settings.Tau))
            while (this.f(B, delta, phi, v, a, this.settings.Tau) < 0) {
                k = k + 1
                B = a - (k * Math.abs(this.settings.Tau))
            }
        }

        // step 5.3
        var fA = this.f(A, delta, phi, v, a, this.settings.Tau)
        var fB = this.f(B, delta, phi, v, a, this.settings.Tau)

        // step 5.4
        var iterations = 0
        while (Math.abs(B - A) > this.settings.ConvergenceTolerance && iterations < this.settings.MaxIterations) {
            iterations = iterations + 1
            // println(String.format("%f - %f (%f) > %f", B, A, Math.abs(B - A), CONVERGENCE_TOLERANCE))
            const C = A + (((A - B) * fA) / (fB - fA))
            const fC = this.f(C, delta, phi, v, a, this.settings.Tau)

            if (fC * fB <= 0) {
                A = B
                fA = fB
            }
            else
                fA = fA / 2.0

            B = C
            fB = fC
        }
        if (iterations === this.settings.MaxIterations) {
            console.error(`Convergence fail at ${iterations} iterations`)
            console.error(player.toString())
            results.forEach((result) => { console.error(result) })
            throw new Error("Convergence fail")
        }
        const newSigma = Math.exp(A / 2.0)

        player.workingVolatility = newSigma

        // Step 6
        const phiStar = this.calculateNewRD(phi, newSigma, elapsedRatingPeriods)

        // Step 7
        const newPhi = 1.0 / Math.sqrt((1.0 / Math.pow(phiStar, 2)) + (1.0 / v))

        // note that the newly calculated rating values are stored in a "working" area in the Rating object
        // this avoids us attempting to calculate subsequent participants' ratings against a moving target
        player.workingRating = this.getGlicko2Rating(player) + (Math.pow(newPhi, 2) * this.outcomeBasedRating(player, results))
        player.workingRatingDeviation = newPhi
        player.incrementNumberOfResults(results.length);
    }


    /**
     * This is the first sub-function defined in step 3 of Glickman's paper.
     * @param deviation 
     * @returns 
     */
    private g(deviation: number): number {
        return 1.0 / (Math.sqrt(1.0 + (3.0 * Math.pow(deviation, 2) / Math.pow(Math.PI, 2))))
    }

    /**
     * This is the second sub-function defined in step 3 of Glickman's paper.
     * @param playerRating 
     * @param opponentRating 
     * @param opponentDeviation 
     * @returns 
     */
    private E(playerRating: number, opponentRating: number, opponentDeviation: number) {
        return 1.0 / (1.0 + Math.exp(-1.0 * this.g(opponentDeviation) * (playerRating - opponentRating)))
    }

    /**
     * This is the formula defined in step 3 of Glickman's paper.
     * @param player 
     * @param results 
     * @returns 
     */
    private vOf(player: Rating, results: IResult[]) {
        var v = 0.0;
        for (const result of results) {
            v = v + ((Math.pow(this.g(this.getGlicko2RatingDeviation(result.getOpponent(player))), 2))
                * this.E(
                    this.getGlicko2Rating(player),
                    this.getGlicko2Rating(result.getOpponent(player)),
                    this.getGlicko2RatingDeviation(result.getOpponent(player))
                )
                * (1.0 - this.E(
                    this.getGlicko2Rating(player),
                    this.getGlicko2Rating(result.getOpponent(player)),
                    this.getGlicko2RatingDeviation(result.getOpponent(player))
                )))
        }
        return 1.0 / v;
    }

    /** Return the average skill value of the player scaled down to the scale used by the algorithm's internal
    * workings.
    */
    getGlicko2Rating(rating: Rating): number {
        return this.convertRatingToGlicko2Scale(rating.rating)
    }

    /** Return the rating deviation of the player scaled down to the scale used by the algorithm's internal
         * workings.
         */
    getGlicko2RatingDeviation(rating: Rating): number {
        return this.convertRatingDeviationToGlicko2Scale(rating.ratingDeviation)
    }

    /**
     * 
     * @param player 
     * @param results 
     * @returns 
     */
    private deltaOf(player: Rating, results: IResult[]): number {
        return this.vOf(player, results) * this.outcomeBasedRating(player, results);
    }

    /**
     * This is the formula defined in step 4 of Glickman's paper.
     * @param player 
     * @param results 
     * @returns the expected rating based on game outcomes.
     */
    private outcomeBasedRating(player: Rating, results: IResult[]): number {
        let outcomeBasedRating = 0;
        for (const result of results) {
            outcomeBasedRating = outcomeBasedRating
                + (this.g(this.getGlicko2RatingDeviation(result.getOpponent(player)))
                    * (result.getScore(player) - this.E(
                        this.getGlicko2Rating(player),
                        this.getGlicko2Rating(result.getOpponent(player)),
                        this.getGlicko2RatingDeviation(result.getOpponent(player))
                    )))
        }

        return outcomeBasedRating
    }

    /**
     * This is the formula defined in step 6 of Glickman's paper. It is also used for players who have not competed during the rating period.
     * @param phi 
     * @param sigma 
     * @param elapsedRatingPeriods 
     * @returns 
     */
    private calculateNewRD(phi: number, sigma: number, elapsedRatingPeriods: number) {
        return Math.sqrt(Math.pow(phi, 2) + elapsedRatingPeriods * Math.pow(sigma, 2))
    }
}

export {
    RatingCalculator
}