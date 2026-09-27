"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { STATUE_STATES, statue, type StatueState } from "@/lib/engines/statue";
import type { StatueView, StatueZoneLook } from "@/lib/statue/statue-view";
import { useWorkoutStore } from "@/lib/store/workout";

const MODEL_URL = "/statue/statue-v2.glb";
const LOGO_URL = "/statue/logo-v1.png";

const SWATCH: Record<StatueState, string> = { 0: "#9a6a42", 1: "#ece8e0", 2: "#c3c9d1", 3: "#e3ac45" };
const REACHED: Record<string, string> = { Marbre: "en marbre", Argent: "en argent", Or: "en or" };

/**
 * La statue d'Evan suit sa semaine : chaque muscle passe du bronze au marbre, à l'argent puis à
 * l'or avec ses séries de la semaine (`lib/engines/statue.ts`) ; le but est une statue tout en or
 * le dimanche. three.js et le modèle ne sont chargés qu'à l'affichage de la carte ; le rendu
 * s'arrête hors écran.
 */
export function StatueCard() {
  const history = useWorkoutStore((s) => s.history);
  const active = useWorkoutStore((s) => s.active);
  const catalog = useWorkoutStore((s) => s.catalog);
  const goals = useWorkoutStore((s) => s.goals);
  const result = useMemo(() => statue({ history, catalog, goals, active, now: new Date() }), [history, catalog, goals, active]);
  const looks: StatueZoneLook[] = useMemo(() => result.zones.map((zone) => ({ state: zone.state, veins: zone.veins })), [result]);

  const container = useRef<HTMLDivElement>(null);
  const view = useRef<StatueView | null>(null);
  const latest = useRef(looks);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    latest.current = looks;
    view.current?.setLooks(looks);
  }, [looks]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let cancelled = false;
    let visible = true;
    const sync = () => view.current?.setActive(visible && !document.hidden);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    intersection.observe(element);
    document.addEventListener("visibilitychange", sync);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    import("@/lib/statue/statue-view")
      .then(({ mountStatue }) => mountStatue(element, { url: MODEL_URL, logoUrl: LOGO_URL, looks: latest.current, autorotate: still ? 0 : 0.18 }))
      .then((mounted) => {
        if (cancelled) return mounted.dispose();
        view.current = mounted;
        sync();
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
      intersection.disconnect();
      document.removeEventListener("visibilitychange", sync);
      view.current?.dispose();
      view.current = null;
    };
  }, []);

  const rated = result.zones.filter((zone) => zone.coverage !== null);
  const next = result.next[0];

  return (
    <GlassCard>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Statue de la semaine</p>
        {rated.length > 0 && (
          <p className="tnum text-[0.68rem]" style={{ color: result.toGold === 0 ? SWATCH[3] : "var(--color-fg-faint)" }}>
            {result.toGold === 0 ? "tout en or" : `${result.toGold} séries pour l'or`}
          </p>
        )}
      </div>

      {status !== "failed" && (
        <div ref={container} className="relative mx-auto mt-1 h-[340px] w-full max-w-[320px]" aria-label="Ta statue, qui tourne lentement">
          {status === "loading" && (
            <p className="absolute inset-0 grid place-items-center text-[0.7rem] text-(--color-fg-faint)">Coulée de la statue…</p>
          )}
        </div>
      )}

      <ul className="mt-2 space-y-1 text-[0.72rem] leading-snug">
        {[...STATUE_STATES].reverse().map(({ state, label }) => {
          const zones = rated.filter((zone) => zone.state === state);
          return (
            <li key={state} className="flex items-start gap-2">
              <span aria-hidden className="mt-[3px] size-2.5 shrink-0 rounded-full" style={{ background: SWATCH[state] }} />
              <span className="w-14 shrink-0 font-semibold text-(--color-fg)">{label}</span>
              <span className={zones.length > 0 ? "text-(--color-fg-muted)" : "text-(--color-fg-faint)"}>
                {zones.length > 0 ? zones.map((zone) => zone.label).join(", ") : "aucun muscle"}
              </span>
            </li>
          );
        })}
      </ul>

      {next && (
        <p className="mt-2 flex items-start gap-1.5 text-[0.72rem] leading-snug text-(--color-fg)">
          <ArrowUpRight size={13} className="mt-px shrink-0 text-(--accent)" />
          <span>
            Pour monter : {next.label} {REACHED[next.to]}, encore {next.sets} série{next.sets > 1 ? "s" : ""} cette semaine.
          </span>
        </p>
      )}
      <p className="mt-1.5 text-[0.66rem] leading-snug text-(--color-fg-faint)">
        Chaque muscle passe en marbre au tiers de son objectif de séries de la semaine, en argent aux deux tiers, en or à l&apos;objectif ;
        à mi-chemin, les veines du palier suivant apparaissent. La tête et le socle suivent ton muscle le plus faible. Tout repart du bronze
        lundi. Glisse pour la tourner.
      </p>
    </GlassCard>
  );
}
