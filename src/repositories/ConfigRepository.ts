/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { Database } from "better-sqlite3";

// The local ratings settings and the cache version: local_ratings_configuration (migrations/004),
// one value per section and key.
class ConfigRepository {
    constructor(private readonly db: Database) { }

    get(section: string, key: string): string | null {
        const row = this.db.prepare('Select value From local_ratings_configuration lrc Where lrc.section = @section and lrc.key = @key LIMIT 1;').get({ section, key }) as { value: string } | undefined;
        return row ? row.value : null;
    }

    set(section: string, key: string, value: string): void {
        if (this.get(section, key) !== null)
            this.db.prepare('Update local_ratings_configuration Set value = @value Where key = @key and section = @section;').run({ section, key, value });
        else
            this.db.prepare('Insert into local_ratings_configuration (key, section, value) Values(@key, @section, @value)').run({ section, key, value });
    }

    remove(section: string, key: string): void {
        this.db.prepare('Delete From local_ratings_configuration where section = @section and key = @key').run({ section, key });
    }
}

export { ConfigRepository };
