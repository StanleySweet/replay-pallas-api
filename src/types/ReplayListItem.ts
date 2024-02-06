/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { z } from "zod";

const ReplayListItemSchema = z.object({
    "mapName": z.string(),
    "playerNames": z.array(z.string()),
    "civs": z.array(z.string()),
    "machId": z.string(),
    "date": z.string()
});

const ReplayListItemsSchema = z.array(ReplayListItemSchema);
type ReplayListItem = z.infer<typeof ReplayListItemSchema>;
type ReplayListItems = z.infer<typeof ReplayListItemsSchema>;

export {
    ReplayListItemSchema, ReplayListItemsSchema
};

export type {
    ReplayListItem, ReplayListItems
};