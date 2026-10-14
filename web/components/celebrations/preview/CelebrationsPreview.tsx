"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SECRETS } from "@/lib/engines/career-secrets";
import type { RankInput } from "@/lib/engines/session-rank";
import type { Career, CareerSession } from "@/lib/engines/career";
import { StreakStrip } from "../BilanCelebrations";
import { CelebrationHost } from "../CelebrationHost";
import { StreakSCard } from "../StreakSCard";
import { LiveRankRow, useSessionCelebrations } from "../LiveRankRow";
import { celebrate, type CelebrationEvent } from "../store";

/** `rank-S`, `near-A-1`, `near-S-r`, `beaten-3`, `streak-7`, `secret-<id>`. */
export function parsePlay(play: string): CelebrationEvent | null {
  const [kind, a, b] = play.split("-");
  if (kind === "rank" && (a === "B" || a === "A" || a === "S")) return { kind: "rank-up", letter: a };
  if (kind === "near" && (a === "B" || a === "A" || a === "S")) {
    return b === "r" ? { kind: "near-rank", letter: a, sets: null, records: 1, fraction: 0.8 } : { kind: "near-rank", letter: a, sets: Number(b), records: Number(b) === 2 ? 1 : null, fraction: Number(b) === 1 ? 0.86 : 0.7 };
  }
  if (kind === "beaten") return { kind: "beaten", combo: Number(a) };
  if (kind === "streak") return { kind: "streak", count: Number(a) };
  if (kind === "secret") {
    const id = play.slice("secret-".length);
    const secret = SECRETS.find((candidate) => candidate.id === id);
    return secret ? { kind: "secret", id: secret.id, title: secret.title, description: secret.description } : null;
  }
  return null;
}

/** Un parcours factice pour la carte de Progrès : 14 séances, les 3 dernières au rang S. */
const FAKE_CAREER: Career = (() => {
  const letters = "BACSSSABASBASSS".split("") as Array<"S" | "A" | "B" | "C">;
  const bySession = new Map<string, CareerSession>();
  let run = 0;
  letters.forEach((letter, index) => {
    run = letter === "S" ? run + 1 : 0;
    bySession.set(`s${index}`, { sessionId: `s${index}`, rank: { letter, score: 0, sets: 0, records: 0, cut: false, rated: 0, performed: 0, held: 0 }, sStreak: run, unlocks: [] });
  });
  return { bySession, milestones: [], secrets: [], sStreak: { current: 3, best: 3 } };
})();

const STREAKS = [...Array.from({ length: 50 }, (_, index) => index + 1), 51, 55, 60];

/**
 * Écran d'aperçu (développement) : chaque mise en scène d'un tap, et un simulateur de séance qui
 * passe par le vrai chemin (`useSessionCelebrations`) pour voir l'approche et le passage de rang.
 */
