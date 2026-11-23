
// The most frequent entry, the first one reached when counts tie. Counts are tallied once so this is
// linear: comparing two entries by filtering the whole array each time was quadratic, and a player has
// thousands of commands.
const mode = (commandArray: string[]): string => {
    const counts = new Map<string, number>();
    for (const value of commandArray)
        counts.set(value, (counts.get(value) ?? 0) + 1);

    return commandArray.reduce(
        (a: string, b: string) => (counts.get(a) ?? 0) >= (counts.get(b) ?? 0) ? a : b,
        ""
    );
};

export {
    mode
};
