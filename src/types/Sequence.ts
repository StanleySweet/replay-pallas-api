export interface Sequences
{
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
    enemyUnitsKilled: any;
    enemyUnitsKilledValue: any;
    tradeIncome: any;
    tributesReceived: any;
    tributesSent: any;
    resourcesSold: ResourceSequence;
    resourcesBought: ResourceSequence;
    resourcesUsed: ResourceSequence;
    resourcesGathered: ResourceSequence;
}

export interface ResourceSequence
{
    metal: number[];
    stone: number[];
    wood: number[];
    food: number[];
}


