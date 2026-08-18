/**
 * Ajoute au catalogue les machines et mouvements les plus courants des salles françaises.
 *
 * LECTURE SEULE par défaut. Écriture : APPLY_PROD_CATALOG_SEED=ep-mute-sunset-atqb5xkv
 *
 * Choix assumés :
 *  - Aucun `strengthStandardKey` : les barèmes externes sont calibrés sur des barres et haltères.
 *    Sur une machine guidée, la charge affichée dépend du bras de levier, donc 60 kg sur l'une ne
 *    valent pas 60 kg sur l'autre. Un niveau faux serait pire que pas de niveau.
 *  - Les mappings musculaires sont renseignés : sans eux, l'exercice ne compterait pour aucun
 *    objectif hebdomadaire, ce qui fausserait la couverture en silence.
 *  - Purement additif et idempotent (clé = nom) : rejouer le script ne duplique rien et ne touche
 *    à aucun exercice existant.
 *
 * Ces exercices n'apparaissent PAS dans l'onglet Progrès tant qu'ils n'ont pas été pratiqués :
 * cette liste se construit depuis l'historique, pas depuis le catalogue.
 */

import "dotenv/config";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { assertExactProductionDatabase, databaseHostname, PRODUCTION_MIGRATION_CONFIRMATION } from "./_safety";

const SCRIPT_NAME = "seed-catalog-2026-08-18";
const APPLY_ENV = "APPLY_PROD_CATALOG_SEED";
const APPLY = process.env[APPLY_ENV] !== undefined;

