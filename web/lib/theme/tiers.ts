import type { WeekTier } from "@/lib/engines/progress-stats";
import type { RankLetter } from "@/lib/engines/session-rank";

/**
 * Couleurs des paliers de semaine. Métaux lisibles sur l'encre et distincts du crème de l'app :
 * un cuivre chaud, un argent légèrement froid (sinon confondu avec le crème), l'or des records.
 */
export const TIER_COLORS: Record<WeekTier, string> = {
  bronze: "#c3875a",
  argent: "#b7bcc3",
  or: "var(--color-warning)",
};

/** Barre ou anneau d'une semaine sous le bronze : présente mais effacée. */
export const NO_TIER_COLOR = "rgba(236,230,216,0.32)";

export const TIER_LABELS: Record<WeekTier, string> = { bronze: "bronze", argent: "argent", or: "or" };

/** Rang de fin de séance : les métaux des semaines (S = or, A = argent, B = bronze), C effacé. */
export const RANK_COLORS: Record<RankLetter, string> = {
  S: TIER_COLORS.or,
  A: TIER_COLORS.argent,
  B: TIER_COLORS.bronze,
  C: "var(--color-fg-muted)",
};
