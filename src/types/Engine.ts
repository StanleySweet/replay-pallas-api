import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { Database } from 'better-sqlite3'
import { ReplayMetaData } from "./ReplayMetaData";
import Path from 'path'
import { uncompressSync } from "snappy";
import { LocalRatingsMetadataContainer } from "../local-ratings/types/MetadataContainer";

class Engine {
    GetReplayMetadata(directory: string): ReplayMetaData {
        if (!this.database)
            return {} as ReplayMetaData;

        const replay = this.database.prepare('Select metadata as attribs From replays where match_id = @match_id LIMIT 1;').get({ "match_id" : directory}) as LocalRatingsMetadataContainer;
        return JSON.parse(uncompressSync(replay.attribs as any, { asBuffer: false }) as string) as ReplayMetaData;
    }
    ConfigDB_RemoveValue(section: string, key: string) {
        if(!this.database)
            return;

        this.database.prepare('Delete From local_ratings_configuration where section = @section and key = @key').run({
            "section": section,
            "key": key,
        });
    }
    GetReplays(): LocalRatingsMetadataContainer[] {
        if (!this.database)
            return [];

        const replays = this.database.prepare('Select metadata as attribs, match_id as directory  From replays;').all() as LocalRatingsMetadataContainer[] ;
        for (const element of replays)
        {
            element.attribs = JSON.parse(uncompressSync(element.attribs as any, { asBuffer: false }) as string)
            element.duration = element.attribs.settings?.MatchDuration;
        }


        for(let i = 0; i < replays.length; ++i)
        {
            const prevElem = replays[i];
            replays[i] = new LocalRatingsMetadataContainer();
            replays[i].attribs = prevElem.attribs;
            replays[i].duration = prevElem.duration;
            replays[i].directory = prevElem.directory;
        }

        return replays;
    }
    WriteJSONFile(x: string, data: any): void {
        const path = Path.dirname(x);
        if (!existsSync(path)){
            mkdirSync(path, {recursive : true});
        }

        return writeFileSync(x, JSON.stringify(data), {
            flag: "w"
        });
    }
    FileExists(x: string): boolean {
        return existsSync(x);
    }
    GetEngineInfo() {
        return {
            mods: [{
                "mod": "public",
                "version": "0.0.26"
            }]
        }
    }
    ProfileStart(arg0: string) {
        // Nothing to do there.
    }
    ProfileStop() {
        // Nothing to do there.
    }
    ReadJSONFile(fileName: string): any {
        return JSON.parse(readFileSync(fileName, { encoding: "utf-8" }));
    }

    database: Database | null;

    constructor() {
        this.database = null;
    }

    ConfigDB_CreateValue(section: string, key: string, value: string): void {
        if (this.database === null)
            return;

        const existing = this.ConfigDB_GetValue(section, key);
        if (existing != null)
            this.database.prepare('Update local_ratings_configuration Set value = $value Where key = @key and section = @section;').run({
                "section": section,
                "key": key,
                "value": value,
            });


        else {
            this.database.prepare('Insert into local_ratings_configuration (key, section, value) Values(@key, @section, @value)').run({
                "section": section,
                "key": key,
                "value": value,
            });
        }


    }

    ConfigDB_WriteFile(section: string, key: string): void {

        // Nothing to do there.
    }

    ConfigDB_GetValue(section: string, key: string): string | null {
        if (this.database === null)
            return null;

        const data = this.database.prepare('Select value From local_ratings_configuration lrc Where lrc.section = @section and lrc.key = @key LIMIT 1;').get(
            {
                "section": section,
                "key": key
            },
        ) as { value: string };

        if (!data)
            return null;

        return data.value;
    }

    SetDataBase(database: Database): void {
        this.database = database;
    }
}

const EngineInstance = new Engine();

export {
    EngineInstance
}

export type {
    Engine
}
