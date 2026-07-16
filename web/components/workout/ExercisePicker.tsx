"use client";

import { useMemo, useState } from "react";
import { Search, Sparkles, Star } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { rollingPriorities } from "@/lib/engines/effective-sets";
import { aggregateCoefficient, type Exercise, type MuscleGoal, type WorkoutSession } from "@/lib/models/types";
import { cn } from "@/lib/utils";

/**
 * Picker d'exercices — recherche + sections Favoris / Récents / catégories,
 * avec un tri optionnel "Suggéré (déficit)" qui remonte en tête les exercices
 * comblant les muscles les plus en déficit sur la fenêtre roulante de 7 jours.
 * Autonome : ne dépend pas de components/exercise/ (autre agent).
 */
export function ExercisePicker({
  open,
  onClose,
  catalog,
  onPick,
  excludeIds,
  history,
  goals,
}: {
  open: boolean;
  onClose: () => void;
  catalog: Exercise[];
  onPick: (exerciseId: string) => void;
  excludeIds?: string[];
  /** Historique des séances — requis pour activer le tri "Suggéré (déficit)". */
  history?: WorkoutSession[];
  goals?: MuscleGoal[];
}) {
  const [query, setQuery] = useState("");
  const [deficitSort, setDeficitSort] = useState(false);

  const excluded = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);

  const deficitScoreByExerciseId = useMemo(() => {
    if (!history || !goals) return null;
    const priorities = rollingPriorities(history, catalog, goals);
    if (priorities.length === 0) return null;
    const weightByParent = new Map(priorities.map(([parent, remaining], i) => [parent, remaining * (priorities.length - i)]));
    const scores = new Map<string, number>();
    for (const exercise of catalog) {
      let score = 0;
      for (const [parent, weight] of weightByParent) {
        score += aggregateCoefficient(exercise, parent) * weight;
      }
      scores.set(exercise.id, score);
    }
    return scores;
  }, [history, goals, catalog]);

  const canDeficitSort = deficitScoreByExerciseId !== null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = catalog.filter((e) => !excluded.has(e.id));
    const matched = !q ? base : base.filter((e) => e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q));
    if (deficitSort && deficitScoreByExerciseId) {
      return [...matched].sort((a, b) => (deficitScoreByExerciseId.get(b.id) ?? 0) - (deficitScoreByExerciseId.get(a.id) ?? 0));
    }
    return matched;
  }, [catalog, excluded, query, deficitSort, deficitScoreByExerciseId]);

  const favorites = useMemo(() => filtered.filter((e) => e.isFavorite), [filtered]);
  const recents = useMemo(
    () =>
      filtered
        .filter((e) => e.lastUsed !== null)
        .sort((a, b) => (b.lastUsed?.getTime() ?? 0) - (a.lastUsed?.getTime() ?? 0))
        .slice(0, 6),
    [filtered]
  );

  const suggested = useMemo(
    () => (deficitSort && deficitScoreByExerciseId ? filtered.filter((e) => (deficitScoreByExerciseId.get(e.id) ?? 0) > 0).slice(0, 8) : []),
    [filtered, deficitSort, deficitScoreByExerciseId]
  );

  const byCategory = useMemo(() => {
    const groups = new Map<string, Exercise[]>();
    for (const e of filtered) {
      const list = groups.get(e.category) ?? [];
      list.push(e);
      groups.set(e.category, list);
    }
    if (deficitSort) return [...groups.entries()];
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, deficitSort]);

  const pick = (id: string) => {
    onPick(id);
    setQuery("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} full>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-[--color-fg]">Ajouter un exercice</h2>
          {canDeficitSort && (
            <button
              type="button"
              onClick={() => setDeficitSort((v) => !v)}
              aria-pressed={deficitSort}
              className={cn(
                "pill shrink-0 border transition active:scale-95",
                deficitSort ? "border-transparent text-white" : "border-white/10 text-[--color-fg-muted]"
              )}
              style={deficitSort ? { background: "linear-gradient(120deg, var(--accent), var(--accent-2))" } : undefined}
            >
              <Sparkles size={12} />
              Suggéré
            </button>
          )}
        </div>
        <div className="glass mt-3 flex items-center gap-2 rounded-full px-4 py-2.5">
          <Search size={16} className="text-[--color-fg-muted]" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un exercice…"
            className="w-full bg-transparent text-sm text-[--color-fg] outline-none placeholder:text-[--color-fg-faint]"
          />
        </div>

        <div className="mt-4 flex-1 overflow-y-auto pb-4">
          {query.trim() === "" && deficitSort && suggested.length > 0 && (
            <ExerciseSection title="Suggéré (déficit 7j)" exercises={suggested} onPick={pick} />
          )}
          {query.trim() === "" && !deficitSort && favorites.length > 0 && (
            <ExerciseSection title="Favoris" exercises={favorites} onPick={pick} />
          )}
          {query.trim() === "" && !deficitSort && recents.length > 0 && (
            <ExerciseSection title="Récents" exercises={recents} onPick={pick} />
          )}
          {byCategory.map(([category, exercises]) => (
            <ExerciseSection key={category} title={category} exercises={exercises} onPick={pick} />
          ))}
          {filtered.length === 0 && (
            <p className="mt-8 text-center text-sm text-[--color-fg-muted]">Aucun exercice trouvé</p>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function ExerciseSection({
  title,
  exercises,
  onPick,
}: {
  title: string;
  exercises: Exercise[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[--color-fg-muted]">{title}</p>
      <div className="flex flex-col gap-1.5">
        {exercises.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onPick(e.id)}
            className="glass flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left active:scale-[0.98] transition"
          >
            <span className={cn("text-sm font-medium text-[--color-fg]")}>{e.name}</span>
            {e.isFavorite && <Star size={14} className="shrink-0 text-amber-300" fill="currentColor" />}
          </button>
        ))}
      </div>
    </div>
  );
}
