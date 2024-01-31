/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { z } from "zod";

const UploadReplayCommandsResponseSchema = z.object({
    Success: z.boolean(),
    AddedReplay: z.nullable(z.string())
});

type UploadReplayCommandsResponse = z.infer<typeof UploadReplayCommandsResponseSchema>;

export type {
    UploadReplayCommandsResponse
};

export {
    UploadReplayCommandsResponseSchema
};
