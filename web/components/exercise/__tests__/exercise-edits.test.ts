import { describe, expect, it } from "vitest";
import { mergeExerciseEdits } from "@/components/exercise/exercise-edits";
import { MuscleGroup } from "@/lib/models/muscles";
import type { Exercise } from "@/lib/models/types";

const opened = {
  id: "row-fp", name: "Tirage vertical", repTargetMin: 8, repTargetMax: 12, muscleMappings: [], profileSource: null,
} as unknown as Exercise;

describe("éditeur d'exercice : seules les modifications d'Evan partent", () => {
  it("garde les muscles que Barbis a posés pendant que l'éditeur était ouvert", () => {
    const latest = { ...opened, muscleMappings: [{ muscleGroup: MuscleGroup.latInf, coefficient: 1 }], profileSource: "barbis" } as unknown as Exercise;
    const draft = { ...opened, repTargetMax: 15 };
    const merged = mergeExerciseEdits(opened, draft, latest);
    expect(merged.repTargetMax).toBe(15);
    expect(merged.muscleMappings).toEqual(latest.muscleMappings);
    expect(merged.profileSource).toBe("barbis");
  });

  it("un champ modifié à la main l'emporte sur la version à jour", () => {
    const latest = { ...opened, name: "Tirage vertical (Barbis)" } as Exercise;
    const draft = { ...opened, name: "Tirage poitrine" };
    expect(mergeExerciseEdits(opened, draft, latest).name).toBe("Tirage poitrine");
  });
});
