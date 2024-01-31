/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2022 Stanislas Daniel Claude Dolcini
 */

import { z } from "zod";
import EUserRole from "../enumerations/EUserRole";
import { FastifyRequest } from "fastify";
import { ReplaysSchema } from "./Replay";

const AddUserSchema = z.object({
    "password": z.string(),
    "email": z.string(),
    "nick": z.string(),
});

const UserSchema = z.object({
    "id": z.number(),
    "nick": z.string(),
    "role": z.nativeEnum(EUserRole),
})

const LatestUserSchema = z.object({
    "id": z.number(),
    "nick": z.string(),
    "role": z.nativeEnum(EUserRole),
    "creation_date": z.date()
})

const GlickoEloSchema = z.object({
    elo: z.number(),
    deviation: z.number(),
    volatility: z.number(),
    preview_deviation: z.number(),
    date: z.string(),
})

const SeriesDataSchema  = z.object({
    x: z.string(),
    y: z.number(),
});

const EloGraphDataSchema = z.object({
    "current_game_elo" : z.number().optional(),
    "current_glicko_elo" : GlickoEloSchema.optional(),
    "glicko_series": z.array(SeriesDataSchema),
    "glicko_series_avg": z.array(SeriesDataSchema),
    "game_series": z.array(SeriesDataSchema),
    "game_series_avg": z.array(SeriesDataSchema)
});

type EloGraph = z.infer<typeof EloGraphDataSchema>;

const UserDetailSchema = z.object({
    "id": z.number(),
    "nick": z.string(),
    "role": z.nativeEnum(EUserRole),
    "creation_date": z.date(),
    "AverageCPM": z.number(),
    "WinRateRatio": z.number(),
    "TotalPlayedTime": z.number(),
    "SecondMostUsedCmd": z.string(),
    "MostUsedCmd": z.string(),
    "MatchCount": z.number(),
    "replays": ReplaysSchema,
    "graph": EloGraphDataSchema.optional()
});

const UsersSchema = z.array(UserSchema);
const LatestUsersSchema = z.array(LatestUserSchema);

type User = z.infer<typeof UserSchema>;
type LatestUser = z.infer<typeof LatestUserSchema>;
type AddUser = z.infer<typeof AddUserSchema>;
type UserDetail = z.infer<typeof UserDetailSchema>;
type AddUserRequest = FastifyRequest<{ Body: AddUser }>;
type LoginUserRequest = FastifyRequest<{
    Body: {
        email: string,
        password: string
    }
}>;

type GetUserByIdRequest = FastifyRequest<{ Params: { id: number } }>;
type SetPermissionsRequest = FastifyRequest<{ Body: { id: number, role: EUserRole } }>;
type DeleteUserByIdRequest = FastifyRequest<{ Params: { id: number } }>;
type GlickoElo = z.infer<typeof GlickoEloSchema>;

export type { User, GlickoElo, EloGraph, AddUser, AddUserRequest, SetPermissionsRequest, LatestUser, LoginUserRequest, GetUserByIdRequest, DeleteUserByIdRequest, UserDetail }
export { UserSchema, UsersSchema, AddUserSchema, LatestUserSchema, LatestUsersSchema, UserDetailSchema }
