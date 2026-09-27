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
 * Une zone à plusieurs groupes (épaules, dos, quadriceps avec adducteurs) additionne les séries de
 * ses groupes à objectif, chacun plafonné au sien. Les zones sans objectif suivent leur voisine la
 * plus faible (avant-bras : biceps ou triceps ; obliques : abdos). Tête, boxer, mains, pieds et
 * socle prennent l'état du muscle le plus faible : ils passent en or quand tout le corps est en or.
 */

import { currentWeekWindow, parentTotals } from "@/lib/engines/effective-sets";
import { MuscleParent } from "@/lib/models/muscles";
import type { Exercise, MuscleGoal, WorkoutSession } from "@/lib/models/types";

/** Ordre des zones = valeur de l'attribut `_ZONE` du modèle 3D (`public/statue/statue-v2.glb`). */
export const STATUE_ZONES = [
  { key: "neutre", label: "Reste", parents: [], follows: [] },
  { key: "pectoraux", label: "Pectoraux", parents: [MuscleParent.pectoraux], follows: [] },
  { key: "epaules", label: "Épaules", parents: [MuscleParent.deltAnterieur, MuscleParent.deltLateral, MuscleParent.deltPosterieur], follows: [] },
  { key: "biceps", label: "Biceps", parents: [MuscleParent.biceps], follows: [] },
  { key: "triceps", label: "Triceps", parents: [MuscleParent.triceps], follows: [] },
  { key: "avant_bras", label: "Avant-bras", parents: [], follows: ["biceps", "triceps"] },
  { key: "abdos", label: "Abdos", parents: [MuscleParent.abs], follows: [] },
  { key: "obliques", label: "Obliques", parents: [], follows: ["abdos"] },
  { key: "dos", label: "Dos", parents: [MuscleParent.grandDorsal, MuscleParent.dosHaut], follows: [] },
  { key: "fessiers", label: "Fessiers", parents: [MuscleParent.glutes], follows: [] },
  { key: "quadriceps", label: "Quadriceps", parents: [MuscleParent.quads, MuscleParent.adductors], follows: [] },
  { key: "ischios", label: "Ischios", parents: [MuscleParent.hamstrings], follows: [] },
  { key: "mollets", label: "Mollets", parents: [MuscleParent.calves], follows: [] },
] as const satisfies readonly { key: string; label: string; parents: readonly MuscleParent[]; follows: readonly string[] }[];

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
    rated.set(zone.key, { key: zone.key, label: zone.label, coverage, state, progress, veins: veinsOf(state, progress), sets, goalSets });
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
