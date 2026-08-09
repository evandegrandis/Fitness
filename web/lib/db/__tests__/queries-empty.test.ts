import { describe, expect, it } from "vitest";

import {
  ACTIVE_SESSION_RESTORE_WINDOW_MS,
  emptyAllData,
  isEmptyAllData,
  isRestorableActiveSessionStart,
} from "../queries";
import type { AllData } from "../queries";

// OFFLINE_PWA_SPEC §3 (P4.2) — `emptyAllData`/`isEmptyAllData` sont purs (aucun accès `db`), donc
// testables sans mock ni DATABASE_URL : couvrent la forme partagée entre "pas de base configurée"
// et "Neon injoignable" (`lib/data/index.ts::getInitialData`).

describe("emptyAllData / isEmptyAllData (OFFLINE_PWA_SPEC §3, P4.2)", () => {
  it("emptyAllData() est reconnue comme vide", () => {
    expect(isEmptyAllData(emptyAllData())).toBe(true);
  });

  it("une réponse avec au moins un exercice n'est pas vide", () => {
    const data: AllData = {
      ...emptyAllData(),
      exercises: [
        {
          id: "ex-1",
          name: "Développé couché",
          category: "push",
          setPatternMode: "straight",
          repTargetMin: 6,
          repTargetMax: 10,
          smallestIncrement: 2.5,
          isFavorite: false,
          createdByUser: false,
          sortOrder: 0,
          suggestedRestSeconds: 120,
          machineSetting: "",
          setupNotes: "",
          benchmarkLow: null,
          benchmarkHigh: null,
          fatigueClass: "heavy",
          progressionPolicy: null,
          voluntaryRepCap: 0,
          muscleMappings: [],
          lastUsed: null,
          movementPattern: null,
          resistanceProfile: null,
          strengthStandardKey: null,
          benchmarkUnit: null,
        },
      ],
    };
    expect(isEmptyAllData(data)).toBe(false);
  });

  it("une réponse avec seulement une séance active n'est pas vide", () => {
    const session = {
      id: "active-1",
      date: new Date("2026-08-09T18:00:00.000Z"),
      startTime: new Date("2026-08-09T18:00:00.000Z"),
      endTime: null,
      notes: "",
      isActive: true,
      templateName: null,
      exercises: [],
      supersetGroups: [],
      cardioEntries: [],
    };
    expect(isEmptyAllData({ ...emptyAllData(), activeSession: session })).toBe(false);
  });

  it("une réponse avec seulement des settings non-défaut mais aucune donnée en tableau reste vide (settings seul ne suffit pas)", () => {
    const data: AllData = { ...emptyAllData(), settings: { ...emptyAllData().settings, userName: "Evan" } };
    expect(isEmptyAllData(data)).toBe(true);
  });
});

describe("active session restore horizon", () => {
  const now = new Date("2026-08-09T18:00:00.000Z");

  it("restaure une active commencée dans les dernières 36 h, borne incluse", () => {
    expect(isRestorableActiveSessionStart(new Date(now.getTime() - 60_000), now)).toBe(true);
    expect(
      isRestorableActiveSessionStart(
        new Date(now.getTime() - ACTIVE_SESSION_RESTORE_WINDOW_MS),
        now
      )
    ).toBe(true);
  });

  it("ignore une ancienne ligne active orpheline sans la supprimer", () => {
    expect(
      isRestorableActiveSessionStart(
        new Date(now.getTime() - ACTIVE_SESSION_RESTORE_WINDOW_MS - 1),
        now
      )
    ).toBe(false);
  });
});
