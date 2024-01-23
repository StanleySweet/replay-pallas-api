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
    "replays": ReplaysSchema
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

export type { User, AddUser, AddUserRequest, SetPermissionsRequest, LatestUser, LoginUserRequest, GetUserByIdRequest, DeleteUserByIdRequest, UserDetail }
export { UserSchema, UsersSchema, AddUserSchema, LatestUserSchema, LatestUsersSchema, UserDetailSchema }
