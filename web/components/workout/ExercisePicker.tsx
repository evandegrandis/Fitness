"use client";

import { useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import type { Exercise } from "@/lib/models/types";
import { cn } from "@/lib/utils";

/**
 * Picker d'exercices — recherche + sections Favoris / Récents / catégories.
 * Autonome : ne dépend pas de components/exercise/ (autre agent).
 */
export function ExercisePicker({
  open,
  onClose,
  catalog,
  onPick,
  excludeIds,
}: {
  open: boolean;
  onClose: () => void;
  catalog: Exercise[];
  onPick: (exerciseId: string) => void;
  excludeIds?: string[];
}) {
  const [query, setQuery] = useState("");

  const excluded = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = catalog.filter((e) => !excluded.has(e.id));
    if (!q) return base;
    return base.filter((e) => e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q));
  }, [catalog, excluded, query]);

  const favorites = useMemo(() => filtered.filter((e) => e.isFavorite), [filtered]);
  const recents = useMemo(
    () =>
      filtered
        .filter((e) => e.lastUsed !== null)
        .sort((a, b) => (b.lastUsed?.getTime() ?? 0) - (a.lastUsed?.getTime() ?? 0))
        .slice(0, 6),
    [filtered]
  );

  const byCategory = useMemo(() => {
    const groups = new Map<string, Exercise[]>();
    for (const e of filtered) {
      const list = groups.get(e.category) ?? [];
      list.push(e);
      groups.set(e.category, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const pick = (id: string) => {
    onPick(id);
    setQuery("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} full>
      <div className="flex h-full flex-col">
        <h2 className="font-display text-lg font-bold text-[--color-fg]">Ajouter un exercice</h2>
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
          {query.trim() === "" && favorites.length > 0 && (
            <ExerciseSection title="Favoris" exercises={favorites} onPick={pick} />
          )}
          {query.trim() === "" && recents.length > 0 && (
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
