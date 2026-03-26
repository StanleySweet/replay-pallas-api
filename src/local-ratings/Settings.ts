import { EngineInstance as Engine } from "../types/Engine";
import { LocalRatingsOptions } from "./types/Options";

type LocalRatingsSettings = {
    [key: string]: string | null
}

/**
 * This class is responsible for dealing with settings.
 */
class LocalRatingsSettingsManager {
    getOptionsDefinition(): LocalRatingsOptions {
        return Engine.ReadJSONFile("src/local-ratings/types/options.json") as LocalRatingsOptions;
    }

    getSaved(): LocalRatingsSettings {
        const optionsJSON = this.getOptionsDefinition();
        let settings: LocalRatingsSettings = {};
        for (const category of optionsJSON) {
            for (const option of category.options) {
                const configOption = option.config as keyof typeof settings;
                settings[configOption] = Engine.ConfigDB_GetValue("user", option.config);
            }
        }

        settings = Object.assign(settings, this.getDynamicSaved());
        return settings;
    }

    getDynamicSaved(): { "localratings.modfilter": string | null } {
        return { "localratings.modfilter": Engine.ConfigDB_GetValue("user", "localratings.modfilter") };
    }

    getDefault(): LocalRatingsSettings {
        const optionsJSON = this.getOptionsDefinition();
        let settings: LocalRatingsSettings = {};
        for (const category of optionsJSON) {
            for (const option of category.options) {
                const configOption = option.config as keyof typeof settings;
                settings[configOption] = option.val.toString();
            }
        }
        settings = Object.assign(settings, this.getDynamicDefault());
        return settings;
    }

    getDynamicDefault() {
        return { "localratings.modfilter": "" };
    }

    createDefaultSettingsIfNotExist(): LocalRatingsSettings {
        const settings = this.getDefault();
        Object.keys(settings).filter(key => !Engine.ConfigDB_GetValue("user", key)).forEach(key => Engine.ConfigDB_CreateValue("user", key, settings[key] ?? ""));
        return settings;
    }

    restoreLocalDefault(): LocalRatingsSettings {
        const settings = this.getDefault();
        for (const key of Object.keys(settings)) {
            Engine.ConfigDB_RemoveValue("user", key);
            if (!Engine.ConfigDB_GetValue("user", key)) {
                const settingsKey = key as keyof typeof settings;
                Engine.ConfigDB_CreateValue("user", key, settings[settingsKey] ?? "");
            }
        }
        return settings;
    }

    saveValues(values: LocalRatingsSettings): LocalRatingsSettings {
        const allowedKeys = new Set(Object.keys(this.getDefault()));
        for (const key of Object.keys(values)) {
            if (!allowedKeys.has(key))
                continue;

            Engine.ConfigDB_CreateValue("user", key, values[key] ?? "");
        }

        return this.getSaved();
    }

}

export {
    LocalRatingsSettingsManager
};
