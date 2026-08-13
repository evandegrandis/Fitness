/**
 * Contexte de fatigue de séance, miroir exact de
 * `Jeera/Engines/SessionFatigueContext.swift`.
 *
 * Instantané des exercices déjà complétés avant l'exercice courant dans la
 * même séance. Passé à `ProgressionEngine.suggest` pour ajuster les
 * suggestions selon la fatigue accumulée (systémique et locale), pas
 * seulement ce qui s'est passé sur CET exercice.
 */

import { ALGO_V2 } from "@/lib/engines/constants";
import { FATIGUE_CLASS_PROPERTIES, type FatigueClass } from "@/lib/models/enums";
import { parentDisplayName, type MuscleParent } from "@/lib/models/muscles";

export interface PriorLoad {
  primaryParent: MuscleParent;
  workSetsCompleted: number;
  fatigueClass: FatigueClass;
  /** Libellé facultatif utilisé pour expliquer le signal dans l'interface. */
  exerciseName?: string;
}

export interface SessionFatigueEvidence {
  kind: "local" | "systemic";
  parent: MuscleParent | null;
  sameParentSets: number;
  /** null = historique insuffisant, distinct d'une vraie baseline à zéro. */
  baselineSameParentSets: number | null;
  excessSameParentSets: number;
  totalSystemicCost: number;
  /** null = historique insuffisant, distinct d'une vraie baseline à zéro. */
  baselineSystemicCost: number | null;
  excessSystemicCost: number;
  repPenalty: number;
  contributors: { exerciseName: string; effectiveSets: number }[];
}

export class SessionFatigueContext {
  readonly priorLoads: PriorLoad[];
  /**
   * ALGO_V2 §6.1 — médiane du `totalSystemicCost` AVANT cet exercice sur ses 5 dernières
   * occurrences historiques. Optionnel : si absent (appels existants, golden), la baseline
   * vaut 0 -> comportement strictement plus conservateur (pénalité sur le total brut), jamais
   * crashant. Calculé côté store (accès à l'historique complet).
   */
  readonly baselineSystemicCost?: number;
  /** ALGO_V2 §6.1 — idem pour `sameParentSets(parent)`. */
  readonly baselineSameParentSets?: number;

  constructor(priorLoads: PriorLoad[] = [], baselines?: { baselineSystemicCost?: number; baselineSameParentSets?: number }) {
    this.priorLoads = priorLoads;
    this.baselineSystemicCost = baselines?.baselineSystemicCost;
    this.baselineSameParentSets = baselines?.baselineSameParentSets;
  }

  /** Miroir de `SessionFatigueContext.empty` (Swift). */
  static readonly empty = new SessionFatigueContext([]);

  /**
   * ALGO_V2 §6.1 — coût systémique EXCÉDENTAIRE par rapport à la baseline habituelle (anti
   * double-comptage : le profil empirique de `predictReps` intègre déjà la fatigue habituelle).
   */
  get excessSystemicCost(): number {
    return Math.max(0, this.totalSystemicCost - (this.baselineSystemicCost ?? 0));
  }

  /** ALGO_V2 §6.1 — sets excédentaires sur le même parent musculaire par rapport à la baseline. */
  excessSameParentSets(parent: MuscleParent): number {
    return Math.max(0, this.sameParentSets(parent) - (this.baselineSameParentSets ?? 0));
  }

  /** Coût systémique approximatif : les sets lourds coûtent plus que les légers. */
  get totalSystemicCost(): number {
    return this.priorLoads.reduce(
      (acc, load) => acc + load.workSetsCompleted * FATIGUE_CLASS_PROPERTIES[load.fatigueClass].baseRepDrop,
      0
    );
  }

  /** Sets de travail complétés ciblant le même parent musculaire principal avant cet exercice. */
  sameParentSets(parent: MuscleParent): number {
    return this.priorLoads
      .filter((load) => load.primaryParent === parent)
      .reduce((acc, load) => acc + load.workSetsCompleted, 0);
  }

  /**
   * Une fatigue n'est confirmée que sur l'EXCÈS par rapport au contexte
   * habituel. Le seuil commun `fatiguePenalty >= 2` évite qu'une séance
   * structurellement identique aux précédentes soit annoncée comme fatigante.
   */
  isSignificant(parent: MuscleParent | null): boolean {
    const localConfirmed = parent !== null && this.excessSameParentSets(parent) >= 3;
    // La garde locale (3 vraies séries effectives) reste indépendante : le durcissement demandé
    // concerne l'étiquette systémique, pas une fatigue ciblée directement observée.
    return localConfirmed || this.fatiguePenalty(parent) >= 2;
  }

  /**
   * ALGO_V2 §6.1 — pénalité de reps graduée (0..MAX_FATIGUE_REP_PENALTY) liée à l'EXCÈS de
   * fatigue par rapport au contexte habituel de cet exercice (anti double-comptage : la
   * fatigue "normale" est déjà dans les médianes empiriques de `predictReps`).
   */
  fatiguePenalty(parent: MuscleParent | null): number {
    const excessSystemic = this.excessSystemicCost;
    const excessLocal = parent !== null ? this.excessSameParentSets(parent) : 0;
    // Un palier n'est acquis qu'une fois le divisor entièrement dépassé. `Math.round` produisait
    // deux points dès 9 de coût (1,5), soit une alerte systémique après seulement cinq-six sets
    // moyens — trop sensible et contradictoire avec le seuil documenté de 1 point par 6.
    const base = Math.floor(excessSystemic / ALGO_V2.FATIGUE_EXCESS_DIVISOR) + (excessLocal >= 3 ? 1 : 0);
    return Math.max(0, Math.min(ALGO_V2.MAX_FATIGUE_REP_PENALTY, base));
  }

  /** Note lisible pour l'UI (français). */
  fatigueNote(parent: MuscleParent | null): string | null {
    if (!this.isSignificant(parent)) return null;
    if (parent !== null && this.excessSameParentSets(parent) >= 3) {
      return `Fatigue locale ${parentDisplayName[parent]} détectée`;
    }
    return "Fatigue systémique de séance détectée";
  }

  /** Preuve chiffrée dérivée, destinée au détail cliquable de l'alerte. */
  fatigueEvidence(parent: MuscleParent | null): SessionFatigueEvidence | null {
    if (!this.isSignificant(parent)) return null;
    const local = parent !== null && this.excessSameParentSets(parent) >= 3;
    const contributorMap = new Map<string, number>();
    for (const load of this.priorLoads) {
      if (local && load.primaryParent !== parent) continue;
      const name = load.exerciseName?.trim() || parentDisplayName[load.primaryParent];
      contributorMap.set(name, (contributorMap.get(name) ?? 0) + load.workSetsCompleted);
    }
    return {
      kind: local ? "local" : "systemic",
      parent,
      sameParentSets: parent === null ? 0 : this.sameParentSets(parent),
      baselineSameParentSets: this.baselineSameParentSets ?? null,
      excessSameParentSets: parent === null ? 0 : this.excessSameParentSets(parent),
      totalSystemicCost: this.totalSystemicCost,
      baselineSystemicCost: this.baselineSystemicCost ?? null,
      excessSystemicCost: this.excessSystemicCost,
      repPenalty: this.fatiguePenalty(parent),
      contributors: [...contributorMap.entries()].map(([exerciseName, effectiveSets]) => ({
        exerciseName,
        effectiveSets,
      })),
    };
  }
}
