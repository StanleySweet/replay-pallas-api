import { EngineInstance as Engine } from "../types/Engine";

/**
 * This class is responsible for reading the user-defined distribution chart options from the
 * local ratings configuration storage.
 */
class LocalRatingsDistributionChartOptions {
    colorbinleft: string;
    colorbinright: string;
    colorcurrentbin: string;
    histogrambins: number;
    showmean: boolean;

    constructor() {
        this.colorbinleft = this.getColorBinLeft();
        this.colorbinright = this.getColorBinRight();
        this.colorcurrentbin = this.getColorCurrentBin();
        this.histogrambins = this.getHistogramBins();
        this.showmean = this.getShowMean();
    }

    getColorBinLeft() {
        const colorBinLeftValue = Engine.ConfigDB_GetValue("user", "localratings.distribution.colorleft");
        return (colorBinLeftValue ?? "100 100 140") + " 255";
    }

    getColorBinRight() {
        const colorBinRightValue = Engine.ConfigDB_GetValue("user", "localratings.distribution.colorright");
        return (colorBinRightValue ?? "100 140 100") + " 255";
    }

    getColorCurrentBin() {
        const colorCurrentBinValue = Engine.ConfigDB_GetValue("user", "localratings.distribution.colorcurrent");
        return (colorCurrentBinValue ?? "200 180 0") + " 255";
    }

    getHistogramBins() {
        const histogramBinsValue = Engine.ConfigDB_GetValue("user", "localratings.distribution.bins");
        return Number.parseInt(histogramBinsValue ?? "20", 10);
    }

    getShowMean() {
        const showMeanValue = Engine.ConfigDB_GetValue("user", "localratings.distribution.showmean");
        return showMeanValue === null ? true : showMeanValue === "true";
    }
}

export {
    LocalRatingsDistributionChartOptions
};
