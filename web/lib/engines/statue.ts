/**
 * Statue (Evan, 27/09/2026) : son corps en statue, qui suit la semaine en cours. Le but de la
 * semaine est d'atteindre tous ses objectifs de séries par groupe musculaire : la statue est alors
 * entièrement en or. Elle repart du bronze chaque lundi.
 *
 * Chaque zone musculaire est en bronze, puis en marbre dès un tiers de son objectif de la semaine,
 * en argent dès deux tiers, en or à l'objectif (séries de la séance en cours comprises). À
 * mi-chemin du palier suivant, les veines du matériau suivant apparaissent et se densifient jusqu'au
 * palier (Evan : des biceps en argent à mi-chemin de l'or se veinent d'or).
 *
 * Une zone par groupe musculaire (les trois faisceaux d'épaule, haut du dos et grand dorsal,
 * quadriceps et adducteurs séparés). Une zone sans objectif suit sa voisine la plus faible
 * (deltoïde antérieur : pectoraux ; avant-bras : biceps ou triceps ; haut du dos : grand dorsal).
 * Tête, cou, boxer, mains, pieds et socle prennent l'état du muscle le plus faible : ils passent en
 * or quand tout le corps est en or.
 *
 * Fumée (Evan, 27/09/2026) : un muscle travaillé fume pendant les 22 h qui suivent sa dernière
 * série, de plus en plus faiblement ; plus il a reçu de séries, plus il fume (plein à 4 séries).
 */

import { currentWeekWindow, parentSets, parentTotals } from "@/lib/engines/effective-sets";
import { MuscleParent } from "@/lib/models/muscles";
import type { Exercise, MuscleGoal, WorkoutSession } from "@/lib/models/types";

/**
 * Ordre des zones = valeur de l'attribut `_ZONE` du modèle 3D (`public/statue/statue-v3.glb`), une
 * zone par groupe musculaire de l'app, découpées sur le squelette de la statue. Les obliques n'ont
 * pas de zone : le flanc appartient aux abdos. `follows` sert quand la zone n'a pas d'objectif.
 */
export const STATUE_ZONES = [
  { key: "neutre", label: "Reste", parents: [], follows: [] },
  { key: "pectoraux", label: "Pectoraux", parents: [MuscleParent.pectoraux], follows: [] },
  { key: "delt_anterieur", label: "Deltoïdes antérieurs", parents: [MuscleParent.deltAnterieur], follows: ["pectoraux"] },
  { key: "delt_lateral", label: "Deltoïdes latéraux", parents: [MuscleParent.deltLateral], follows: ["delt_posterieur"] },
  { key: "delt_posterieur", label: "Deltoïdes postérieurs", parents: [MuscleParent.deltPosterieur], follows: ["delt_lateral"] },
  { key: "biceps", label: "Biceps", parents: [MuscleParent.biceps], follows: ["triceps"] },
  { key: "triceps", label: "Triceps", parents: [MuscleParent.triceps], follows: ["biceps"] },
  { key: "avant_bras", label: "Avant-bras", parents: [MuscleParent.forearms], follows: ["biceps", "triceps"] },
  { key: "abdos", label: "Abdos", parents: [MuscleParent.abs], follows: [], worked: [MuscleParent.abs, MuscleParent.obliques] },
  { key: "dos_haut", label: "Haut du dos", parents: [MuscleParent.dosHaut], follows: ["grand_dorsal"] },
  { key: "grand_dorsal", label: "Grand dorsal", parents: [MuscleParent.grandDorsal], follows: ["dos_haut"] },
  { key: "fessiers", label: "Fessiers", parents: [MuscleParent.glutes], follows: ["ischios"] },
  { key: "quadriceps", label: "Quadriceps", parents: [MuscleParent.quads], follows: ["ischios"] },
  { key: "adducteurs", label: "Adducteurs", parents: [MuscleParent.adductors], follows: ["quadriceps"] },
  { key: "ischios", label: "Ischios", parents: [MuscleParent.hamstrings], follows: ["quadriceps"] },
  { key: "mollets", label: "Mollets", parents: [MuscleParent.calves], follows: [] },
] as const satisfies readonly { key: string; label: string; parents: readonly MuscleParent[]; follows: readonly string[]; worked?: readonly MuscleParent[] }[];

