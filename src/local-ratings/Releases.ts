/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: © 2024 Stanislas Daniel Claude Dolcini
 */

import { LocalRatingsCache } from "./Cache";
import { LocalRatingsMinifier } from "./Minifier";
import { LocalRatingsRatingsDB } from "./RatingsDB";
import { LocalRatingsReplayDB } from "./ReplayDB";
import { LocalRatingsReplayDatabase } from "./types/ReplayDatabase";
import { ReplayRepository } from "../repositories/ReplayRepository";
import { logger } from "../logger";

// The local ratings computed over the replays of one 0 A.D. release at a time, next to the set over
// every replay that LocalRatingsRatingsDB holds on its own. Each release has its own ratings and
// history, stored under its release number as the scope of the cache tables (migration 016).
class LocalRatingsReleases {
    byRelease: Map<number, LocalRatingsRatingsDB> = new Map();

    constructor(
        private readonly cache: LocalRatingsCache,
        private readonly minifier: LocalRatingsMinifier,
        private readonly replays: ReplayRepository,
        private readonly replayDb: LocalRatingsReplayDB,
    ) { }

    get(release: number): LocalRatingsRatingsDB | undefined {
        return this.byRelease.get(release);
    }

    // Replays whose release is not known (0) are in the set over every replay and in no other.
    private releaseOfEachMatch(): Map<string, number> {
        return this.replays.releaseByMatchId();
    }

    private create(release: number, releases: Map<string, number>): LocalRatingsRatingsDB {
        const ratings = new LocalRatingsRatingsDB(this.cache, this.minifier, release);
        ratings.keep = (matchId: string) => releases.get(matchId) === release;
        return ratings;
    }

    // Loads the sets already stored and computes the ones that are missing, which is what happens on
    // the first start after migration 016. It needs no replay to be parsed again: it reads the replay cache.
    load(): void {
        const releases = this.releaseOfEachMatch();
        this.byRelease.clear();
        for (const release of new Set([...releases.values()].filter(value => value > 0))) {
            const ratings = this.create(release, releases);
            ratings.load();
            if (Object.keys(ratings.ratingsDatabase).length === 0)
                ratings.rebuild(this.replayDb.replayDatabase);
            this.byRelease.set(release, ratings);
        }
        logger.info(`Local ratings are available for ${this.byRelease.size} release(s).`);
    }

    // Recomputes every release from the replay cache.
    rebuild(): void {
        const releases = this.releaseOfEachMatch();
        const present = new Set([...releases.values()].filter(value => value > 0));
        for (const release of [...this.byRelease.keys()].filter(value => !present.has(value)))
            this.byRelease.delete(release);

        for (const release of present) {
            const ratings = this.byRelease.get(release) ?? this.create(release, releases);
            ratings.keep = (matchId: string) => releases.get(matchId) === release;
            ratings.rebuild(this.replayDb.replayDatabase);
            this.byRelease.set(release, ratings);
        }
    }

    // New replays go to the set of their own release only.
    merge(newReplays: LocalRatingsReplayDatabase): void {
        if (Object.keys(newReplays).length === 0)
            return;

        const releases = this.releaseOfEachMatch();
        for (const release of new Set(Object.keys(newReplays).map(matchId => releases.get(matchId) ?? 0))) {
            if (release === 0)
                continue;

            let ratings = this.byRelease.get(release);
            if (!ratings) {
                ratings = this.create(release, releases);
                this.byRelease.set(release, ratings);
            }
            ratings.keep = (matchId: string) => releases.get(matchId) === release;
            ratings.load();
            ratings.merge(newReplays);
            ratings.save();
        }
    }
}

export { LocalRatingsReleases };
