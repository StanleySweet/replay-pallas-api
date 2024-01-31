import { EngineInstance as Engine } from '../types/Engine';
import { LocalRatingsOptions } from './types/Options';

/**
 * This class is responsible for reading and storing the user-defined player weights from the user.cfg configuraton file.
 */
class LocalRatingsWeights {

    [state: string]: number

    constructor() {
        const optionsJSON: LocalRatingsOptions = Engine.ReadJSONFile("src/local-ratings/types/options.json") as LocalRatingsOptions;
        const configKeyType = "localratings.weight.";
        const configKeys = optionsJSON.filter(x => x.label === "Score Weights")[0].options.map(x => x.config);
        const configKeyTypeLength = configKeyType.length;
        for (const fullConfigKey of configKeys) {
            const configKey = fullConfigKey.substring(configKeyTypeLength) as keyof LocalRatingsWeights;
            this[configKey] = + (Engine.ConfigDB_GetValue("user", fullConfigKey) ?? 0);
        }
    }

}

export { LocalRatingsWeights };
