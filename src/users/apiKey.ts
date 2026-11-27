/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: © 2026 Stanislas Daniel Claude Dolcini
 */

import { createHash, randomBytes } from "crypto";

export const KEY_PREFIX = "rp_";

export const isApiKey = (token: string): boolean => token.startsWith(KEY_PREFIX);

// 32 random bytes: enough entropy that a plain SHA-256 is a safe thing to store, no slow hash needed.
export const newApiKey = (): string => KEY_PREFIX + randomBytes(32).toString("base64url");

export const hashApiKey = (key: string): string => createHash("sha256").update(key).digest("hex");
