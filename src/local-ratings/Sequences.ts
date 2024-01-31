import {  Sequences } from "../types/Sequence";

/**
 * This class stores the information on the replay sequences.
 * Each attributes of this class corresponds (as a general principle) to a possible score weight that a user might want to use for the rating calculation.
 */
class LocalRatingsSequences
{
    [key: string] : any

    resourcesGathered: any;
    resourcesUsed: any;
    resourcesBought: any;
    resourcesSold: any;
    tributesSent: any;
    tradeIncome: any;
    enemyUnitsKilledValue: any;
    enemyUnitsKilled: any;
    unitsCapturedValue: any;
    unitsCaptured: any;
    enemyBuildingsDestroyedValue: any;
    enemyBuildingsDestroyed: any;
    buildingsCapturedValue: any;
    buildingsCaptured: any;
    percentMapExplored: any;
    percentMapControlled: any;
    peakPercentMapControlled: any;
    successfulBribes: any;

    constructor(sequences : Sequences)
    {
            // Resources
            this.resourcesGathered = this.getResourcesGathered(sequences);
            this.resourcesUsed = this.getResourcesUsed(sequences);
            this.resourcesBought = this.getResourcesBought(sequences);
            this.resourcesSold = this.getResourcesSold(sequences);
            // Tributes
            this.tributesSent = this.getTributesSent(sequences);
            // Trade
            this.tradeIncome = this.getTradeIncome(sequences);
            // Units
            this.enemyUnitsKilledValue = this.getEnemyUnitsKilledValue(sequences);
            this.enemyUnitsKilled = this.getEnemyUnitsKilled(sequences);
            this.unitsCapturedValue = this.getUnitsCapturedValue(sequences);
            this.unitsCaptured = this.getUnitsCaptured(sequences);
            // Buildings
            this.enemyBuildingsDestroyedValue = this.getEnemyBuildingsDestroyedValue(sequences);
            this.enemyBuildingsDestroyed = this.getEnemyBuildingsDestroyed(sequences);
            this.buildingsCapturedValue = this.getBuildingsCapturedValue(sequences);
            this.buildingsCaptured = this.getBuildingsCaptured(sequences);
            // Map
            this.percentMapExplored = this.getPercentMapExplored(sequences);
            this.percentMapControlled = this.getPercentMapControlled(sequences);
            this.peakPercentMapControlled = this.getPeakPercentMapControlled(sequences);
            // Bribes
            this.successfulBribes = this.getSuccessfulBribes(sequences);
    }

    sumArraysComponentWise(...arrays : any[])
    {
        return arrays.reduce((array1, array2) => array1.map((a : any, i : any) => a + array2[i]));
    }

    validate()
    {
        // Validate top-level keys
        if (Object.values(this).some(x => !Array.isArray(x)))
            return false;
        if (Object.values(this).some(x => x.length == 0))
            return false;
        return true;
    }

    // RESOURCES

    getResourcesGathered(sequences : Sequences)
    {
        return this.sumArraysComponentWise(
            sequences.resourcesGathered.food,
            sequences.resourcesGathered.wood,
            sequences.resourcesGathered.stone,
            sequences.resourcesGathered.metal
        );
    }

    getResourcesUsed(sequences: Sequences)
    {
        return this.sumArraysComponentWise(
            sequences.resourcesUsed.food,
            sequences.resourcesUsed.wood,
            sequences.resourcesUsed.stone,
            sequences.resourcesUsed.metal
        );
    }

    getResourcesBought(sequences : Sequences)
    {
        return this.sumArraysComponentWise(
            sequences.resourcesBought.food,
            sequences.resourcesBought.wood,
            sequences.resourcesBought.stone,
            sequences.resourcesBought.metal
        );
    }

    getResourcesSold(sequences: Sequences)
    {
        return this.sumArraysComponentWise(
            sequences.resourcesSold.food,
            sequences.resourcesSold.wood,
            sequences.resourcesSold.stone,
            sequences.resourcesSold.metal
        );
    }

    // TRIBUTES

    getTributesSent(sequences: Sequences)
    {
        return sequences.tributesSent;
    }

    getTributesReceived(sequences: Sequences)
    {
        return sequences.tributesReceived;
    }

    // TRADE

    getTradeIncome(sequences : Sequences)
    {
        return sequences.tradeIncome;
    }

    // UNITS

    getEnemyUnitsKilledValue(sequences : Sequences)
    {
        return sequences.enemyUnitsKilledValue;
    }

    getEnemyUnitsKilled(sequences : Sequences)
    {
        return sequences.enemyUnitsKilled.total;
    }

    getUnitsCapturedValue(sequences : Sequences)
    {
        return sequences.unitsCapturedValue;
    }

    getUnitsCaptured(sequences : Sequences)
    {
        return sequences.unitsCaptured.total;
    }

    // BUILDINGS

    getEnemyBuildingsDestroyedValue(sequences : Sequences)
    {
        return sequences.enemyBuildingsDestroyedValue;
    }

    getEnemyBuildingsDestroyed(sequences : Sequences)
    {
        return sequences.enemyBuildingsDestroyed.total;
    }

    getBuildingsCapturedValue(sequences : Sequences)
    {
        return sequences.buildingsCapturedValue;
    }

    getBuildingsCaptured(sequences : Sequences)
    {
        return sequences.buildingsCaptured.total;
    }

    // MAP

    getPercentMapExplored(sequences : Sequences)
    {
        return sequences.percentMapExplored;
    }

    getPercentMapControlled(sequences: Sequences)
    {
        return sequences.percentMapControlled;
    }

    getPeakPercentMapControlled(sequences: Sequences)
    {
        return sequences.peakPercentMapControlled;
    }

    // BRIBES

    getSuccessfulBribes(sequences: Sequences)
    {
        return sequences.successfulBribes;
    }

}

export {
    LocalRatingsSequences
};
