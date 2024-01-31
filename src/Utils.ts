
const mode = (commandArray: string[]): string =>
commandArray.reduce(
    (a, b: string, _: number, arr: string[]) =>
        arr.filter((v: string) => v === a).length >=
            arr.filter((v) => v === b).length
            ? a
            : b,
    ""
);

export {
    mode
};
