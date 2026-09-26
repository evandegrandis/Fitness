/**
 * Statue de marbre (Evan, 26/09/2026) : son corps en statue, chaque zone musculaire taillée au
 * rythme de son volume.
 *
 * État d'une zone = part moyenne de son objectif hebdo atteinte sur les 8 dernières semaines
 * terminées, chaque semaine plafonnée à l'objectif (comme le score de semaine), lue avec les
 * paliers de la semaine : brut sous le bronze (40 %), taillé au bronze, poli à l'argent (55 %),
 * veines d'or à l'or (70 %). Les objectifs d'Evan totalisent ~150 séries pour ~70 faites : des
 * seuils à 100 % laisseraient la statue brute à vie.
 *
 * Une zone à plusieurs groupes (épaules, dos, quadriceps avec adducteurs) additionne les séries de
 * ses groupes à objectif, chacun plafonné au sien. Tête, boxer, mains, pieds, socle, et les zones
 * sans objectif (avant-bras, obliques) prennent la moyenne des autres : la statue avance d'un bloc.
 */

import { currentWeekWindow, parentTotals } from "@/lib/engines/effective-sets";
import { WEEK_TIERS } from "@/lib/engines/progress-stats";
import { MuscleParent } from "@/lib/models/muscles";
import type { Exercise, MuscleGoal, WorkoutSession } from "@/lib/models/types";

export const STATUE = { WEEKS: 8 } as const;

/** Ordre des zones = valeur de l'attribut `_ZONE` du modèle 3D (`public/statue/statue-v1.glb`). */
export const STATUE_ZONES = [
  { key: "neutre", label: "Reste", parents: [] },
  { key: "pectoraux", label: "Pectoraux", parents: [MuscleParent.pectoraux] },
  { key: "epaules", label: "Épaules", parents: [MuscleParent.deltAnterieur, MuscleParent.deltLateral, MuscleParent.deltPosterieur] },
  { key: "biceps", label: "Biceps", parents: [MuscleParent.biceps] },
  { key: "triceps", label: "Triceps", parents: [MuscleParent.triceps] },
  { key: "avant_bras", label: "Avant-bras", parents: [] },
  { key: "abdos", label: "Abdos", parents: [MuscleParent.abs] },
  { key: "obliques", label: "Obliques", parents: [] },
  { key: "dos", label: "Dos", parents: [MuscleParent.grandDorsal, MuscleParent.dosHaut] },
  { key: "fessiers", label: "Fessiers", parents: [MuscleParent.glutes] },
  { key: "quadriceps", label: "Quadriceps", parents: [MuscleParent.quads, MuscleParent.adductors] },
  { key: "ischios", label: "Ischios", parents: [MuscleParent.hamstrings] },
  { key: "mollets", label: "Mollets", parents: [MuscleParent.calves] },
] as const satisfies readonly { key: string; label: string; parents: readonly MuscleParent[] }[];

export type StatueZoneKey = (typeof STATUE_ZONES)[number]["key"];

/** 0 brut, 1 taillé, 2 poli, 3 veines d'or. */
export type StatueState = 0 | 1 | 2 | 3;

export const STATUE_STATES: readonly { state: StatueState; label: string; min: number }[] = [
  { state: 0, label: "Brut", min: 0 },
  ...WEEK_TIERS.map((tier, index) => ({ state: (index + 1) as StatueState, label: ["Taillé", "Poli", "Or"][index], min: tier.min })),
];

export interface StatueZone {
  key: StatueZoneKey;
  label: string;
  /** Part moyenne de l'objectif sur la fenêtre (0..1), `null` pour une zone sans objectif. */
  coverage: number | null;
  state: StatueState;
  /** Objectif hebdo cumulé de la zone, en séries. */
  goalSets: number;
}

export interface StatueNext {
  zone: StatueZoneKey;
  label: string;
  to: string;
  /** Séries de la zone encore à faire cette semaine pour passer au palier lundi ; 0 = déjà acquis. */
  sets: number;
}

export interface Statue {
  zones: StatueZone[];
  /** Niveau par zone pour le rendu, dans l'ordre de `STATUE_ZONES` (continu pour les zones suiveuses). */
  levels: number[];
  /** Zones qui peuvent passer au palier lundi, les moins coûteuses d'abord (déjà acquises en tête). */
  next: StatueNext[];
}

function stateOf(coverage: number): StatueState {
  let reached: StatueState = 0;
  for (const entry of STATUE_STATES) if (coverage + 1e-9 >= entry.min) reached = entry.state;
  return reached;
}

/** Couverture d'une zone sur une semaine : séries de ses groupes, chacun plafonné à son objectif. */
function weekCoverage(totals: ReadonlyMap<MuscleParent, number>, goals: readonly MuscleGoal[]): { covered: number; goal: number } {
  return goals.reduce(
    (acc, goal) => ({ covered: acc.covered + Math.min(totals.get(goal.parent) ?? 0, goal.weeklyGoalSets), goal: acc.goal + goal.weeklyGoalSets }),
    { covered: 0, goal: 0 }
  );
}

export function statue({
  history,
  catalog,
  goals,
  now,
}: {
  history: readonly WorkoutSession[];
  catalog: readonly Exercise[];
  goals: readonly MuscleGoal[];
  now: Date;
}): Statue {
  const sessions = history.filter((session) => !session.isActive);
  const currentStart = currentWeekWindow(now).start;
  const weekTotals = Array.from({ length: STATUE.WEEKS + 1 }, (_, index) => {
    // index 0 = la plus ancienne semaine terminée de la fenêtre, index WEEKS = la semaine en cours.
    const start = new Date(currentStart);
    start.setDate(start.getDate() - 7 * (STATUE.WEEKS - index));
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return parentTotals([...sessions], [...catalog], start, end);
  });

  const next: StatueNext[] = [];
  const zones: StatueZone[] = STATUE_ZONES.map((zone) => {
    const parents = new Set<MuscleParent>(zone.parents);
    const zoneGoals = goals.filter((goal) => parents.has(goal.parent) && goal.weeklyGoalSets > 0);
    if (zoneGoals.length === 0) return { key: zone.key, label: zone.label, coverage: null, state: 0, goalSets: 0 };
    const weeks = weekTotals.map((totals) => weekCoverage(totals, zoneGoals));
    const goalSets = weeks[0].goal;
    const ratios = weeks.slice(0, STATUE.WEEKS).map((week) => week.covered / week.goal);
    const coverage = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
    const state = stateOf(coverage);

    // Lundi, la semaine en cours entre dans la fenêtre et la plus ancienne en sort : ce qu'il faut
    // cette semaine pour que la moyenne atteigne le palier suivant.
    const target = STATUE_STATES[state + 1];
    if (target) {
      const needed = target.min * STATUE.WEEKS - (ratios.reduce((sum, ratio) => sum + ratio, 0) - ratios[0]);
      if (needed <= 1 + 1e-9) {
        const sets = Math.max(0, Math.ceil(Math.max(0, needed) * goalSets - 1e-9 - weeks[STATUE.WEEKS].covered));
        next.push({ zone: zone.key, label: zone.label, to: target.label, sets });
      }
    }
    return { key: zone.key, label: zone.label, coverage, state, goalSets };
  });

  const rated = zones.filter((zone) => zone.coverage !== null);
  const average = rated.length > 0 ? rated.reduce((sum, zone) => sum + zone.state, 0) / rated.length : 0;
  const levels = zones.map((zone) => (zone.coverage === null ? average : zone.state));
  return { zones, levels, next: next.sort((a, b) => a.sets - b.sets) };
}
