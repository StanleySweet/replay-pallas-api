import { EngineInstance as Engine } from "../types/Engine";
import { LocalRatingsOptions } from "./types/Options";

/**
 * This class is responsible for dealing with settings.
 */
class LocalRatingsSettings {
    getSaved() {
        const optionsJSON: LocalRatingsOptions = Engine.ReadJSONFile("src/local-ratings/types/options.json");
        let settings: { [key: string]: string | null } = {};
        for (const category of optionsJSON) {
            for (const option of category.options) {
                const configOption = option.config as keyof typeof settings;
                settings[configOption] = Engine.ConfigDB_GetValue("user", option.config);
            }
        }


        settings = Object.assign(settings, this.getDynamicSaved());
        return settings;
    }

    async getDynamicSaved(): Promise<{ "localratings.modfilter": string | null }> {
        return { "localratings.modfilter": Engine.ConfigDB_GetValue("user", "localratings.modfilter") };
    }

    getDefault() {
        const optionsJSON: LocalRatingsOptions = Engine.ReadJSONFile("src/local-ratings/types/options.json");
        let settings: { [key: string]: string | null } = {};
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

    createDefaultSettingsIfNotExist(): { [key: string]: string | null } {
        const settings = this.getDefault();
        Object.keys(settings).filter(key => !Engine.ConfigDB_GetValue("user", key)).forEach(key => Engine.ConfigDB_CreateValue("user", key, settings[key] ?? ""));
        Engine.ConfigDB_WriteFile("user", "config/user.cfg");
        return settings;
    }

    restoreLocalDefault(): { [key: string]: string | null } {
        const settings = this.getDefault();
        for (const key of Object.keys(settings)) {
            Engine.ConfigDB_RemoveValue("user", key);
            if (!Engine.ConfigDB_GetValue("user", key)) {
                const settingsKey = key as keyof typeof settings;
                Engine.ConfigDB_CreateValue("user", key, settings[settingsKey] ?? "");
            }
        }
        Engine.ConfigDB_WriteFile("user", "config/user.cfg");
        return settings;
    }

}

export {
    LocalRatingsSettings
};
