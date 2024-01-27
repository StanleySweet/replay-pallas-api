/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { z } from "zod";
import EUserRole from "../enumerations/EUserRole";

const PallasUserTokenSchema = z.object({
    role: z.nativeEnum(EUserRole),
    token: z.string(),
    id: z.number(),
    nick: z.string(),
    expires_in: z.number()
})

const PallasTokenPayloadSchema = z.object({
    role: z.nativeEnum(EUserRole),
    nick: z.string(),
    id: z.number()
})


type PallasUserToken = z.infer<typeof PallasUserTokenSchema>;
type PallasTokenPayload = z.infer<typeof PallasTokenPayloadSchema>;

declare module 'fastify' {
    interface FastifyRequest {
        claims: PallasTokenPayload
    }
}

export type { PallasUserToken, PallasTokenPayload }
export { PallasUserTokenSchema, PallasTokenPayloadSchema }