export function CelebrationsPreview({ play, showSecrets }: { play: string | null; showSecrets: boolean }) {
  useEffect(() => {
    // Crochet des captures automatiques (`captures/shoot.mjs`) : joue une scène par son nom.
    (window as unknown as { __jeeraCelebrate?: (name: string) => boolean }).__jeeraCelebrate = (name) => {
      const event = parsePlay(name);
      if (event) celebrate(event);
      return event !== null;
    };
  }, []);
  useEffect(() => {
    if (!play) return;
    const event = parsePlay(play);
    if (!event) return;
    const id = setTimeout(() => celebrate(event), 500);
    return () => clearTimeout(id);
  }, [play]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-28 pt-6">
      <header>
        <p className="eyebrow">Développement</p>
        <h1 className="font-display text-2xl font-bold">Célébrations</h1>
        <p className="mt-1 text-sm text-(--color-fg-muted)">Chaque scène d&apos;un tap. Rien n&apos;est enregistré.</p>
      </header>
      <SessionSimulator />
      <section className="space-y-3" id="bilan-progres">
        <p className="eyebrow">Bilan : bandeau de série</p>
        <StreakStrip count={3} broken={0} best={4} />
        <StreakStrip count={0} broken={4} best={4} />
        <p className="eyebrow pt-2">Progrès › Semaine</p>
        <StreakSCard career={FAKE_CAREER} />
      </section>
      <Group title="Passage de rang (en séance)">
        {(["B", "A", "S"] as const).map((letter) => (
          <Play key={letter} event={{ kind: "rank-up", letter }}>
            {letter}
          </Play>
        ))}
      </Group>
      <Group title="Bandeaux (en séance)">
        <Play event={parsePlay("near-A-2")!}>A à 2 séries</Play>
        <Play event={parsePlay("near-A-1")!}>A à 1 série</Play>
        <Play event={parsePlay("near-S-r")!}>S à 1 record</Play>
        {[1, 2, 3, 4, 5, 7].map((combo) => (
          <Play key={combo} event={{ kind: "beaten", combo }}>
            {combo === 1 ? "Battue" : `×${combo}`}
          </Play>
        ))}
      </Group>
      <Group title="Série de S (bilan)">
        {STREAKS.map((count) => (
          <Play key={count} event={{ kind: "streak", count }}>
            {count}
          </Play>
        ))}
      </Group>
      {showSecrets && (
        <Group title="Secrets">
          {SECRETS.map((secret) => (
            <Play key={secret.id} event={{ kind: "secret", id: secret.id, title: secret.title, description: secret.description }}>
              {secret.id}
            </Play>
          ))}
        </Group>
      )}
      <CelebrationHost />
    </main>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass glass-card">
      <p className="eyebrow">{title}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">{children}</div>
    </section>
  );
}

function Play({ event, children }: { event: CelebrationEvent; children: ReactNode }) {
  return (
    <button type="button" onClick={() => celebrate(event)} className="pill !text-(--color-fg) active:scale-95">
      {children}
    </button>
  );
}

/** Une séance factice : séries, suggestions battues, records, et le vrai chemin des célébrations. */
function SessionSimulator() {
  const [sets, setSets] = useState(8);
  const [records, setRecords] = useState(0);
  const [beaten, setBeaten] = useState(0);
  const [combo, setCombo] = useState(0);
  const [run, setRun] = useState(0);
  const input = useMemo<RankInput>(() => ({ sets, records, cut: false, recordsPossible: true }), [sets, records]);
  const game = useMemo(() => ({ beaten, combo }), [beaten, combo]);
  useSessionCelebrations(`apercu-${run}`, input, game);
  return (
    <section className="glass glass-strong glass-card">
      <div className="flex items-center justify-between">
        <p className="tnum font-display text-2xl font-bold">42:17</p>
        <span className="text-xs text-(--color-fg-muted)">
          {sets} séries · {beaten} battue{beaten > 1 ? "s" : ""}
        </span>
      </div>
      <LiveRankRow input={input} />
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-3">
        <button type="button" className="pill !text-(--color-fg)" onClick={() => setSets((value) => value + 1)}>
          + série tenue
        </button>
        <button type="button" className="pill !text-(--color-fg)" onClick={() => { setSets((value) => value + 1); setBeaten((value) => value + 1); setCombo((value) => value + 1); }}>
          + série battue
        </button>
        <button type="button" className="pill !text-(--color-fg)" onClick={() => { setSets((value) => value + 1); setCombo(0); }}>
          + série en dessous
        </button>
        <button type="button" className="pill !text-(--color-fg)" onClick={() => { setSets((value) => value + 1); setRecords((value) => value + 1); setBeaten((value) => value + 1); setCombo((value) => value + 1); }}>
          + record
        </button>
        <button type="button" className="pill" onClick={() => { setSets(8); setRecords(0); setBeaten(0); setCombo(0); setRun((value) => value + 1); }}>
          Remettre à zéro
        </button>
      </div>
    </section>
  );
}
