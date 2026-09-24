"use client";

import {
  STRENGTH_LEVEL_KEYS,
  strengthLevelLabel,
  type BenchmarkGaugeData,
  type BenchmarkTone,
  type ExerciseBenchmark,
  type PersonalProgress,
} from "@/lib/engines/benchmark";
import { formatDerivedWeight, formatWeight } from "@/components/progress/utils";

const TONE_COLOR: Record<BenchmarkTone, string> = {
  below: "var(--color-fg-faint)",
  beginner: "var(--color-warning)",
  novice: "#eab308",
  intermediate: "#84cc16",
  advanced: "var(--color-success)",
  elite: "var(--accent)",
};

/**
 * BENCHMARK_LEVEL_SPEC.md §2 (P3.2) — décision "les deux" pour les machines (`isMachine:true`) :
 * la jauge StrengthLevel reste indicative (bandeau caveat ci-dessous), MAIS un marqueur de
 * progression personnelle (percentile de l'e1RM le plus récent dans [min,max] observé sur CET
 * exercice, `lib/engines/benchmark.ts::personalProgress`) s'affiche EN PLUS — c'est la mesure la
 * plus honnête pour une machine dont le stack ne correspond à aucun standard universel.
 *
 * OFFLINE_PWA_SPEC §5 (P4.5) — élargi au-delà des machines : ce marqueur s'affiche désormais dès
 * que `personalProgress.hasData`, QUE la jauge StrengthLevel soit affichable ou non (`hasBenchmark`
 * peut être `false` — profil non supporté, standard pas encore sourcé, ex. Ab roller debout). Ce
 * composant reste sans opinion sur le "quand" (décidé par l'appelant, `BenchmarkGauge` ci-dessous) —
 * `standalone` indique juste s'il est le SEUL contenu affiché (pas de jauge au-dessus), pour ne pas
 * dessiner une bordure de séparation flottant au-dessus de rien.
 */
