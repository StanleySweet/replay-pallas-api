
/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import * as translationsRaw from "./options.json";

type LocalRatingsOptions = typeof translationsRaw;
type LocalRatingsOptionsKey = keyof LocalRatingsOptions;

export type {
    LocalRatingsOptionsKey,
    LocalRatingsOptions,
};
