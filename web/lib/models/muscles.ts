/**
 * Taxonomie musculaire, portée depuis `Jeera/Models/MuscleGroup.swift`.
 *
 * Deux niveaux :
 *   - `MuscleParent` : 12 groupes "buckets" (écran d'accueil, objectifs hebdo).
 *   - `MuscleGroup`  : feuilles MECE (Mutually Exclusive, Collectively Exhaustive),
 *     niveau auquel chaque exercice est mappé.
 *
 * Toutes les rawValues, displayName et shortName sont repris à l'identique du
 * Swift d'origine (voir MuscleGroup.swift lignes 7-300).
 */

// ---------------------------------------------------------------------------
// MuscleParent (12 groupes)
// ---------------------------------------------------------------------------

export const MuscleParent = {
  pectoraux: "pectoraux",
  dosHaut: "dos_haut",
  grandDorsal: "grand_dorsal",
  deltoides: "deltoides",
  biceps: "biceps",
  triceps: "triceps",
  abs: "abs",
  obliques: "obliques",
  forearms: "avant_bras",
  quads: "quads",
  hamstrings: "ischios",
  glutes: "fessiers",
} as const;

export type MuscleParent = (typeof MuscleParent)[keyof typeof MuscleParent];

export const MUSCLE_PARENTS: MuscleParent[] = Object.values(MuscleParent);

// ---------------------------------------------------------------------------
// MuscleGroup (feuilles MECE)
// ---------------------------------------------------------------------------

export const MuscleGroup = {
  // Pectoraux
  pectClav: "pect_clav",
  pectStern: "pect_stern",

  // Dos haut (upper back)
  trapSup: "trap_sup",
  trapMid: "trap_mid",
  trapInf: "trap_inf",
  rhomboides: "rhomboides",

  // Grand dorsal (lats)
  latSup: "lat_sup",
  latInf: "lat_inf",

  // Deltoïdes
  deltAnt: "delt_ant",
  deltLat: "delt_lat",
  deltPost: "delt_post",

  // Biceps
  bracchial: "bracchial",
  bicepsLong: "biceps_long",
  bicepsCourt: "biceps_court",

  // Triceps
  tricepsLong: "triceps_long",
  tricepsLat: "triceps_lat",
  tricepsMed: "triceps_med",

  // Abdos
  absHaut: "abs_haut",
  absBas: "abs_bas",
  transverse: "transverse",

  // Obliques
  obliqueExt: "oblique_ext",
  obliqueInt: "oblique_int",

  // Avant-bras
  flechisseurs: "flechisseurs",
  extenseurs: "extenseurs",
  brachioradial: "brachioradial",

  // Quadriceps
  vasteLat: "vaste_lat",
  vasteMed: "vaste_med",
  droitFemoral: "droit_femoral",

  // Ischios (hamstrings)
  bicepsFemoral: "biceps_femoral",
  semiTendineux: "semi_tendineux",

  // Fessiers (glutes)
  glutMax: "glut_max",
  glutMed: "glut_med",
} as const;

export type MuscleGroup = (typeof MuscleGroup)[keyof typeof MuscleGroup];

export const MUSCLE_LEAVES: MuscleGroup[] = Object.values(MuscleGroup);

// ---------------------------------------------------------------------------
// Leaf -> Parent
// ---------------------------------------------------------------------------

/** Miroir de `MuscleGroup.parent` (Swift). */
export const LEAF_TO_PARENT: Record<MuscleGroup, MuscleParent> = {
  pect_clav: MuscleParent.pectoraux,
  pect_stern: MuscleParent.pectoraux,

  trap_sup: MuscleParent.dosHaut,
  trap_mid: MuscleParent.dosHaut,
  trap_inf: MuscleParent.dosHaut,
  rhomboides: MuscleParent.dosHaut,

  lat_sup: MuscleParent.grandDorsal,
  lat_inf: MuscleParent.grandDorsal,

  delt_ant: MuscleParent.deltoides,
  delt_lat: MuscleParent.deltoides,
  delt_post: MuscleParent.deltoides,

  bracchial: MuscleParent.biceps,
  biceps_long: MuscleParent.biceps,
  biceps_court: MuscleParent.biceps,

  triceps_long: MuscleParent.triceps,
  triceps_lat: MuscleParent.triceps,
  triceps_med: MuscleParent.triceps,

  abs_haut: MuscleParent.abs,
  abs_bas: MuscleParent.abs,
  transverse: MuscleParent.abs,

  oblique_ext: MuscleParent.obliques,
  oblique_int: MuscleParent.obliques,

  flechisseurs: MuscleParent.forearms,
  extenseurs: MuscleParent.forearms,
  brachioradial: MuscleParent.forearms,

  vaste_lat: MuscleParent.quads,
  vaste_med: MuscleParent.quads,
  droit_femoral: MuscleParent.quads,

  biceps_femoral: MuscleParent.hamstrings,
  semi_tendineux: MuscleParent.hamstrings,

  glut_max: MuscleParent.glutes,
  glut_med: MuscleParent.glutes,
};

/** Inverse de `LEAF_TO_PARENT` : toutes les feuilles appartenant à un parent. */
export const LEAVES_OF_PARENT: Record<MuscleParent, MuscleGroup[]> = MUSCLE_PARENTS.reduce(
  (acc, parent) => {
    acc[parent] = MUSCLE_LEAVES.filter((leaf) => LEAF_TO_PARENT[leaf] === parent);
    return acc;
  },
  {} as Record<MuscleParent, MuscleGroup[]>
);

