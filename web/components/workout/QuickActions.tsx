"use client";

import { History, Plus, Sparkles } from "lucide-react";
import type { WorkoutSession, WorkoutTemplate } from "@/lib/models/types";
import type { WorkoutMode } from "@/lib/theme/modes";

function formatSessionSummary(session: WorkoutSession): string {
  const names = [...new Set(session.exercises.map((e) => e.exerciseName))];
  if (names.length === 0) return "Séance vide";
  if (names.length <= 3) return names.join(" · ");
  return `${names.slice(0, 3).join(" · ")} +${names.length - 3}`;
}

/** Actions rapides : répéter la dernière séance, templates, séance vide. */
export function QuickActions({
  lastSession,
  templates,
  recommendedTemplateId,
  mode,
  onRepeatLast,
  onStartTemplate,
  onStartEmpty,
}: {
  lastSession: WorkoutSession | undefined;
  templates: WorkoutTemplate[];
  recommendedTemplateId: string | null;
  mode: WorkoutMode;
  onRepeatLast: (mode: WorkoutMode) => void;
  onStartTemplate: (templateId: string, mode: WorkoutMode) => void;
  onStartEmpty: (mode: WorkoutMode) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {lastSession && (
        <button
          type="button"
          onClick={() => onRepeatLast(mode)}
          className="glass glass-card flex items-center gap-3 text-left active:scale-[0.98] transition"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/8">
            <History size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[--color-fg]">Répéter la dernière</p>
            <p className="truncate text-xs text-[--color-fg-muted]">{formatSessionSummary(lastSession)}</p>
          </div>
        </button>
      )}

      {templates.length > 0 && (
        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onStartTemplate(t.id, mode)}
              className="glass glass-card flex items-center gap-3 text-left active:scale-[0.98] transition"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/8">
                <Sparkles size={18} className={t.id === recommendedTemplateId ? "text-accent-gradient" : undefined} style={t.id === recommendedTemplateId ? { color: "var(--accent)" } : undefined} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-[--color-fg]">{t.name}</p>
                  {t.id === recommendedTemplateId && (
                    <span className="pill shrink-0" style={{ color: "var(--accent)" }}>
                      Recommandé
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-[--color-fg-muted]">{t.exercises.length} exercices</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onStartEmpty(mode)}
        className="glass flex items-center justify-center gap-2 rounded-2xl border-dashed py-3.5 text-sm font-semibold text-[--color-fg-muted] active:scale-[0.98] transition"
        style={{ borderStyle: "dashed" }}
      >
        <Plus size={16} />
        Séance vide
      </button>
    </div>
  );
}
