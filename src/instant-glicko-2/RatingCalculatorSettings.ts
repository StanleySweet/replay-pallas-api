/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

class RatingCalculatorSettings {
    /**
     * Default rating.
     */
    DefaultRating: number = 1500.0;
    Multiplier: number = 173.7178;
    /**
     * Reasonable choices are between 0.3 and 1.2, though the system should be tested to decide which value results in greatest predictive accuracy.
     */
    Tau: number = 0.75;
    RatingPeriodsPerDay: number = 0;
    /**
     * Default rating deviation. Small number = good confidence on the rating accuracy
     */
    DefaultDeviation: number = 350;
    ConvergenceTolerance: number = 0.000001;
    MaxIterations: number = 1000;
    DefaultVolatility : number = 0.06;
}

export {
    RatingCalculatorSettings
}