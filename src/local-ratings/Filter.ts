import { EngineInstance as Engine } from "../types/Engine";
import { LocalRatingsReplay } from "./Replay";
import { timeToString } from "./utilities/functions_utility";

/**
 * This class is responsible for reading the user-defined match filters found the user.cfg configuraton file and use them to check whether a replay object must be filtered or not.
 * The method applies(replayObj) returns true if replayObj must be filtered, false otherwise.
 */
class LocalRatingsFilter
{
    configOptions

    constructor()
    {
        this.configOptions = {
            "duration": this.getDuration(),
            "minstartres": this.getMinStartRes(),
            "maxstartres": this.getMaxStartRes(),
            "minpopcap": this.getMinPopCap(),
            "maxpopcap": this.getMaxPopCap(),
            "worldpopulation": this.getWorldPopulation(),
            "aiplayers": this.getAiPlayers(),
            "cheatsenabled": this.getCheatsEnabled(),
            "revealedmap": this.getRevealedMap(),
            "exploredmap": this.getExploredMap(),
            "nomad": this.getNomad(),
            "uneventeams": this.getUnevenTeams(),
            "minteams": this.getMinTeams(),
            "maxteams": this.getMaxTeams(),
            "minplayers": this.getMinPlayers(),
            "maxplayers": this.getMaxPlayers(),
            "recentdate": this.getRecentDate(),
            "mods": this.getMods()
        };
    }

    // Config option retrieval functions

    getDuration()
    {
        const durationValue = Engine.ConfigDB_GetValue("user", "localratings.filter.duration");
        const durationValueInt = +(durationValue ?? 0);
        return durationValueInt;
    }

    getMinStartRes()
    {
        const minStartResValue = Engine.ConfigDB_GetValue("user", "localratings.filter.minstartres");
        const minStartResValueInt = +(minStartResValue ?? 0);
        return minStartResValueInt;
    }

    getMaxStartRes()
    {
        const maxStartResValue = Engine.ConfigDB_GetValue("user", "localratings.filter.maxstartres");
        const maxStartResValueInt = +(maxStartResValue ?? 0);
        return maxStartResValueInt;
    }

    getMinPopCap()
    {
        const minPopCapValue = Engine.ConfigDB_GetValue("user", "localratings.filter.minpopcap");
        const minPopCapValueInt = +(minPopCapValue ?? 0);
        return minPopCapValueInt;
    }

    getMaxPopCap()
    {
        const maxPopCapValue = Engine.ConfigDB_GetValue("user", "localratings.filter.maxpopcap");
        const maxPopCapValueInt = +(maxPopCapValue ?? 0);
        return maxPopCapValueInt;
    }

    getWorldPopulation()
    {
        const worldPopulationValue = Engine.ConfigDB_GetValue("user", "localratings.filter.worldpopulation");
        const worldPopulationValueBoolean = (worldPopulationValue === "true");
        return worldPopulationValueBoolean;
    }

    getAiPlayers()
    {
        const AIPlayersValue = Engine.ConfigDB_GetValue("user", "localratings.filter.aiplayers");
        const AIPlayersValueBoolean = (AIPlayersValue === "true");
        return AIPlayersValueBoolean;
    }

    getCheatsEnabled()
    {
        const cheatsValue = Engine.ConfigDB_GetValue("user", "localratings.filter.cheatsenabled");
        const cheatsValueBoolean = (cheatsValue === "true");
        return cheatsValueBoolean;
    }

    getRevealedMap()
    {
        const revealedMapValue = Engine.ConfigDB_GetValue("user", "localratings.filter.revealedmap");
        const revealedMapValueBoolean = (revealedMapValue === "true");
        return revealedMapValueBoolean;
    }

    getExploredMap()
    {
        const exploredMapValue = Engine.ConfigDB_GetValue("user", "localratings.filter.exploredmap");
        const exploredMapValueBoolean = (exploredMapValue === "true");
        return exploredMapValueBoolean;
    }

    getNomad()
    {
        const nomadValue = Engine.ConfigDB_GetValue("user", "localratings.filter.nomad");
        const nomadValueBoolean = (nomadValue === "true");
        return nomadValueBoolean;
    }

    getUnevenTeams()
    {
        const unevenTeamsValue = Engine.ConfigDB_GetValue("user", "localratings.filter.uneventeams");
        const unevenTeamsValueBoolean = (unevenTeamsValue === "true");
        return unevenTeamsValueBoolean;
    }

    getMinTeams()
    {
        const minTeamsValue = Engine.ConfigDB_GetValue("user", "localratings.filter.minteams");
        const minTeamsValueInt = +(minTeamsValue ?? 0);
        return minTeamsValueInt;
    }

    getMaxTeams()
    {
        const maxTeamsValue = Engine.ConfigDB_GetValue("user", "localratings.filter.maxteams");
        const maxTeamsValueInt = +(maxTeamsValue ?? 0);
        return maxTeamsValueInt;
    }

    getMinPlayers()
    {
        const minPlayersValue = Engine.ConfigDB_GetValue("user", "localratings.filter.minplayers");
        const minPlayersValueInt = +(minPlayersValue ?? 0);
        return minPlayersValueInt;
    }

