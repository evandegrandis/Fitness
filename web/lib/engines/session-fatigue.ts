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
   * true si le contexte de séance suggère une fatigue accumulée significative pour cet exercice.
   * - Systémique : > 12 points de coût (~ 6 sets lourds composés ou 8 sets moyens)
   * - Locale : ≥ 3 sets ciblant le même parent musculaire
   */
  isSignificant(parent: MuscleParent | null): boolean {
    if (this.totalSystemicCost > 12) return true;
    if (parent !== null && this.sameParentSets(parent) >= 3) return true;
    return false;
  }

  /**
   * ALGO_V2 §6.1 — pénalité de reps graduée (0..MAX_FATIGUE_REP_PENALTY) liée à l'EXCÈS de
   * fatigue par rapport au contexte habituel de cet exercice (anti double-comptage : la
   * fatigue "normale" est déjà dans les médianes empiriques de `predictReps`).
   */
  fatiguePenalty(parent: MuscleParent | null): number {
    const excessSystemic = this.excessSystemicCost;
    const excessLocal = parent !== null ? this.excessSameParentSets(parent) : 0;
    const base = Math.round(excessSystemic / ALGO_V2.FATIGUE_EXCESS_DIVISOR) + (excessLocal >= 3 ? 1 : 0);
    return Math.max(0, Math.min(ALGO_V2.MAX_FATIGUE_REP_PENALTY, base));
  }

  /** Note lisible pour l'UI (français). */
  fatigueNote(parent: MuscleParent | null): string | null {
    if (!this.isSignificant(parent)) return null;
    if (parent !== null && this.sameParentSets(parent) >= 3) {
      return `Fatigue locale ${parentDisplayName[parent]} détectée`;
    }
    return "Fatigue systémique de séance détectée";
  }
}
