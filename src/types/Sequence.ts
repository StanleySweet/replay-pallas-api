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
    resourcesSold: any;
    resourcesBought: any;
    resourcesUsed: any;
    resourcesGathered: ResourceGatheredSequence;
}

export interface ResourceGatheredSequence
{
    metal: any;
    stone: any;
    wood: any;
    food: any;
}
