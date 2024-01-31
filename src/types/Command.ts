import { z } from "zod";

const CommandSchema = z.object({
    type: z.string()
});

type Command = z.infer<typeof CommandSchema>;

export type {
    Command
};

export {
    CommandSchema
};
