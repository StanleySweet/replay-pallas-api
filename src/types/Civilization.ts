import { z } from "zod";

const CivilizationSchema = z.object({
    key: z.string(),
    emblem_key: z.string()
});

const CivilizationsSchema = z.array(CivilizationSchema);

type Civilization = z.infer<typeof CivilizationSchema>;
type Civilizations = z.infer<typeof CivilizationsSchema>;

export type {
    Civilization, Civilizations
};

export {
    CivilizationSchema, CivilizationsSchema
};
