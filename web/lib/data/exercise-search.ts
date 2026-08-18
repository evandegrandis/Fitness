/**
 * Recherche d'exercices tolérante.
 *
 * Le filtre précédent faisait `name.toLowerCase().includes(query)` : il fallait connaître le nom
 * exact du catalogue. « élévation » ou « épaule » ne trouvaient pas « Lateral raises », alors que
 * c'est exactement ce qu'on tape en salle.
 *
 * Trois niveaux de tolérance, tous nécessaires :
 *  - accents et casse ignorés (« developpe » trouve « Développé ») ;
 *  - synonymes FR/EN par exercice (« élévation latérale » → Lateral raises) ;
 *  - recherche par muscle et par catégorie (« épaule » remonte tout le travail de deltoïdes).
 */

import { LEAF_TO_PARENT, parentShortName, type MuscleGroup } from "@/lib/models/muscles";
import type { Exercise } from "@/lib/models/types";

/** Minuscules sans accents ni ponctuation, pour comparer ce qui est tapé à ce qui est stocké. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Synonymes par mot-clé du nom d'exercice. Chaque entrée associe un fragment de nom aux termes
 * qu'on tape naturellement pour le chercher, dans les deux langues.
 */
const SYNONYMS: { match: string; terms: string[] }[] = [
  { match: "lateral raise", terms: ["elevation laterale", "elevations laterales", "side raise", "oiseau lateral", "moyen deltoide"] },
  { match: "rear delt", terms: ["oiseau", "elevation posterieure", "arriere epaule", "deltoide posterieur"] },
  { match: "front raise", terms: ["elevation frontale", "elevation avant"] },
  { match: "elevations frontales", terms: ["front raise", "elevation avant"] },
  { match: "shoulder press", terms: ["developpe militaire", "developpe epaules", "overhead press"] },
  { match: "developpe militaire", terms: ["shoulder press", "overhead press", "developpe epaules"] },
  { match: "chest press", terms: ["developpe couche machine", "presse pectoraux"] },
  { match: "developpe couche", terms: ["bench press", "presse pectoraux"] },
  { match: "developpe incline", terms: ["incline press", "incline bench"] },
  { match: "pec deck", terms: ["butterfly", "ecarte machine", "papillon"] },
  { match: "poulie vis a vis", terms: ["cable crossover", "ecarte poulie", "crossover"] },
  { match: "tirage vertical", terms: ["lat pulldown", "poulie haute", "sellette", "traction assistee"] },
  { match: "tirage horizontal", terms: ["seated row", "rowing poulie", "rowing assis"] },
  { match: "rowing", terms: ["row", "tirage horizontal"] },
  { match: "pulley", terms: ["poulie", "seated row"] },
  { match: "traction", terms: ["pull up", "pullup", "traction barre"] },
  { match: "curl", terms: ["biceps", "flexion bras"] },
  { match: "extension triceps", terms: ["triceps", "pushdown", "barre au front"] },
  { match: "dips", terms: ["repulsion", "triceps"] },
  { match: "presse a cuisses", terms: ["leg press", "presse jambes"] },
  { match: "leg extension", terms: ["extension jambes", "quadriceps machine"] },
  { match: "leg curl", terms: ["ischios machine", "flexion jambes"] },
  { match: "squat", terms: ["accroupissement", "cuisses"] },
  { match: "souleve de terre", terms: ["deadlift", "rdl", "romanian"] },
  { match: "fentes", terms: ["lunge", "fente"] },
  { match: "mollets", terms: ["calf", "calf raise", "gastrocnemien"] },
  { match: "abducteurs", terms: ["abduction", "moyen fessier machine"] },
  { match: "adducteurs", terms: ["adduction", "interieur cuisses"] },
  { match: "crunch", terms: ["abdos", "abdominaux"] },
  { match: "planche", terms: ["gainage", "plank"] },
  { match: "rotations russes", terms: ["russian twist", "obliques"] },
  { match: "ab roller", terms: ["roue abdominale", "gainage"] },
  { match: "releve de jambes", terms: ["leg raise", "abdos bas"] },
  { match: "haussements", terms: ["shrug", "trapezes"] },
  { match: "face pull", terms: ["tirage visage", "arriere epaule"] },
  { match: "pull over", terms: ["pullover", "grand dorsal"] },
  { match: "hspu", terms: ["handstand", "pompes verticales", "epaules"] },
  { match: "wrist curl", terms: ["avant bras", "poignets"] },
];

/** Tous les termes sous lesquels un exercice doit pouvoir être trouvé. */
export function searchTermsFor(exercise: Exercise): string[] {
  const name = normalizeSearch(exercise.name);
  const terms = [name, normalizeSearch(exercise.category)];

  for (const entry of SYNONYMS) {
    if (name.includes(entry.match)) terms.push(...entry.terms.map(normalizeSearch));
  }

  // Muscles travaillés : « épaule » doit remonter tout ce qui sollicite les deltoïdes, même si
  // le mot n'apparaît nulle part dans le nom.
  for (const mapping of exercise.muscleMappings) {
    const parent = LEAF_TO_PARENT[mapping.muscleGroup as MuscleGroup];
    if (!parent) continue;
    // La CLÉ du groupe (« deltoides ») autant que son libellé court (« Delts ») : les alias
    // ci-dessous pointent sur la clé, et le libellé seul ne suffirait pas à les résoudre.
    terms.push(normalizeSearch(parent), normalizeSearch(parentShortName[parent]));
  }

  return terms.filter(Boolean);
}

const MUSCLE_ALIASES: Record<string, string[]> = {
  epaule: ["deltoides"],
  epaules: ["deltoides"],
  delto: ["deltoides"],
  dos: ["dos haut", "grand dorsal"],
  pecs: ["pectoraux"],
  pec: ["pectoraux"],
  bras: ["biceps", "triceps"],
  jambes: ["quads", "ischios", "fessiers"],
  cuisses: ["quads"],
  fessier: ["fessiers"],
  abdos: ["abs", "obliques"],
};

/** Un exercice correspond-il à la requête ? */
export function matchesSearch(exercise: Exercise, rawQuery: string): boolean {
  const query = normalizeSearch(rawQuery);
  if (query === "") return true;

  const terms = searchTermsFor(exercise);
  const expanded = [query, ...(MUSCLE_ALIASES[query]?.map(normalizeSearch) ?? [])];

  // Chaque mot tapé doit être trouvé quelque part : « curl incline » ne remonte pas tous les curls.
  return query
    .split(" ")
    .filter(Boolean)
    .every((word) =>
      expanded.some((alias) => alias !== query && terms.some((term) => term.includes(alias))) ||
      terms.some((term) => term.includes(word))
    );
}
