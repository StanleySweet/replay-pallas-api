export interface PlayerStatistics {
    id: number;
    total_played_time: number;
    match_count: number;
    second_most_used_cmd: string;
    most_used_cmd: string;
    win_rate_ratio: number;
    average_cpm: number;
    modification_date: Date;
    creation_date: Date;
}
