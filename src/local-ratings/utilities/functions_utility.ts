/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { LocalRatingsSettings } from '../Settings'
import { LocalRatingsCache } from '../Cache'
import { LocalRatingsReplayDB } from '../ReplayDB';
import { LocalRatingsRatingsDB } from '../RatingsDB';
import { LocalRatingsAlias } from '../Alias';
import { LocalRatingsMinifier } from '../Minifier';

/**
 * Convert a number to a string with two decimal digits
 * @param {number} value
 * @returns {string}
 */
function formatRating_LocalRatings(value: number): string {
    return (value * 100).toFixed(2);
}

/**
 * Return the mean of a non-empty numeric array
 * @param {array} array
 * @returns {number}
 */
function getMean_LocalRatings(array: number[]): number {
    return array.reduce((pv: number, cv: number) => pv + cv, 0) / array.length;
}

/**
 * Return the standard deviation of a non-empty numeric array with given mean value
 * @param {array} array
 * @param {number} mean
 * @returns {number}
 */
function getStd_LocalRatings(array: number[], mean: number): number {
    return Math.sqrt(array.reduce((pv, cv) => pv + (cv - mean) ** 2, 0) / array.length);
}

/**
 * Return the average deviation of a non-empty numeric array with given mean value
 * @param {array} array
 * @param {number} mean
 * @returns {number}
 */
function getAvd_LocalRatings(array: number[], mean: number): number {
    return getMean_LocalRatings(array.map(x => Math.abs(x - mean)));
}

/**
 * splitRatingFromNick from gui/common/gamedescription.js does not adapt to situations like "Player One (custom rating)".
 * Therefore we need a different function to split the name from the rating.
 * @param {string} playerName
 * @returns {object}
 */
function getPlayerName_LocalRatings(playerName: string): string {
    const split = playerName?.split(/\s+(?=\()/);
    return (split?.length > 0) ? split[0] : "";
}

/**
 * Return -1 if a comes before b in the alphabet, +1 otherwise
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function sortString_LocalRatings(a: string, b: string): number {
    return a.toLowerCase().localeCompare(b.toLowerCase());
}

export interface LocalRatingsState {
    "ratingsDb": LocalRatingsRatingsDB,
    "replayDb": LocalRatingsReplayDB,
    "aliasDb": LocalRatingsAlias,
}

declare module 'fastify' {
    interface FastifyInstance extends LocalRatingsState {
        ratingsDb: LocalRatingsRatingsDB
        replayDb: LocalRatingsReplayDB,
        aliasDb: LocalRatingsAlias
    }
}


/**
 * Return the ratings database, after performing an update with new replays
 * @returns {object}
 */
function init_LocalRatings() : LocalRatingsState {
    // Write default settings in user.cfg if not present
    const settings = new LocalRatingsSettings();
    settings.createDefaultSettingsIfNotExist();

    const cache = new LocalRatingsCache();
    const minifier = new LocalRatingsMinifier();
    const replayDB = new LocalRatingsReplayDB(cache, minifier);
    const ratingsDB = new LocalRatingsRatingsDB(cache, minifier);
    const alias = new LocalRatingsAlias(cache);
    if (replayDB.cache.isUpdateRequired())
    {
        replayDB.rebuild();
        ratingsDB.rebuild();
    }

    const data : LocalRatingsState = {
        "ratingsDb": ratingsDB,
        "replayDb": replayDB,
        "aliasDb" : alias
    } as LocalRatingsState;

    update_LocalRatings(data);
    return data;
}


function update_LocalRatings(state: LocalRatingsState)
{
    state.replayDb.update();
    state.ratingsDb.load();
    state.ratingsDb.merge(state.replayDb.newReplays);
    state.ratingsDb.save();

    state.aliasDb.merge(state.ratingsDb.ratingsDatabase, undefined);
    state.aliasDb.merge(undefined, state.ratingsDb.historyDatabase);
    state.aliasDb.load();
}

function padNumber(number : number) {
    return number.toString().padStart(2, '0');
}

function timeToString(unixTimeStamp : number) : string
{
    const currentDate = new Date(unixTimeStamp);
    return `${padNumber(currentDate.getHours())}:${padNumber(currentDate.getMinutes())}:${padNumber(currentDate.getSeconds())}`;
}

export {
    init_LocalRatings,
    timeToString,
    sortString_LocalRatings,
    getPlayerName_LocalRatings,
    getAvd_LocalRatings,
    getStd_LocalRatings,
    getMean_LocalRatings,
    formatRating_LocalRatings,
    update_LocalRatings
}