// ---------------------------------------------------------------------------
// Display names (français, repris de Swift)
// ---------------------------------------------------------------------------

export const parentDisplayName: Record<MuscleParent, string> = {
  pectoraux: "Pectoraux",
  dos_haut: "Dos haut",
  grand_dorsal: "Grand dorsal",
  deltoides: "Deltoïdes",
  biceps: "Biceps",
  triceps: "Triceps",
  abs: "Abdos",
  obliques: "Obliques",
  avant_bras: "Avant-bras",
  quads: "Quadriceps",
  ischios: "Ischios",
  fessiers: "Fessiers",
};

export const parentShortName: Record<MuscleParent, string> = {
  pectoraux: "Pecs",
  dos_haut: "Dos haut",
  grand_dorsal: "Dorsaux",
  deltoides: "Delts",
  biceps: "Biceps",
  triceps: "Triceps",
  abs: "Abdos",
  obliques: "Obliques",
  avant_bras: "Av-bras",
  quads: "Quads",
  ischios: "Ischios",
  fessiers: "Fessiers",
};

export const leafDisplayName: Record<MuscleGroup, string> = {
  pect_clav: "Pectoraux claviculaires",
  pect_stern: "Pectoraux sternaux",
  trap_sup: "Trapèze supérieur",
  trap_mid: "Trapèze moyen",
  trap_inf: "Trapèze inférieur",
  rhomboides: "Rhomboïdes",
  lat_sup: "Grand dorsal supérieur",
  lat_inf: "Grand dorsal inférieur",
  delt_ant: "Deltoïde antérieur",
  delt_lat: "Deltoïde latéral",
  delt_post: "Deltoïde postérieur",
  bracchial: "Brachial",
  biceps_long: "Biceps chef long",
  biceps_court: "Biceps chef court",
  triceps_long: "Triceps chef long",
  triceps_lat: "Triceps vaste latéral",
  triceps_med: "Triceps vaste médial",
  abs_haut: "Abdos supérieurs",
  abs_bas: "Abdos inférieurs",
  transverse: "Transverse",
  oblique_ext: "Oblique externe",
  oblique_int: "Oblique interne",
  flechisseurs: "Fléchisseurs",
  extenseurs: "Extenseurs",
  brachioradial: "Brachio-radial",
  vaste_lat: "Vaste latéral",
  vaste_med: "Vaste médial",
  droit_femoral: "Droit fémoral",
  biceps_femoral: "Biceps fémoral",
  semi_tendineux: "Semi-tendineux",
  glut_max: "Grand fessier",
  glut_med: "Moyen fessier",
};

/** Très court, utilisé dans les chips. */
export const leafShortName: Record<MuscleGroup, string> = {
  pect_clav: "Pec clav",
  pect_stern: "Pec stern",
  trap_sup: "Trap sup",
  trap_mid: "Trap mid",
  trap_inf: "Trap inf",
  rhomboides: "Rhomb",
  lat_sup: "Lat sup",
  lat_inf: "Lat inf",
  delt_ant: "Delt ant",
  delt_lat: "Delt lat",
  delt_post: "Delt post",
  bracchial: "Brachial",
  biceps_long: "Bic long",
  biceps_court: "Bic court",
  triceps_long: "Tri long",
  triceps_lat: "Tri lat",
  triceps_med: "Tri méd",
  abs_haut: "Abs haut",
  abs_bas: "Abs bas",
  transverse: "Transv",
  oblique_ext: "Obl ext",
  oblique_int: "Obl int",
  flechisseurs: "Fléch",
  extenseurs: "Ext",
  brachioradial: "Brach-rad",
  vaste_lat: "V. lat",
  vaste_med: "V. méd",
  droit_femoral: "Dr. fém",
  biceps_femoral: "Bi. fém",
  semi_tendineux: "Semi-t",
  glut_max: "Gd fess",
  glut_med: "Moy fess",
};

// ---------------------------------------------------------------------------
// Legacy mapping (migration anciennes valeurs)
// ---------------------------------------------------------------------------

/**
 * Miroir de `MuscleGroup.legacyMapping` (Swift). Permet de migrer les
 * anciennes valeurs brutes (groupes pré-MECE, ou raw values v2) vers la
 * feuille actuelle la plus représentative.
 */
export const legacyMuscleMapping: Record<string, MuscleGroup> = {
  // Groupes coarse pré-MECE
  chest: MuscleGroup.pectStern,
  upper_back: MuscleGroup.trapMid,
  upperback: MuscleGroup.trapMid,
  lats: MuscleGroup.latSup,
  biceps: MuscleGroup.bicepsCourt,
  triceps: MuscleGroup.tricepsLong,
  shoulders: MuscleGroup.deltLat,
  side_delts: MuscleGroup.deltLat,
  front_delts: MuscleGroup.deltAnt,
  rear_delts: MuscleGroup.deltPost,
  calves: MuscleGroup.vasteLat, // calves retiré de la taxonomie
  back: MuscleGroup.trapMid,
  legs: MuscleGroup.vasteLat,
  core: MuscleGroup.absHaut,

  // Anciennes rawValues à feuille unique (migration v2 -> v3)
  dos_haut: MuscleGroup.trapMid,
  grand_dorsal: MuscleGroup.latSup,
  abs: MuscleGroup.absHaut,
  obliques: MuscleGroup.obliqueExt,
  avant_bras: MuscleGroup.flechisseurs,
  quads: MuscleGroup.vasteLat,
  ischios: MuscleGroup.bicepsFemoral,
  fessiers: MuscleGroup.glutMax,
};
