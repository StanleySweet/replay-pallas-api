/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2026 Stanislas Daniel Claude Dolcini
 */

import * as jose from "jose";
import { JOSE_ALG, JOSE_SECRET } from "../project_globals";
import { PallasTokenPayload } from "../types/PallasToken";

export const COOKIE = "pallas_token";
export const TOKEN_SECONDS = 7200;

// The sites allowed to call the API from a browser, with their cookie. Scripts send no Origin and are not
// concerned. A named list, because a browser refuses "*" together with cookies.
export const allowedOrigins = (): string[] =>
    (process.env.CORS_ORIGINS ?? "https://replay-pallas.wildfiregames.ovh,http://localhost:5173").split(",").map(origin => origin.trim()).filter(Boolean);

export const issueToken = (payload: PallasTokenPayload): Promise<string> => new jose.SignJWT(payload)
    .setProtectedHeader({ alg: JOSE_ALG })
    .setIssuedAt()
    .setIssuer("https://replay-pallas-api.wildfiregames.ovh")
    .setAudience("https://replay-pallas-api.wildfiregames.ovh")
    .setExpirationTime(`${TOKEN_SECONDS}s`)
    .sign(JOSE_SECRET);

// HttpOnly: script on the page cannot read it. SameSite=Lax: other sites cannot make the browser send it
// on a cross-site POST. The site and the API are the same site (wildfiregames.ovh), so Lax still sends it.
const ATTRIBUTES = "HttpOnly; Secure; SameSite=Lax; Path=/";
export const sessionCookie = (jwt: string): string => `${COOKIE}=${jwt}; ${ATTRIBUTES}; Max-Age=${TOKEN_SECONDS}`;
export const clearedCookie = (): string => `${COOKIE}=; ${ATTRIBUTES}; Max-Age=0`;

export const cookieToken = (header: string | undefined): string | undefined =>
    header?.split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || undefined;
