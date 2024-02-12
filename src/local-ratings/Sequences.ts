import { Sequences } from "../types/Sequence";

function sumArraysComponentWise(...arrays: number[][]) {
    return arrays.reduce((array1, array2) => array1.map((a: number, i: number) => a + array2[i]));
}

/**
 * This class stores the information on the replay sequences.
 * Each attributes of this class corresponds (as a general principle) to a possible score weight that a user might want to use for the rating calculation.
 */
class LocalRatingsSequences {
    [key: string]: number[] | unknown
    
    resourcesGathered: number[];
    resourcesUsed: number[];
    resourcesBought: number[];
    resourcesSold: number[];
    tributesSent: number[];
    tradeIncome: number[];
    enemyUnitsKilledValue: number[];
    enemyUnitsKilled: number[];
    unitsCapturedValue: number[];
    unitsCaptured: number[];
    enemyBuildingsDestroyedValue: number[];
    enemyBuildingsDestroyed: number[];
    buildingsCapturedValue: number[];
    buildingsCaptured: number[];
    percentMapExplored: number[];
    percentMapControlled: number[];
    peakPercentMapControlled: number[];
    successfulBribes: number[];

    constructor(sequences: Sequences) {
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

    validate(): boolean {
        // Validate top-level keys
        if (Object.values(this).some(x => !Array.isArray(x)))
            return false;
        if (Object.values(this).some(x => (x as number[]).length === 0))
            return false;
        return true;
    }

    // RESOURCES

    getResourcesGathered(sequences: Sequences): number[] {
        return sumArraysComponentWise(
            sequences.resourcesGathered.food,
            sequences.resourcesGathered.wood,
            sequences.resourcesGathered.stone,
            sequences.resourcesGathered.metal
        );
    }

    getResourcesUsed(sequences: Sequences): number[] {
        return sumArraysComponentWise(
            sequences.resourcesUsed.food,
            sequences.resourcesUsed.wood,
            sequences.resourcesUsed.stone,
            sequences.resourcesUsed.metal
        );
    }

    getResourcesBought(sequences: Sequences): number[] {
        return sumArraysComponentWise(
            sequences.resourcesBought.food,
            sequences.resourcesBought.wood,
            sequences.resourcesBought.stone,
            sequences.resourcesBought.metal
        );
    }

    getResourcesSold(sequences: Sequences): number[] {
        return sumArraysComponentWise(
            sequences.resourcesSold.food,
            sequences.resourcesSold.wood,
            sequences.resourcesSold.stone,
            sequences.resourcesSold.metal
        );
    }

    // TRIBUTES

    getTributesSent(sequences: Sequences): number[] {
        return sequences.tributesSent;
    }

    getTributesReceived(sequences: Sequences): number[] {
        return sequences.tributesReceived;
    }

    // TRADE

    getTradeIncome(sequences: Sequences): number[] {
        return sequences.tradeIncome;
    }

    // UNITS

    getEnemyUnitsKilledValue(sequences: Sequences): number[] {
        return sequences.enemyUnitsKilledValue;
    }

    getEnemyUnitsKilled(sequences: Sequences): number[] {
        return sequences.enemyUnitsKilled.total;
    }

    getUnitsCapturedValue(sequences: Sequences): number[] {
        return sequences.unitsCapturedValue;
    }

    getUnitsCaptured(sequences: Sequences): number[] {
        return sequences.unitsCaptured.total;
    }

    getEnemyBuildingsDestroyedValue(sequences: Sequences): number[] {
        return sequences.enemyBuildingsDestroyedValue;
    }

    getEnemyBuildingsDestroyed(sequences: Sequences): number[] {
        return sequences.enemyBuildingsDestroyed.total;
    }

    getBuildingsCapturedValue(sequences: Sequences): number[] {
        return sequences.buildingsCapturedValue;
    }

    getBuildingsCaptured(sequences: Sequences): number[] {
        return sequences.buildingsCaptured.total;
    }

    getPercentMapExplored(sequences: Sequences): number[] {
        return sequences.percentMapExplored;
    }

    getPercentMapControlled(sequences: Sequences): number[] {
        return sequences.percentMapControlled;
    }

    getPeakPercentMapControlled(sequences: Sequences): number[] {
        return sequences.peakPercentMapControlled;
    }

    getSuccessfulBribes(sequences: Sequences): number[] {
        return sequences.successfulBribes;
    }
}

export {
    LocalRatingsSequences
};
