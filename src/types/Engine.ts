import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { Database, Statement } from 'better-sqlite3';
import { ReplayMetaData } from "./ReplayMetaData";
import Path from 'path';
import { uncompressSync } from "snappy";
import { LocalRatingsMetadataContainer } from "../local-ratings/types/MetadataContainer";

class Engine {
    GetReplayMetadata(directory: string): ReplayMetaData {
        if (!this.database)
            return {} as ReplayMetaData;

        const replay = this.database.prepare('Select metadata as attribs From replays where match_id = @match_id LIMIT 1;').get({ "match_id": directory }) as LocalRatingsMetadataContainer;
        return JSON.parse(uncompressSync(replay.attribs as string, { asBuffer: false }) as string) as ReplayMetaData;
    }
    ConfigDB_RemoveValue(section: string, key: string) {
        if (!this.database)
            return;

        this.database.prepare('Delete From local_ratings_configuration where section = @section and key = @key').run({
            "section": section,
            "key": key,
        });
    }

    ParseReplays(replays: LocalRatingsMetadataContainer[]){

        for (let i = 0; i < replays.length; ++i) {
            const element = replays[i];
            replays[i] = new LocalRatingsMetadataContainer();
            replays[i].attribs = JSON.parse(uncompressSync(element.attribs as string, { asBuffer: false }) as string);
            replays[i].directory = element.directory;
        }

        return replays;
    }

    GetNewReplays(existingIds: string[], batchSize: number, offset: number): LocalRatingsMetadataContainer[] {
        if (!this.database)
            return [];

        // The known ids used to be glued into the SQL as a literal NOT IN list. match_id comes
        // from uploaded replay metadata, so one upload whose matchID contains a quote produced
        // invalid SQL here and threw. Because update() runs on the boot path, that single upload
        // broke every subsequent start. A temp table avoids both the injection and the SQLite
        // host-parameter ceiling.
        //
        // better-sqlite3 prepares eagerly and rejects a statement against a table that does not
        // exist yet, so the staging table has to be created before the statements touching it
        // are prepared. They are then cached: update() calls this once per batch, and
        // re-preparing all four on every call is pure overhead.
        if (!this.stagingStatements) {
            this.database.exec("CREATE TEMP TABLE IF NOT EXISTS known_match_ids (match_id TEXT PRIMARY KEY);");
            this.stagingStatements = {
                clear: this.database.prepare("DELETE FROM known_match_ids;"),
                insert: this.database.prepare("INSERT OR IGNORE INTO known_match_ids (match_id) VALUES (?);"),
                select: this.database.prepare(`
                    SELECT metadata as attribs, match_id as directory
                    FROM replays
                    WHERE match_id NOT IN (SELECT match_id FROM known_match_ids)
                    LIMIT @batchSize
                    OFFSET @offset;
                `)
            };
        }

        const { clear, insert, select } = this.stagingStatements;
        const fill = this.database.transaction((ids: string[]) => {
            clear.run();
            for (const id of ids)
                insert.run(id);
        });

        fill(existingIds);

        const replays = select.all({ "batchSize": batchSize, "offset": offset }) as LocalRatingsMetadataContainer[];

        // Left empty on purpose: the table is scratch space, and anything left behind would
        // silently hide replays from the next call.
        clear.run();
        return this.ParseReplays(replays);
    }

    GetReplays(batchSize: number, offset: number): LocalRatingsMetadataContainer[] {
        if (!this.database)
            return [];

        // Adjust the SQL query to include LIMIT and OFFSET
        const query = `
            SELECT metadata as attribs, match_id as directory 
            FROM replays 
            LIMIT @batchSize 
            OFFSET @offset;
        `;
        
        const replays = this.database.prepare(query).all({ "batchSize": batchSize, "offset": offset }) as LocalRatingsMetadataContainer[];
        return this.ParseReplays(replays);  
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

    // Lazily built by GetNewReplays. Held on the instance because it is bound to whichever
    // database was last passed to SetDataBase; SetDataBase drops it.
    private stagingStatements: {
        clear: Statement,
        insert: Statement,
        select: Statement
    } | null = null;

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
        // The cached statements belong to the previous connection's temp schema.
        this.stagingStatements = null;
    }
}

const EngineInstance = new Engine();

export {
    EngineInstance
};

export type {
    Engine
};