export type StatueZoneKey = (typeof STATUE_ZONES)[number]["key"];

/** 0 bronze, 1 marbre, 2 argent, 3 or. */
export type StatueState = 0 | 1 | 2 | 3;

export const STATUE_STATES: readonly { state: StatueState; label: string; min: number }[] = [
  { state: 0, label: "Bronze", min: 0 },
  { state: 1, label: "Marbre", min: 1 / 3 },
  { state: 2, label: "Argent", min: 2 / 3 },
  { state: 3, label: "Or", min: 1 },
];

/** Les veines du matériau suivant apparaissent à mi-chemin du palier suivant, à cette densité. */
export const STATUE_VEINS = { FROM: 0.5, FIRST: 0.2 } as const;

/** Fumée des muscles travaillés : durée après la dernière série, séries pour une fumée pleine. */
export const STATUE_SMOKE = { HOURS: 22, FULL_SETS: 4 } as const;

export interface StatueZone {
  key: StatueZoneKey;
  label: string;
  /** Part de l'objectif de la semaine (0..1), `null` pour une zone sans objectif. */
  coverage: number | null;
  state: StatueState;
  /** Avancée vers le palier suivant (0..1), 1 à l'or. */
  progress: number;
  /** Densité des veines du matériau suivant (0 = aucune, 1 = veinée partout). */
  veins: number;
  /** Séries comptées vers l'objectif (chaque groupe plafonné au sien) et objectif, en séries. */
  sets: number;
  goalSets: number;
  /** Fumée (0..1) : muscle travaillé il y a moins de 22 h. */
  smoke: number;
}

export interface StatueNext {
  zone: StatueZoneKey;
  label: string;
  to: string;
  /** Séries de la zone encore à faire cette semaine pour passer au palier. */
  sets: number;
}

export interface Statue {
  zones: StatueZone[];
  /** Zones qui peuvent monter d'un palier, les moins coûteuses d'abord. */
  next: StatueNext[];
  /** Séries encore à faire cette semaine pour une statue entièrement en or. */
  toGold: number;
}

/**
 * Fumée par groupe : pour chaque séance, ses séries par groupe (tous exercices confondus) et l'heure
 * de la dernière série de ce groupe ; fumée = séries (pleine à 4) × fraîcheur (1 juste après, 0 à
 * 22 h). Sur plusieurs séances, la plus forte l'emporte.
 */
function smokeByParent(
  history: readonly WorkoutSession[],
  catalog: readonly Exercise[],
  active: WorkoutSession | null,
  now: Date
): Map<MuscleParent, number> {
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const window = STATUE_SMOKE.HOURS * 3_600_000;
  const smoke = new Map<MuscleParent, number>();
  const sessions = [...history.filter((session) => !session.isActive), ...(active ? [active] : [])];
  for (const session of sessions) {
    const worked = new Map<MuscleParent, { sets: number; last: number }>();
    for (const logged of session.exercises) {
      const done = logged.sets.filter((set) => set.completed);
      if (done.length === 0) continue;
      const last = Math.max(...done.map((set) => set.timestamp.getTime()));
      if (now.getTime() - last >= window) continue;
      for (const [parent, sets] of parentSets(logged, byId.get(logged.exerciseId))) {
        const entry = worked.get(parent) ?? { sets: 0, last: 0 };
        worked.set(parent, { sets: entry.sets + sets, last: Math.max(entry.last, last) });
      }
    }
    for (const [parent, { sets, last }] of worked) {
      const age = now.getTime() - last;
      if (age < 0 || age >= window) continue;
      const value = Math.min(1, sets / STATUE_SMOKE.FULL_SETS) * (1 - age / window);
      smoke.set(parent, Math.max(smoke.get(parent) ?? 0, value));
    }
  }
  return smoke;
}