    getMaxPlayers()
    {
        const maxPlayersValue = Engine.ConfigDB_GetValue("user", "localratings.filter.maxplayers");
        const maxPlayersValueInt = +(maxPlayersValue ?? 0);
        return maxPlayersValueInt;
    }

    getRecentDate()
    {
        const recentDateValue = Engine.ConfigDB_GetValue("user", "localratings.filter.recentdate");
        const recentDateArray = recentDateValue?.split("-");
        return recentDateArray;
    }

    getMods()
    {
        const modsString = Engine.ConfigDB_GetValue("user", "localratings.modfilter");
        const modsArray = modsString?.split(" ").filter(x => x !== "");
        return modsArray;
    }

    // Filtering functions

    filterDuration(replayObj : LocalRatingsReplay)
    {
        const replayDurationMinutes = +timeToString(replayObj.duration * 1000).split(":")[1];
        return (replayDurationMinutes < this.configOptions.duration);
    }

    filterMinStartRes(replayObj : LocalRatingsReplay)
    {
        return (replayObj.startingResources < this.configOptions.minstartres);
    }

    filterMaxStartRes(replayObj : LocalRatingsReplay)
    {
        return (replayObj.startingResources > this.configOptions.maxstartres);
    }

    filterMinPopCap(replayObj : LocalRatingsReplay)
    {
        return (replayObj.populationCap < this.configOptions.minpopcap);
    }

    filterMaxPopCap(replayObj : LocalRatingsReplay)
    {
        return (replayObj.populationCap > this.configOptions.maxpopcap);
    }

    filterWorldPopulation(replayObj : LocalRatingsReplay)
    {
        return (replayObj.worldPopulation > this.configOptions.worldpopulation);
    }

    filterAiPlayers(replayObj : LocalRatingsReplay)
    {
        return (replayObj.hasAiPlayers && !this.configOptions.aiplayers);
    }

    filterCheatsEnabled(replayObj : LocalRatingsReplay)
    {
        return (replayObj.cheatsEnabled && !this.configOptions.cheatsenabled);
    }

    filterRevealedMap(replayObj : LocalRatingsReplay)
    {
        return (replayObj.revealedMap && !this.configOptions.revealedmap);
    }

    filterExploredMap(replayObj : LocalRatingsReplay)
    {
        return (replayObj.revealedMap && replayObj.exploredMap && !this.configOptions.exploredmap);
    }

    filterNomad(replayObj : LocalRatingsReplay)
    {
        return (replayObj.nomad && !this.configOptions.nomad);
    }

    filterUnevenTeams(replayObj : LocalRatingsReplay)
    {
        const firstTeamSize = replayObj.teamsSize[Object.keys(replayObj.teamsSize)[0]];
        const unevenTeams = Object.values(replayObj.teamsSize).some(x => x != firstTeamSize);
        return (unevenTeams && !this.configOptions.uneventeams);
    }

    filterMinTeams(replayObj : LocalRatingsReplay)
    {
        return (Object.keys(replayObj.teamsSize).length < this.configOptions.minteams);
    }

    filterMaxTeams(replayObj : LocalRatingsReplay)
    {
        return (Object.keys(replayObj.teamsSize).length > this.configOptions.maxteams);
    }

    filterMinPlayers(replayObj : LocalRatingsReplay)
    {
        return (replayObj.players.length < this.configOptions.minplayers);
    }

    filterMaxPlayers(replayObj : LocalRatingsReplay)
    {
        return (replayObj.players.length > this.configOptions.maxplayers);
    }

    filterRecentDate(replayObj : LocalRatingsReplay)
    {
        const replayDate : string[] = replayObj.date.split("-");
        if (!this.configOptions.recentdate)
            return false;
        if (this.configOptions.recentdate.length != 3)
            return true;
        if (this.configOptions.recentdate.some(x => isNaN(+x)))
            return true;
        if (replayDate.some((x, i) => +x < +(this.configOptions.recentdate?.[i] ?? 0)))
            return true;
        return false;
    }

    filterMods(replayObj : LocalRatingsReplay)
    {
        return replayObj.mods.map(x => x.replace(" ", "")).some(x => this.configOptions.mods?.includes(x));
    }

    // Main function

    applies(replayObj : LocalRatingsReplay)
    {
        if (this.filterDuration(replayObj))
            return true;
        if (this.filterMinStartRes(replayObj))
            return true;
        if (this.filterMaxStartRes(replayObj))
            return true;
        if (this.filterMinPopCap(replayObj))
            return true;
        if (this.filterMaxPopCap(replayObj))
            return true;
        if (this.filterWorldPopulation(replayObj))
            return true;
        if (this.filterAiPlayers(replayObj))
            return true;
        if (this.filterCheatsEnabled(replayObj))
            return true;
        if (this.filterRevealedMap(replayObj))
            return true;
        if (this.filterExploredMap(replayObj))
            return true;
        if (this.filterNomad(replayObj))
            return true;
        if (this.filterUnevenTeams(replayObj))
            return true;
        if (this.filterMinTeams(replayObj))
            return true;
        if (this.filterMaxTeams(replayObj))
            return true;
        if (this.filterMinPlayers(replayObj))
            return true;
        if (this.filterMaxPlayers(replayObj))
            return true;
        if (this.filterRecentDate(replayObj))
            return true;
        if (this.filterMods(replayObj))
            return true;
        return false;
    }

}

export {
    LocalRatingsFilter
}
