"use client";

import { HeartPulse, History, Plus, Sparkles } from "lucide-react";
import type { WorkoutSession, WorkoutTemplate } from "@/lib/models/types";
import type { HabitualSessionPlan } from "@/lib/engines/habitual-session";
import { shortExerciseName } from "@/lib/engines/session-insights";

function formatSessionSummary(session: WorkoutSession): string {
  const names = [...new Set(session.exercises.map((e) => e.exerciseName))];
  if (names.length === 0) return "Séance vide";
  if (names.length <= 3) return names.join(" · ");
  return `${names.slice(0, 3).join(" · ")} +${names.length - 3}`;
}

/**
 * Actions rapides de l'accueil. Le template recommandé est l'action PRIMAIRE
 * (carte mise en avant, halo d'accent) ; répéter la dernière séance et
 * démarrer à vide restent disponibles mais en retrait.
 *
 * Les séances démarrent toujours en mode "normal" — le choix de mode a été
 * retiré de l'accueil.
 */
export function QuickActions({
  lastSession,
  templates,
  recommendedTemplateId,
  habitual,
  onRepeatLast,
  onStartTemplate,
  onStartHabitual,
  onStartEmpty,
  onStartCardio,
  cardioHint,
}: {
  lastSession: WorkoutSession | undefined;
  templates: WorkoutTemplate[];
  /** Modèle mis en avant ; `null` quand la « Séance du jour » passe devant. */
  recommendedTemplateId: string | null;
  /** « Séance du jour » (habitudes récentes + déficits), proposée en premier quand présente. */
  habitual: { plan: HabitualSessionPlan; summary: string } | null;
  onRepeatLast: (mode: "normal") => void;
  onStartTemplate: (templateId: string, mode: "normal") => void;
  onStartHabitual: (mode: "normal") => void;
  onStartEmpty: (mode: "normal") => void;
  onStartCardio: () => void;
  /** Rappel de l'objectif hebdo — affiché sur le bouton, pas dans un écran séparé. */
  cardioHint: string;
}) {
  const recommended = templates.find((t) => t.id === recommendedTemplateId);
  const otherTemplates = templates.filter((t) => t.id !== recommendedTemplateId);

  return (
    <div className="flex flex-col gap-4">
      {habitual && (
        <button
          type="button"
          onClick={() => onStartHabitual("normal")}
          className="glass glass-strong glass-card relative flex items-start gap-3.5 rounded-2xl py-5 text-left transition active:scale-[0.98]"
          style={{
            boxShadow: "0 0 0 1.5px var(--accent), 0 14px 34px color-mix(in srgb, var(--accent) 28%, transparent)",
          }}
        >
          <div
            className="mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)" }}
          >
            <Sparkles size={22} style={{ color: "var(--accent)" }} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="pill" style={{ color: "var(--accent)", borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)" }}>
              Recommandé
            </span>
            <p className="mt-1 font-display text-lg font-semibold text-(--color-fg)">Séance du jour</p>
            <p className="text-xs leading-snug text-(--color-fg-muted)">{habitual.summary}</p>
            <p className="mt-1.5 line-clamp-2 text-[0.7rem] leading-snug text-(--color-fg-faint)">
              {habitual.plan.exercises.map((exercise) => `${shortExerciseName(exercise.exerciseName)} ×${exercise.targetSets}`).join(" · ")}
            </p>
          </div>
        </button>
      )}

      {!habitual && recommended && (
        <button
          type="button"
          onClick={() => onStartTemplate(recommended.id, "normal")}
          className="glass glass-strong glass-card relative flex items-center gap-3.5 rounded-2xl py-5 text-left transition active:scale-[0.98]"
          style={{
            boxShadow: "0 0 0 1.5px var(--accent), 0 14px 34px color-mix(in srgb, var(--accent) 28%, transparent)",
          }}
        >
          <div
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)" }}
          >
            <Sparkles size={22} style={{ color: "var(--accent)" }} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="pill" style={{ color: "var(--accent)", borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)" }}>
              Recommandé
            </span>
            <p className="mt-1 truncate font-display text-lg font-semibold text-(--color-fg)">{recommended.name}</p>
            <p className="truncate text-xs text-(--color-fg-muted)">{recommended.exercises.length} exercices</p>
          </div>
        </button>
      )}

      <div className="flex flex-col gap-2">
        {(habitual ? templates : otherTemplates).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onStartTemplate(t.id, "normal")}
            className="glass glass-card flex items-center gap-3 text-left opacity-80 transition active:scale-[0.98]"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/8">
              <Sparkles size={16} className="text-(--color-fg-muted)" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-(--color-fg)">{t.name}</p>
              <p className="truncate text-xs text-(--color-fg-muted)">{t.exercises.length} exercices</p>
            </div>
          </button>
        ))}

        {lastSession && (
          <button
            type="button"
            onClick={() => onRepeatLast("normal")}
            className="glass glass-card flex items-center gap-3 text-left opacity-80 transition active:scale-[0.98]"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/8">
              <History size={16} className="text-(--color-fg-muted)" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-(--color-fg)">Répéter la dernière</p>
              <p className="truncate text-xs text-(--color-fg-muted)">{formatSessionSummary(lastSession)}</p>
            </div>
          </button>
        )}

        <button
          type="button"
          onClick={onStartCardio}
          className="glass glass-card flex items-center gap-3 text-left transition active:scale-[0.98]"
          style={{ borderColor: "rgba(110,231,183,0.28)" }}
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: "rgba(110,231,183,0.14)" }}>
            <HeartPulse size={16} style={{ color: "rgb(110,231,183)" }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-(--color-fg)">Séance cardio</p>
            <p className="truncate text-xs text-(--color-fg-muted)">{cardioHint}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onStartEmpty("normal")}
          className="glass flex items-center justify-center gap-2 rounded-2xl border-dashed py-3 text-sm font-semibold text-(--color-fg-muted) opacity-80 transition active:scale-[0.98]"
          style={{ borderStyle: "dashed" }}
        >
          <Plus size={16} />
          Séance vide
        </button>
      </div>
    </div>
  );
}
