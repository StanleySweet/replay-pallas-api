import { LocalRatingsReplay } from "../Replay";

interface LocalRatingsMinifiedReplayDatabaseElement {
    [index: number]: any
}

interface LocalRatingsReplayDatabase {
    [match_id: string]: LocalRatingsReplay
}

interface LocalRatingsMinifiedReplayDatabase {
    [match_id: string]: LocalRatingsMinifiedReplayDatabaseElement
}

export type {
    LocalRatingsMinifiedReplayDatabaseElement,
    LocalRatingsReplayDatabase,
    LocalRatingsMinifiedReplayDatabase
};
