import { describe, expect, it } from "vitest";
import { habitualSupersetPairs, supersetPairKey } from "@/lib/engines/superset-habits";
import {
  CURL_SUP,
  EXTENSION,
  HISTORY_AFTER_1510,
  HISTORY_BEFORE_1510,
  LATERAL,
  PREACHER,
  S0610,
  S1310,
  TIRAGE,
  WIDE,
  fixtureSession,
} from "./superset-habits.fixtures";

const keys = (history: Parameters<typeof habitualSupersetPairs>[0], iso: string) =>
  habitualSupersetPairs(history, new Date(iso)).map((pair) => supersetPairKey(...pair.exerciseIds));

describe("supersets habituels : ses vraies paires (base, 05 au 15/10/2026)", () => {
  it("avant le 13/10, une seule séance liée ne suffit pas : rien ne se lie", () => {
    expect(keys([S0610], "2026-10-13T17:00:00Z")).toEqual([]);
  });

  it("le 15/10, Wide Chest Press + Lateral raises (liés les 06 et 13/10) se lient tout seuls", () => {
    const pairs = habitualSupersetPairs(HISTORY_BEFORE_1510, new Date("2026-10-15T17:05:00Z"));
    expect(pairs.map((pair) => supersetPairKey(...pair.exerciseIds))).toEqual([supersetPairKey(WIDE.id, LATERAL.id)]);
    expect(pairs[0].linkedSessions).toBe(2);
  });

  it("une paire liée une seule fois ne se lie pas : Wide + Preacher, Extension + Tirage, Extension + Curl supination", () => {
    const after = keys(HISTORY_AFTER_1510, "2026-10-17T16:00:00Z");
    expect(after).toEqual([supersetPairKey(LATERAL.id, WIDE.id)]);
    expect(after).not.toContain(supersetPairKey(WIDE.id, PREACHER.id));
    expect(after).not.toContain(supersetPairKey(EXTENSION.id, TIRAGE.id));
    expect(after).not.toContain(supersetPairKey(EXTENSION.id, CURL_SUP.id));
  });

  it("Extension + Curl supination se lie dès qu'il l'a lié une seconde fois", () => {
    const again = fixtureSession("2026-10-17T16:00:00Z", [EXTENSION, CURL_SUP, WIDE, LATERAL], [[EXTENSION, CURL_SUP], [WIDE, LATERAL]]);
    expect(keys([again, ...HISTORY_AFTER_1510], "2026-10-19T16:00:00Z")).toEqual(
      expect.arrayContaining([supersetPairKey(EXTENSION.id, CURL_SUP.id), supersetPairKey(WIDE.id, LATERAL.id)])
    );
  });

  it("une alternance non liée ne compte pas comme un lien (05/10)", () => {
    const pairs = habitualSupersetPairs(HISTORY_BEFORE_1510, new Date("2026-10-15T17:05:00Z"));
    expect(pairs[0].linkedSessions).toBe(2); // 06 et 13/10, pas le 05/10
  });

  it("s'il fait les deux sans les lier, la paire cesse de se lier toute seule", () => {
    const apart = fixtureSession("2026-10-17T16:00:00Z", [WIDE, LATERAL, PREACHER]);
    expect(keys([apart, ...HISTORY_AFTER_1510], "2026-10-19T16:00:00Z")).toEqual([]);
  });

  it("au-delà de 28 jours, les liens sont oubliés", () => {
    expect(keys([S1310, S0610], "2026-11-04T17:00:00Z")).toEqual([]);
  });
});
