import { EngineInstance as Engine } from "../types/Engine";

/**
 * This class is responsible for reading the user-defined evolution chart options from the user.cfg configuraton file.
 */
class LocalRatingsEvolutionChartOptions {
    "showzero": boolean;
    "showcurrent": boolean;
    "showevolution": boolean;
    "showperformance": boolean;
    "showmarker": boolean;
    "colorzero": string;
    "colorcurrent": string;
    "colorevolution": string;
    "colorperformance": string;
    "colormarker": string;

    constructor() {
        this.showzero = this.getShowZero();
        this.showcurrent = this.getShowCurrent();
        this.showevolution = this.getShowEvolution();
        this.showperformance = this.getShowPerformance();
        this.showmarker = this.getShowMarker();
        this.colorzero = this.getColorZero();
        this.colorcurrent = this.getColorCurrent();
        this.colorevolution = this.getColorEvolution();
        this.colorperformance = this.getColorPerformance();
        this.colormarker = this.getColorMarker();
    }

    getShowZero() {
        const showZeroValue = Engine.ConfigDB_GetValue("user", "localratings.charts.showzero");
        const showZeroValueBoolean = (showZeroValue === "true");
        return showZeroValueBoolean;
    }

    getShowCurrent() {
        const showCurrentValue = Engine.ConfigDB_GetValue("user", "localratings.charts.showcurrent");
        const showCurrentValueBoolean = (showCurrentValue === "true");
        return showCurrentValueBoolean;
    }

    getShowEvolution() {
        const showEvolutionValue = Engine.ConfigDB_GetValue("user", "localratings.charts.showevolution");
        const showEvolutionValueBoolean = (showEvolutionValue === "true");
        return showEvolutionValueBoolean;
    }

    getShowPerformance() {
        const showPerformanceValue = Engine.ConfigDB_GetValue("user", "localratings.charts.showperformance");
        const showPerformanceValueBoolean = (showPerformanceValue === "true");
        return showPerformanceValueBoolean;
    }

    getShowMarker() {
        const showMarkerValue = Engine.ConfigDB_GetValue("user", "localratings.charts.showmarker");
        const showMarkerValueBoolean = (showMarkerValue === "true");
        return showMarkerValueBoolean;
    }

    getColorZero() {
        const colorZeroValue = Engine.ConfigDB_GetValue("user", "localratings.charts.colorzero");
        const colorZeroValueColor = colorZeroValue + " 255";
        return colorZeroValueColor;
    }

    getColorCurrent() {
        const colorCurrentValue = Engine.ConfigDB_GetValue("user", "localratings.charts.colorcurrent");
        const colorCurrentValueColor = colorCurrentValue + " 255";
        return colorCurrentValueColor;
    }

    getColorEvolution() {
        const colorEvolutionValue = Engine.ConfigDB_GetValue("user", "localratings.charts.colorevolution");
        const colorEvolutionValueColor = colorEvolutionValue + " 255";
        return colorEvolutionValueColor;
    }

    getColorPerformance() {
        const colorPerformanceValue = Engine.ConfigDB_GetValue("user", "localratings.charts.colorperformance");
        const colorPerformanceValueColor = colorPerformanceValue + " 255";
        return colorPerformanceValueColor;
    }

    getColorMarker() {
        const colorMarkerValue = Engine.ConfigDB_GetValue("user", "localratings.charts.colormarker");
        const colorMarkerValueColor = colorMarkerValue + " 255";
        return colorMarkerValueColor;
    }

}

export {
    LocalRatingsEvolutionChartOptions
};