function stableId(key: string): string {
  const bytes = Buffer.from(createHash("sha256").update(`jeera:${key}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type Spec = {
  name: string;
  category: "Pull" | "Push" | "Legs" | "Core";
  mode: "straight" | "bodyweight" | "weighted_bodyweight";
  repMin: number;
  repMax: number;
  increment: number;
  fatigue: "heavy" | "medium" | "light";
  pattern: string | null;
  rest: number;
  notes?: string;
  muscles: [string, number][];
};

const CATALOG: Spec[] = [
  // -- Dos ------------------------------------------------------------------
  { name: "Tirage vertical prise large", category: "Pull", mode: "straight", repMin: 8, repMax: 12, increment: 5,
    fatigue: "medium", pattern: "vertical_pull", rest: 120,
    muscles: [["lat_sup", 1], ["lat_inf", 0.7], ["rhomboides", 0.4], ["trap_mid", 0.4], ["biceps_long", 0.3], ["bracchial", 0.3]] },
  { name: "Tirage vertical supination", category: "Pull", mode: "straight", repMin: 8, repMax: 12, increment: 5,
    fatigue: "medium", pattern: "vertical_pull", rest: 120,
    muscles: [["lat_inf", 1], ["lat_sup", 0.7], ["biceps_long", 0.5], ["biceps_court", 0.5], ["bracchial", 0.3]] },
  { name: "Tirage horizontal poulie basse", category: "Pull", mode: "straight", repMin: 8, repMax: 12, increment: 5,
    fatigue: "medium", pattern: "horizontal_pull", rest: 120,
    muscles: [["rhomboides", 1], ["trap_mid", 1], ["lat_inf", 0.6], ["delt_post", 0.4], ["biceps_long", 0.3]] },
  { name: "Rowing machine assis", category: "Pull", mode: "straight", repMin: 8, repMax: 12, increment: 5,
    fatigue: "medium", pattern: "horizontal_pull", rest: 120,
    muscles: [["rhomboides", 1], ["trap_mid", 1], ["lat_inf", 0.6], ["delt_post", 0.4]] },
  { name: "Pull-over poulie haute", category: "Pull", mode: "straight", repMin: 10, repMax: 15, increment: 2.5,
    fatigue: "light", pattern: "isolation", rest: 90,
    notes: "Bras tendus, coude verrouillé.",
    muscles: [["lat_sup", 1], ["lat_inf", 0.8], ["trap_inf", 0.3]] },
  { name: "Haussements d'épaules", category: "Pull", mode: "straight", repMin: 10, repMax: 15, increment: 2.5,
    fatigue: "light", pattern: "isolation", rest: 90,
    muscles: [["trap_sup", 1], ["trap_mid", 0.4]] },
  { name: "Rowing barre", category: "Pull", mode: "straight", repMin: 6, repMax: 10, increment: 2.5,
    fatigue: "heavy", pattern: "horizontal_pull", rest: 150,
    muscles: [["lat_inf", 1], ["rhomboides", 0.8], ["trap_mid", 0.8], ["delt_post", 0.4], ["extenseurs", 0.4]] },

  // -- Pectoraux ------------------------------------------------------------
  { name: "Développé couché barre", category: "Push", mode: "straight", repMin: 5, repMax: 10, increment: 2.5,
    fatigue: "heavy", pattern: "horizontal_press", rest: 180,
    muscles: [["pect_stern", 1], ["pect_clav", 0.7], ["delt_ant", 0.5], ["triceps_lat", 0.5], ["triceps_med", 0.5], ["triceps_long", 0.3]] },
  { name: "Développé couché haltères", category: "Push", mode: "straight", repMin: 6, repMax: 12, increment: 2,
    fatigue: "heavy", pattern: "horizontal_press", rest: 150,
    muscles: [["pect_stern", 1], ["pect_clav", 0.7], ["delt_ant", 0.5], ["triceps_lat", 0.4], ["triceps_med", 0.4]] },
  { name: "Poulie vis-à-vis", category: "Push", mode: "straight", repMin: 10, repMax: 15, increment: 2.5,
    fatigue: "light", pattern: "isolation", rest: 90,
    muscles: [["pect_stern", 1], ["pect_clav", 0.8], ["delt_ant", 0.3]] },
  { name: "Développé incliné machine", category: "Push", mode: "straight", repMin: 6, repMax: 12, increment: 2.5,
    fatigue: "medium", pattern: "horizontal_press", rest: 120,
    muscles: [["pect_clav", 1], ["pect_stern", 0.6], ["delt_ant", 0.5], ["triceps_lat", 0.3], ["triceps_med", 0.3]] },

  // -- Épaules --------------------------------------------------------------
  { name: "Développé militaire machine", category: "Push", mode: "straight", repMin: 6, repMax: 12, increment: 2.5,
    fatigue: "medium", pattern: "vertical_press", rest: 120,
    muscles: [["delt_ant", 1], ["delt_lat", 0.6], ["triceps_lat", 0.4], ["triceps_med", 0.4], ["triceps_long", 0.3]] },
  { name: "Élévations frontales", category: "Push", mode: "straight", repMin: 10, repMax: 15, increment: 2,
    fatigue: "light", pattern: "isolation", rest: 75,
    muscles: [["delt_ant", 1], ["pect_clav", 0.3]] },
  { name: "Face pull", category: "Pull", mode: "straight", repMin: 12, repMax: 20, increment: 2.5,
    fatigue: "light", pattern: "isolation", rest: 75,
    muscles: [["delt_post", 1], ["trap_mid", 0.6], ["rhomboides", 0.6], ["trap_inf", 0.3]] },

  // -- Bras -----------------------------------------------------------------
  { name: "Curl pupitre", category: "Pull", mode: "straight", repMin: 8, repMax: 12, increment: 2.5,
    fatigue: "light", pattern: "isolation", rest: 90,
    muscles: [["biceps_court", 1], ["biceps_long", 0.7], ["bracchial", 0.5]] },
  { name: "Curl barre EZ", category: "Pull", mode: "straight", repMin: 8, repMax: 12, increment: 2.5,
    fatigue: "light", pattern: "isolation", rest: 90,
    muscles: [["biceps_long", 1], ["biceps_court", 1], ["bracchial", 0.5], ["brachioradial", 0.3]] },
  { name: "Extension triceps corde", category: "Push", mode: "straight", repMin: 10, repMax: 15, increment: 2.5,
    fatigue: "light", pattern: "isolation", rest: 75,
    muscles: [["triceps_lat", 1], ["triceps_med", 1], ["triceps_long", 0.5]] },
  { name: "Extension triceps nuque poulie", category: "Push", mode: "straight", repMin: 10, repMax: 15, increment: 2.5,
    fatigue: "light", pattern: "isolation", rest: 75,
    notes: "Bras au-dessus de la tête : cible le chef long.",
    muscles: [["triceps_long", 1], ["triceps_lat", 0.6], ["triceps_med", 0.6]] },

  // -- Jambes ---------------------------------------------------------------
  { name: "Presse à cuisses", category: "Legs", mode: "straight", repMin: 8, repMax: 15, increment: 5,
    fatigue: "heavy", pattern: "squat", rest: 180,
    muscles: [["vaste_lat", 1], ["vaste_med", 1], ["droit_femoral", 0.6], ["glut_max", 0.6]] },
  { name: "Hack squat", category: "Legs", mode: "straight", repMin: 8, repMax: 12, increment: 5,
    fatigue: "heavy", pattern: "squat", rest: 180,
    muscles: [["vaste_lat", 1], ["vaste_med", 1], ["droit_femoral", 0.6], ["glut_max", 0.5]] },
  { name: "Squat barre", category: "Legs", mode: "straight", repMin: 5, repMax: 10, increment: 2.5,
    fatigue: "heavy", pattern: "squat", rest: 210,
    muscles: [["vaste_lat", 1], ["vaste_med", 1], ["droit_femoral", 0.7], ["glut_max", 0.8], ["extenseurs", 0.4]] },
  { name: "Soulevé de terre roumain", category: "Legs", mode: "straight", repMin: 6, repMax: 12, increment: 2.5,
    fatigue: "heavy", pattern: "hinge", rest: 180,
    muscles: [["biceps_femoral", 1], ["semi_tendineux", 1], ["glut_max", 0.8], ["extenseurs", 0.6]] },
  { name: "Fentes marchées", category: "Legs", mode: "weighted_bodyweight", repMin: 8, repMax: 15, increment: 2,
    fatigue: "heavy", pattern: "lunge", rest: 150,
    muscles: [["glut_max", 1], ["vaste_lat", 0.8], ["vaste_med", 0.8], ["biceps_femoral", 0.4]] },
  { name: "Abducteurs machine", category: "Legs", mode: "straight", repMin: 12, repMax: 20, increment: 5,
    fatigue: "light", pattern: "isolation", rest: 75,
    muscles: [["glut_med", 1], ["glut_max", 0.3]] },
  // Adducteurs et mollets n'ont AUCUN groupe correspondant dans le modèle musculaire (les
  // feuilles s'arrêtent aux quadriceps, ischios et fessiers). Les rattacher au groupe le plus
  // proche gonflerait une couverture qu'ils ne travaillent pas : mieux vaut aucun mapping. Ils
  // restent logguables, simplement ils ne comptent dans aucun objectif hebdomadaire.
  { name: "Adducteurs machine", category: "Legs", mode: "straight", repMin: 12, repMax: 20, increment: 5,
    fatigue: "light", pattern: "isolation", rest: 75,
    notes: "Aucun objectif hebdo : pas de groupe adducteurs dans le modèle.",
    muscles: [] },
  { name: "Mollets debout", category: "Legs", mode: "straight", repMin: 10, repMax: 20, increment: 5,
    fatigue: "light", pattern: "isolation", rest: 75,
    notes: "Aucun objectif hebdo : pas de groupe mollets dans le modèle.",
    muscles: [] },

  // -- Abdos ----------------------------------------------------------------
  { name: "Crunch machine", category: "Core", mode: "straight", repMin: 10, repMax: 20, increment: 2.5,
    fatigue: "light", pattern: "isolation", rest: 75,
    muscles: [["abs_haut", 1], ["abs_bas", 0.6], ["oblique_ext", 0.3]] },
  { name: "Planche", category: "Core", mode: "bodyweight", repMin: 20, repMax: 60, increment: 0,
    fatigue: "light", pattern: "isolation", rest: 60,
    notes: "Reps = secondes de gainage.",
    muscles: [["transverse", 1], ["abs_haut", 0.6], ["abs_bas", 0.6], ["oblique_int", 0.4]] },
  { name: "Rotations russes", category: "Core", mode: "weighted_bodyweight", repMin: 12, repMax: 20, increment: 2,
    fatigue: "light", pattern: "isolation", rest: 60,
    muscles: [["oblique_ext", 1], ["oblique_int", 1], ["transverse", 0.5], ["abs_haut", 0.4]] },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL absent.");
  assertExactProductionDatabase(url, SCRIPT_NAME);
  const sql = neon(url);

  const existing = await sql`SELECT name FROM exercises`;
  const known = new Set(existing.map((r) => String(r.name).trim().toLowerCase()));
  const toAdd = CATALOG.filter((spec) => !known.has(spec.name.trim().toLowerCase()));

  console.log(`Host      : ${databaseHostname(url)}`);
  console.log(`Catalogue : ${existing.length} exercices, ${toAdd.length} à ajouter`);
  for (const spec of toAdd) console.log(`  + ${spec.name.padEnd(34)} ${spec.category}`);
  if (toAdd.length === 0) return;

  if (!APPLY) {
    console.log(`\n🔍 LECTURE SEULE. Pour appliquer :\n   ${APPLY_ENV}=${PRODUCTION_MIGRATION_CONFIRMATION} npx tsx scripts/${SCRIPT_NAME}.ts`);
    return;
  }
  if (process.env[APPLY_ENV] !== PRODUCTION_MIGRATION_CONFIRMATION) {
    throw new Error(`${APPLY_ENV} doit valoir exactement « ${PRODUCTION_MIGRATION_CONFIRMATION} ».`);
  }

  const [{ max }] = await sql`SELECT COALESCE(MAX(sort_order), 0) AS max FROM exercises`;
  let order = Number(max);

  await sql.transaction(
    (tx) => {
      const queries = [];
      for (const spec of toAdd) {
        const id = stableId(`exercise:${spec.name}`);
        order += 1;
        queries.push(
          tx.query(
            `INSERT INTO exercises (id, name, category, set_pattern_mode, rep_target_min, rep_target_max,
               smallest_increment, is_favorite, created_by_user, sort_order, suggested_rest_seconds,
               machine_setting, setup_notes, fatigue_class, voluntary_rep_cap, movement_pattern)
             VALUES ($1,$2,$3,$4,$5,$6,$7,false,false,$8,$9,'',$10,$11,0,$12)
             ON CONFLICT (id) DO NOTHING`,
            [id, spec.name, spec.category, spec.mode, spec.repMin, spec.repMax, spec.increment,
             order, spec.rest, spec.notes ?? "", spec.fatigue, spec.pattern]
          )
        );
        for (const [muscle, coeff] of spec.muscles) {
          queries.push(
            tx.query(
              `INSERT INTO muscle_mappings (id, exercise_id, muscle_group, coefficient)
               VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
              [stableId(`mm:${id}:${muscle}`), id, muscle, coeff]
            )
          );
        }
      }
      return queries;
    },
    { isolationLevel: "Serializable" }
  );

  const [after] = await sql`SELECT count(*)::int AS n FROM exercises`;
  console.log(`\n✅ Catalogue : ${after.n} exercices (+${toAdd.length}).`);
}

main().catch((error) => {
  console.error(`\n${SCRIPT_NAME}: échec —`, error);
  process.exit(1);
});