function stateOf(coverage: number): StatueState {
  let reached: StatueState = 0;
  for (const entry of STATUE_STATES) if (coverage + 1e-9 >= entry.min) reached = entry.state;
  return reached;
}

function progressOf(coverage: number, state: StatueState): number {
  const next = STATUE_STATES[state + 1];
  if (!next) return 1;
  const from = STATUE_STATES[state].min;
  return Math.min(1, Math.max(0, (coverage - from) / (next.min - from)));
}

function veinsOf(state: StatueState, progress: number): number {
  if (state === 3 || progress < STATUE_VEINS.FROM) return 0;
  return STATUE_VEINS.FIRST + (1 - STATUE_VEINS.FIRST) * ((progress - STATUE_VEINS.FROM) / (1 - STATUE_VEINS.FROM));
}

export function statue({
  history,
  catalog,
  goals,
  now,
  active = null,
}: {
  history: readonly WorkoutSession[];
  catalog: readonly Exercise[];
  goals: readonly MuscleGoal[];
  now: Date;
  /** Séance en cours : ses séries comptent tout de suite. */
  active?: WorkoutSession | null;
}): Statue {
  const { start, end } = currentWeekWindow(now);
  const totals = parentTotals([...history], [...catalog], start, end, active);

  const smoke = smokeByParent(history, catalog, active, now);
  const smokeOf = (parents: readonly MuscleParent[]) => Math.max(0, ...parents.map((parent) => smoke.get(parent) ?? 0));

  const rated = new Map<StatueZoneKey, StatueZone>();
  for (const zone of STATUE_ZONES) {
    const parents = new Set<MuscleParent>(zone.parents);
    const zoneGoals = goals.filter((goal) => parents.has(goal.parent) && goal.weeklyGoalSets > 0);
    if (zoneGoals.length === 0) continue;
    const goalSets = zoneGoals.reduce((sum, goal) => sum + goal.weeklyGoalSets, 0);
    const sets = zoneGoals.reduce((sum, goal) => sum + Math.min(totals.get(goal.parent) ?? 0, goal.weeklyGoalSets), 0);
    const coverage = sets / goalSets;
    const state = stateOf(coverage);
    const progress = progressOf(coverage, state);
    const worked = "worked" in zone ? zone.worked : zone.parents;
    rated.set(zone.key, { key: zone.key, label: zone.label, coverage, state, progress, veins: veinsOf(state, progress), sets, goalSets, smoke: smokeOf(worked) });
  }

  // Zones suiveuses : l'état et les veines de la zone la plus faible qu'elles suivent.
  const weakest = (candidates: StatueZone[]) =>
    candidates.reduce<StatueZone | null>((low, zone) => (!low || zone.state + zone.progress < low.state + low.progress ? zone : low), null);
  const zones: StatueZone[] = STATUE_ZONES.map((zone) => {
    const own = rated.get(zone.key);
    if (own) return own;
    const followed = zone.follows.map((key) => rated.get(key as StatueZoneKey)).filter((entry): entry is StatueZone => !!entry);
    const model = weakest(followed.length > 0 ? followed : [...rated.values()]);
    return {
      key: zone.key,
      label: zone.label,
      coverage: null,
      state: model?.state ?? 0,
      progress: model?.progress ?? 0,
      veins: model?.veins ?? 0,
      sets: 0,
      goalSets: 0,
      smoke: smokeOf("worked" in zone ? zone.worked : zone.parents),
    };
  });

  const next: StatueNext[] = [...rated.values()]
    .filter((zone) => zone.state < 3)
    .map((zone) => {
      const target = STATUE_STATES[zone.state + 1];
      return { zone: zone.key, label: zone.label, to: target.label, sets: Math.max(1, Math.ceil(target.min * zone.goalSets - zone.sets - 1e-9)) };
    })
    .sort((a, b) => a.sets - b.sets);
  const toGold = Math.ceil([...rated.values()].reduce((sum, zone) => sum + zone.goalSets - zone.sets, 0) - 1e-9);
  return { zones, next, toGold: Math.max(0, toGold) };
}
