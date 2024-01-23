/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { LocalRatingsSettings } from '../Settings'
import { LocalRatingsCache } from '../Cache'
import { LocalRatingsReplayDB } from '../ReplayDB';
import { LocalRatingsRatingsDB } from '../RatingsDB';
import { LocalRatingsRatingDatabase } from '../types/RatingDatabase';
import { LocalRatingsHistoryDatabase } from '../types/HistoryDatabase';
import { LocalRatingsAlias } from '../Alias';

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
 * Return the name of a player, with the addition of the rating and the number of matches in gray color
 * @param {string} text
 * @param {object} playerData
 * @param {number} playerData.rating
 * @param {number} playerData.matches
 * @returns {string}
 */
function addRating_LocalRatings(text: string, playerData : any) {
    const settings = new LocalRatingsSettings();
    const configKey = "localratings.general.format";
    const savedFormat = settings.getSaved()[configKey];
    const defaultFormat = settings.getDefault()[configKey];
    const format = !(/r.*r|m.*m/.test(savedFormat)) ? savedFormat : defaultFormat;
    const str = format
        .replace("r", formatRating_LocalRatings(playerData.rating))
        .replace("m", playerData.matches)
        .replace("\\", "\\\\") // escape backslash
        .replace("[", "\\[") // escape left square bracket
        .replace("]", "\\]") // escape right square bracket

    return text + " " + coloredText(str, "gray");
}

function coloredText(str : string, color: string)
{
    return str;
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
    "cacheDb": LocalRatingsCache
}

declare module 'fastify' {
    interface FastifyInstance extends LocalRatingsState {
        ratingsDb: LocalRatingsRatingsDB
        replayDb: LocalRatingsReplayDB,
        aliasDb: LocalRatingsAlias
        cacheDb: LocalRatingsCache
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

    // If cache version has changed, we empty all databases and we do nothing.
    // Only a full rebuild will re-populate databases
    const cache = new LocalRatingsCache();
    const replayDB = new LocalRatingsReplayDB();
    const ratingsDB = new LocalRatingsRatingsDB();
    const alias = new LocalRatingsAlias();
    if (cache.isUpdateRequired())
    {
        replayDB.rebuild();
        ratingsDB.rebuild();
        ratingsDB.save();
    }

    const data : LocalRatingsState = {
        "ratingsDb": ratingsDB,
        "replayDb": replayDB,
        "cacheDb": cache,
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
    addRating_LocalRatings,
    getAvd_LocalRatings,
    getStd_LocalRatings,
    getMean_LocalRatings,
    formatRating_LocalRatings,
    update_LocalRatings
}
