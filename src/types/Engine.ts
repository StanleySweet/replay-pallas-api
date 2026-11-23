import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { Database } from 'better-sqlite3';
import { ReplayRepository } from '../repositories/ReplayRepository';
import { ConfigRepository } from '../repositories/ConfigRepository';
import { ReplayMetaData } from "./ReplayMetaData";
import Path from 'path';
import { unpackBlob } from "../replays/blobCodec";
import { LocalRatingsMetadataContainer } from "../local-ratings/types/MetadataContainer";

class Engine {
    GetReplayMetadata(directory: string): ReplayMetaData {
        const blob = this.replays?.metadataOf(directory);
        return (blob === undefined ? {} : JSON.parse(unpackBlob(blob))) as ReplayMetaData;
    }
    ConfigDB_RemoveValue(section: string, key: string) {
        this.config?.remove(section, key);
    }

    ParseReplays(replays: LocalRatingsMetadataContainer[]){

        for (let i = 0; i < replays.length; ++i) {
            const element = replays[i];
            replays[i] = new LocalRatingsMetadataContainer();
            replays[i].attribs = JSON.parse(unpackBlob(element.attribs as string));
            replays[i].directory = element.directory;
        }

        return replays;
    }

    GetNewReplays(existingIds: string[], batchSize: number, offset: number): LocalRatingsMetadataContainer[] {
        if (!this.replays)
            return [];

        return this.ParseReplays(this.replays.newMetadataPage(existingIds, batchSize, offset) as unknown as LocalRatingsMetadataContainer[]);
    }

    GetReplays(batchSize: number, offset: number): LocalRatingsMetadataContainer[] {
        if (!this.replays)
            return [];

        return this.ParseReplays(this.replays.metadataPage(batchSize, offset) as unknown as LocalRatingsMetadataContainer[]);
    }

    WriteJSONFile(x: string, data: unknown): void {
        const path = Path.dirname(x);
        if (!existsSync(path)) {
            mkdirSync(path, { recursive: true });
        }

        return writeFileSync(x, JSON.stringify(data), {
            flag: "w"
        });
    }
    FileExists(x: string): boolean {
        return existsSync(x);
    }
    ReadJSONFile(fileName: string): unknown {
        return JSON.parse(readFileSync(fileName, { encoding: "utf-8" }));
    }

    database: Database | null;

    // The repositories of the connection given to SetDataBase. A new connection gets new ones, so no
    // prepared statement outlives the connection it belongs to.
    private replays: ReplayRepository | null = null;
    private config: ConfigRepository | null = null;

    constructor() {
        this.database = null;
    }

    ConfigDB_CreateValue(section: string, key: string, value: string): void {
        this.config?.set(section, key, value);
    }

    ConfigDB_GetValue(section: string, key: string): string | null {
        return this.config?.get(section, key) ?? null;
    }

    SetDataBase(database: Database): void {
        this.database = database;
        this.replays = new ReplayRepository(database);
        this.config = new ConfigRepository(database);
    }
}

const EngineInstance = new Engine();

export {
    EngineInstance
};

export type {
    Engine
};
