/**
 * Contexte de fatigue de séance, miroir exact de
 * `Jeera/Engines/SessionFatigueContext.swift`.
 *
 * Instantané des exercices déjà complétés avant l'exercice courant dans la
 * même séance. Passé à `ProgressionEngine.suggest` pour ajuster les
 * suggestions selon la fatigue accumulée (systémique et locale), pas
 * seulement ce qui s'est passé sur CET exercice.
 */

import { FATIGUE_CLASS_PROPERTIES, type FatigueClass } from "@/lib/models/enums";
import { parentDisplayName, type MuscleParent } from "@/lib/models/muscles";

export interface PriorLoad {
  primaryParent: MuscleParent;
  workSetsCompleted: number;
  fatigueClass: FatigueClass;
}

export class SessionFatigueContext {
  readonly priorLoads: PriorLoad[];

  constructor(priorLoads: PriorLoad[] = []) {
    this.priorLoads = priorLoads;
  }

  /** Miroir de `SessionFatigueContext.empty` (Swift). */
  static readonly empty = new SessionFatigueContext([]);

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

  /** Note lisible pour l'UI (français). */
  fatigueNote(parent: MuscleParent | null): string | null {
    if (!this.isSignificant(parent)) return null;
    if (parent !== null && this.sameParentSets(parent) >= 3) {
      return `Fatigue locale ${parentDisplayName[parent]} détectée`;
    }
    return "Fatigue systémique de séance détectée";
  }
}