function PersonalProgressMarker({ progress, standalone = false }: { progress: PersonalProgress; standalone?: boolean }) {
  if (!progress.hasData) return null;
  const clamped = Math.max(0, Math.min(1, progress.percentile));
  const sameMinMax = progress.maxE1RM <= progress.minE1RM;

  return (
    <div className={standalone ? "" : "mt-2.5 border-t border-white/8 pt-2.5"}>
      <div className="flex items-center justify-between gap-1.5">
        <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-(--color-fg-faint)">
          Progression perso · cet exercice
        </p>
        <span className="tnum text-[0.66rem] text-(--color-fg-muted)">
          {formatDerivedWeight(progress.currentE1RM, 0.1)}kg
        </span>
      </div>
      {sameMinMax ? (
        <p className="mt-1 text-[0.62rem] text-(--color-fg-faint)">Pas encore assez d&apos;historique pour situer la progression.</p>
      ) : (
        <>
          <div className="relative mt-2 h-1.5 rounded-full bg-white/10">
            <span
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
              style={{ left: `${clamped * 100}%`, background: "var(--accent)", borderColor: "var(--color-ink-950)" }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[0.58rem] text-(--color-fg-faint)">
            <span className="tnum">{formatDerivedWeight(progress.minE1RM, 0.1)}kg</span>
            <span>historique observé</span>
            <span className="tnum">{formatDerivedWeight(progress.maxE1RM, 0.1)}kg</span>
          </div>
        </>
      )}
    </div>
  );
}

function formatGaugeAmount(axis: BenchmarkGaugeData["axis"], value: number): string {
  return axis === "load" ? `${formatDerivedWeight(value, 0.1)}kg` : `${formatWeight(value)} reps`;
}

function StrengthLevelAxisGauge({
  gauge,
  profileLabel,
  secondary = false,
}: {
  gauge: BenchmarkGaugeData;
  profileLabel?: string | null;
  secondary?: boolean;
}) {
  const clamped = Math.max(0, Math.min(1, gauge.position));
  const color = TONE_COLOR[gauge.level.tone];

  return (
    <div className={secondary ? "mt-3 border-t border-white/8 pt-3" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-1.5">
        <div>
          <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-(--color-fg-faint)">
            Repère StrengthLevel · {gauge.axis === "load" ? "1RM estimé" : "répétitions"}
          </p>
          {profileLabel && (
            <p className="mt-0.5 text-[0.66rem] text-(--color-fg-faint)">{profileLabel}</p>
          )}
        </div>
        <span className="pill" style={{ color, borderColor: color }}>
          {gauge.level.label}
        </span>
      </div>

      <div className="relative mt-3 h-2 rounded-full bg-gradient-to-r from-amber-500/30 via-lime-500/35 to-violet-500/40">
        {STRENGTH_LEVEL_KEYS.map((key, index) => (
          <span
            key={key}
            className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-white/35"
            style={{ left: `${index * 25}%` }}
          />
        ))}
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{ left: `${clamped * 100}%`, background: color, borderColor: "var(--color-ink-950)" }}
        />
      </div>

      <div className="mt-1.5 grid grid-cols-5 gap-1 text-center text-[0.54rem] text-(--color-fg-faint)">
        {STRENGTH_LEVEL_KEYS.map((key) => (
          <span key={key} className="min-w-0">
            <span className="block truncate">{strengthLevelLabel(key)}</span>
            <span className="tnum block">{formatGaugeAmount(gauge.axis, gauge.thresholds[key])}</span>
          </span>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 text-xs">
        <span className="tnum text-(--color-fg-muted)">
          {gauge.axis === "load" ? "e1RM " : ""}{formatGaugeAmount(gauge.axis, gauge.currentValue)}
        </span>
        {gauge.nextLevel && (gauge.gapToNext ?? 0) > 0 && (
          <span className="text-(--color-fg-faint)">
            encore {formatGaugeAmount(gauge.axis, gauge.gapToNext!)} → {strengthLevelLabel(gauge.nextLevel).toLowerCase()}
          </span>
        )}
      </div>
    </div>
  );
}

export function BenchmarkGauge({
  benchmark,
  personalProgress,
}: {
  benchmark: ExerciseBenchmark;
  /** P3.2 — omis/`null` => pas de marqueur perso affiché (dégradation gracieuse, ex. exercice sans historique suffisant). */
  personalProgress?: PersonalProgress | null;
}) {
  // OFFLINE_PWA_SPEC §5 (P4.5) — la jauge StrengthLevel reste conditionnée à `hasBenchmark` (+ les
  // champs qu'elle affiche), mais la progression perso NE L'EST PLUS : un exercice sans standard
  // StrengthLevel fiable (Ab roller debout, profil non supporté — ex. gender!=="male", cf. P3.1) ne
  // doit plus afficher RIEN dès qu'il a un historique exploitable. `gaugeReady` narrowe les champs
  // nullable UNE fois (pas de `!` répétés plus bas) ; `null` si l'un des champs requis manque.
  const primaryGauge: BenchmarkGaugeData | null =
    benchmark.hasBenchmark &&
    benchmark.thresholds &&
    benchmark.position != null &&
    benchmark.level &&
    benchmark.source &&
    benchmark.primaryAxis
      ? {
          axis: benchmark.primaryAxis,
          currentValue: benchmark.currentE1RM,
          thresholds: benchmark.thresholds,
          position: benchmark.position,
          level: benchmark.level,
          nextLevel: benchmark.nextLevel,
          gapToNext: benchmark.gapToNext,
        }
      : null;
  const hasPersonal = personalProgress?.hasData ?? false;

  if (!primaryGauge && !hasPersonal) return null;

  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
      {primaryGauge && benchmark.source && (
        <>
          <StrengthLevelAxisGauge gauge={primaryGauge} profileLabel={benchmark.profileLabel} />
          {benchmark.secondary && <StrengthLevelAxisGauge gauge={benchmark.secondary} secondary />}

          <p className="mt-2 text-[0.62rem] leading-relaxed text-(--color-fg-faint)">
            <a href={benchmark.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {benchmark.source.title}
            </a>
            {" · "}{benchmark.source.loadConvention}.{" "}
            {benchmark.caveat ??
              (benchmark.isMachine
                ? "Comparaison indicative : la géométrie d'une machine peut changer la résistance réelle."
                : "Repère communautaire indicatif.")}
          </p>
        </>
      )}

      {hasPersonal && personalProgress && (
        <PersonalProgressMarker progress={personalProgress} standalone={!primaryGauge} />
      )}
    </div>
  );
}
