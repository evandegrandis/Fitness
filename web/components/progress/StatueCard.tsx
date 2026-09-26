"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { STATUE, STATUE_STATES, statue, type StatueNext, type StatueState } from "@/lib/engines/statue";
import type { StatueView } from "@/lib/statue/statue-view";
import { useWorkoutStore } from "@/lib/store/workout";

const MODEL_URL = "/statue/statue-v1.glb";
const LOGO_URL = "/statue/logo-v1.png";

const SWATCH: Record<StatueState, string> = { 0: "#6f6a62", 1: "#b3aea5", 2: "#ece8e0", 3: "#e0a94a" };
const REACHED: Record<string, string> = { Taillé: "au marbre taillé", Poli: "au marbre poli", Or: "aux veines d'or" };

const reach = (next: StatueNext) => `${next.label} ${REACHED[next.to]}`;

/**
 * La statue d'Evan en marbre : chaque zone musculaire se taille avec son volume des 8 dernières
 * semaines (`lib/engines/statue.ts`). three.js et le modèle ne sont chargés qu'à l'affichage de la
 * carte ; le rendu s'arrête hors écran.
 */
export function StatueCard() {
  const history = useWorkoutStore((s) => s.history);
  const catalog = useWorkoutStore((s) => s.catalog);
  const goals = useWorkoutStore((s) => s.goals);
  const result = useMemo(() => statue({ history, catalog, goals, now: new Date() }), [history, catalog, goals]);

  const container = useRef<HTMLDivElement>(null);
  const view = useRef<StatueView | null>(null);
  const levels = useRef(result.levels);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    levels.current = result.levels;
    view.current?.setLevels(result.levels);
  }, [result.levels]);

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
      .then(({ mountStatue }) => mountStatue(element, { url: MODEL_URL, logoUrl: LOGO_URL, levels: levels.current, autorotate: still ? 0 : 0.18 }))
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
  const acquired = result.next.filter((entry) => entry.sets === 0).slice(0, 2);
  const pending = result.next.find((entry) => entry.sets > 0);
  const [honed, polished, gold] = STATUE_STATES.slice(1).map((entry) => Math.round(entry.min * 100));

  return (
    <GlassCard>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Statue</p>
        <p className="tnum text-[0.68rem] text-(--color-fg-faint)">{STATUE.WEEKS} semaines</p>
      </div>

      {status !== "failed" && (
        <div ref={container} className="relative mx-auto mt-1 h-[340px] w-full max-w-[320px]" aria-label="Ta statue en marbre, qui tourne lentement">
          {status === "loading" && (
            <p className="absolute inset-0 grid place-items-center text-[0.7rem] text-(--color-fg-faint)">Taille du marbre…</p>
          )}
        </div>
      )}

      <ul className="mt-2 space-y-1 text-[0.72rem] leading-snug">
        {[...STATUE_STATES].reverse().map(({ state, label }) => {
          const zones = rated.filter((zone) => zone.state === state);
          return (
            <li key={state} className="flex items-start gap-2">
              <span aria-hidden className="mt-[3px] size-2.5 shrink-0 rounded-full" style={{ background: SWATCH[state] }} />
              <span className="w-12 shrink-0 font-semibold text-(--color-fg)">{label}</span>
              <span className={zones.length > 0 ? "text-(--color-fg-muted)" : "text-(--color-fg-faint)"}>
                {zones.length > 0 ? zones.map((zone) => zone.label).join(", ") : "aucune zone"}
              </span>
            </li>
          );
        })}
      </ul>

      {acquired.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-[0.72rem] leading-snug text-(--color-fg)">
          <Check size={13} className="mt-px shrink-0 text-(--color-success)" />
          <span>Acquis pour lundi : {acquired.map(reach).join(", ")}.</span>
        </p>
      )}
      {pending && (
        <p className="mt-2 flex items-start gap-1.5 text-[0.72rem] leading-snug text-(--color-fg)">
          <ArrowUpRight size={13} className="mt-px shrink-0 text-(--accent)" />
          <span>
            Pour monter : {reach(pending)} lundi, avec encore {pending.sets} série{pending.sets > 1 ? "s" : ""} cette semaine.
          </span>
        </p>
      )}
      <p className="mt-1.5 text-[0.66rem] leading-snug text-(--color-fg-faint)">
        Chaque zone se taille avec la part de ton objectif atteinte sur {STATUE.WEEKS} semaines : taillée dès {honed} %, polie dès{" "}
        {polished} %, veinée d&apos;or dès {gold} %, comme les paliers de la semaine. Glisse pour la tourner.
      </p>
    </GlassCard>
  );
}
