/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { z } from "zod";

const UploadReplayZipResponseSchema = z.object({
    Success: z.boolean(),
    AddedReplays: z.array(z.string())
});

type UploadReplayZipResponse = z.infer<typeof UploadReplayZipResponseSchema>;

export type {
    UploadReplayZipResponse
};

export {
    UploadReplayZipResponseSchema
};
