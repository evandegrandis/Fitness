import type { LoggedSet } from "@/lib/models/types";

/**
 * 1RM estimé (formule d'Epley), miroir de ProgressionEngine.estimated1RM (Swift).
 * reps == 1 → weight ; sinon weight × (1 + reps/30).
 * Utilisé par ProgressionEngine (scoring/records) et RecordsEngine.
 */
export function estimated1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

/**
 * Meilleur e1RM parmi une liste de sets. Miroir de ProgressionEngine.bestE1RM.
 * Renvoie la valeur (0 si vide) et le set correspondant (null si vide).
 */
export function bestE1RM(sets: LoggedSet[]): { e1rm: number; set: LoggedSet | null } {
  let best: LoggedSet | null = null;
  let bestValue = 0;
  for (const s of sets) {
    const value = estimated1RM(s.weight, s.reps);
    if (best === null || value > bestValue) {
      best = s;
      bestValue = value;
    }
  }
  return { e1rm: best ? bestValue : 0, set: best };
}
