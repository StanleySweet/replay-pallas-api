
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { EngineInstance as Engine } from "../../types/Engine";
import { ReplayMetaData } from "../../types/ReplayMetaData";
import { LocalRatingsSequences } from "../Sequences";
import { getMean_LocalRatings } from "../utilities/functions_utility";

export class LocalRatingsMetadataContainer {
    directory;
    attribs: ReplayMetaData;

    constructor()
    {
        this.directory = "";
        this.attribs = {} as ReplayMetaData;
    }

    getDuration() : number {
        return this.attribs?.settings?.MatchDuration ?? 0;
    }

    padNumber(number : number) {
        return number.toString().padStart(2, '0');
    }

    timeToString(unixTimeStamp : number) : string
    {
        const currentDate = new Date(unixTimeStamp);
        return `${this.padNumber(currentDate.getFullYear())}-${this.padNumber(currentDate.getMonth() + 1)}-${this.padNumber(currentDate.getDate())}`;
    }

    getDate(): string {
        return this.timeToString((this.attribs.timestamp ?? 0) * 1000);
    }

    getPlayerNames(): string[] {
        return this.attribs.settings?.PlayerData?.map(x => x.Name!) ?? [];
    }

    getCivs(): string[] {
        return this.attribs.settings?.PlayerData?.map(x => x.Civ!) ?? [];
    }

    getTeamsSize() {
        const teamData: { [team: string]: number } = {};
        this.attribs.settings?.PlayerData?.forEach(x => {
            const team = x.Team;
            if (!team)
                return;


            (team in teamData) ? teamData[team] += 1 : teamData[team] = 1;
        });
        // Fix the "None" team
        if ("-1" in teamData)
            for (let i = -teamData["-1"]; i < 0; i++)
                teamData[i] = 1;
        return teamData;
    }

    getStartingResources() {
        return this.attribs.settings?.StartingResources;
    }

    getPopulationCap() {
        if (typeof this.attribs.settings?.WorldPopulation !== "undefined")
            return Math.floor(this.getWorldPopulationCap() / this.getPlayerNames().length);
        return this.attribs.settings?.PopulationCap;
    }

    getWorldPopulationCap(): number {
        return this.attribs.settings?.WorldPopulationCap ?? 0;
    }

    getWorldPopulation() {
        return (typeof this.attribs.settings?.WorldPopulation !== "undefined");
    }

    isPlayerAI(playerName: string): boolean {
        return this.attribs.settings?.PlayerData?.filter(x => x.Name === playerName)[0].AI ?? false;
    }

    getCheatsEnabled(): boolean {
        return this.attribs.settings?.CheatsEnabled ?? false;
    }

    getRevealedMap(): boolean {
        return this.attribs.settings?.RevealMap ?? false;
    }

    getExploredMap(): boolean {
        return this.attribs.settings?.ExploreMap ?? false;
    }

    getNomad(): boolean {
        return this.attribs.settings?.Nomad ?? false;
    }

    getMods() {
        return this.attribs.mods.filter((a : { mod: string, version: string }) => a.mod && a.version).map((x: { mod: string, version: string }) => x.mod + " " + x.version);
    }

    getScores(playerName: string): LocalRatingsSequences {
        const fullMetadata: ReplayMetaData = Engine.GetReplayMetadata(this.directory);
        if (fullMetadata.playerStates) {
            const sequencesArray = fullMetadata.playerStates.filter(x => x.name == playerName);
            if (sequencesArray.length) {
                const sequences = sequencesArray[0].sequences;
                const sequencesObj = new LocalRatingsSequences(sequences);
                // Check if all keys are defined, otherwise return empty object
                if (sequencesObj.validate()) {
                    Object.keys(sequencesObj).forEach(x => sequencesObj[x] = getMean_LocalRatings(sequencesObj[x]));
                    return sequencesObj;
                }
            }
        }
        return {} as LocalRatingsSequences;
    }
}
