"use client";

import { useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import { setPatternModeShortName } from "@/lib/models/enums";
import { parentShortName } from "@/lib/models/muscles";
import { primaryParent, type Exercise } from "@/lib/models/types";
import { cn } from "@/lib/utils";
import { ExerciseEditorSheet } from "@/components/exercise/ExerciseEditorSheet";

type SortMode = "name" | "favorite" | "recent";

const SORT_LABEL: Record<SortMode, string> = { name: "Nom", favorite: "Favoris", recent: "Récents" };

/**
 * Liste triable du catalogue d'exercices — favori, muscle primaire, mode.
 * Cliquer une ligne ouvre l'édition ; "+ Nouvel exercice" ouvre la création.
 */
export function ExerciseList({ catalog }: { catalog: Exercise[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("favorite");
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [creating, setCreating] = useState(false);

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? catalog.filter((e) => e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
      : catalog;

    const arr = [...filtered];
    if (sort === "name") {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "favorite") {
      arr.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name));
    } else {
      arr.sort((a, b) => (b.lastUsed?.getTime() ?? 0) - (a.lastUsed?.getTime() ?? 0));
    }
    return arr;
  }, [catalog, query, sort]);

  return (
    <div className="flex flex-col gap-3">
      <div className="glass flex items-center gap-2 rounded-full px-4 py-2.5">
        <Search size={16} className="text-[--color-fg-muted]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un exercice…"
          className="w-full bg-transparent text-sm text-[--color-fg] outline-none placeholder:text-[--color-fg-faint]"
        />
      </div>

      <div className="flex items-center gap-1.5">
        {(Object.keys(SORT_LABEL) as SortMode[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSort(s)}
            className={cn("pill transition", sort === s ? "btn-accent" : "bg-white/6")}
          >
            {SORT_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        {sorted.map((exercise) => {
          const parent = primaryParent(exercise);
          return (
            <button
              key={exercise.id}
              type="button"
              onClick={() => setEditing(exercise)}
              className="glass flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left active:scale-[0.99] transition"
            >
              {exercise.isFavorite ? (
                <Star size={14} className="shrink-0 text-amber-300" fill="currentColor" />
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[--color-fg]">{exercise.name}</span>
              {parent && <span className="pill shrink-0 bg-white/8 text-[0.65rem]">{parentShortName[parent]}</span>}
              <span className="pill shrink-0 bg-white/6 text-[0.65rem] text-[--color-fg-muted]">
                {setPatternModeShortName[exercise.setPatternMode]}
              </span>
            </button>
          );
        })}
        {sorted.length === 0 && (
          <p className="mt-4 text-center text-sm text-[--color-fg-muted]">Aucun exercice trouvé</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="btn-accent w-full py-3 text-sm"
      >
        + Nouvel exercice
      </button>

      <ExerciseEditorSheet open={editing !== null} onClose={() => setEditing(null)} exercise={editing} />
      <ExerciseEditorSheet open={creating} onClose={() => setCreating(false)} exercise={null} />
    </div>
  );
}
