export interface Sequences {
    unitsCapturedValue: number[];
    unitsCaptured: UnitClassSequence;
    enemyBuildingsDestroyedValue: number[];
    enemyBuildingsDestroyed: BuildingsClassSequence;
    buildingsCapturedValue: number[];
    buildingsCaptured: BuildingsClassSequence;
    buildingsLost: BuildingsClassSequence;
    buildingsConstructed: BuildingsClassSequence;
    percentMapExplored: number[];
    percentMapControlled: number[];
    peakPercentMapControlled: number[];
    successfulBribes: number[];
    enemyUnitsKilled: UnitClassSequence;
    enemyUnitsKilledValue: number[];
    tradeIncome: number[];
    tributesReceived: number[];
    tributesSent: number[];
    resourcesCount: ResourceSequence
    resourcesSold: ResourceSequence;
    resourcesBought: ResourceSequence;
    resourcesUsed: ResourceSequence;
    resourcesGathered: ResourceSequence;
}

export interface ResourceSequence {
    metal: number[];
    stone: number[];
    wood: number[];
    food: number[];
}


export interface UnitClassSequence {
    total: number[];
    Cavalry: number[];
    Champion: number[];
    FemaleCitizen: number[];
    Hero: number[];
    Infantry: number[];
    Ship: number[];
    Siege: number[];
    Trader: number[];
    Worker: number[];
}
export interface BuildingsClassSequence {
    total: number[];
    Economic: number[];
    CivCentre: number[];
    Fortress: number[];
    House: number[];
    Military: number[];
    Outpost: number[];
    Wonder: number[];
}