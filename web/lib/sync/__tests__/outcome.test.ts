import { describe, expect, it } from "vitest";

import { classifySyncError } from "../outcome";

describe("classifySyncError", () => {
  it("une violation d'intégrité Postgres est permanente, avec son détail", () => {
    const error = Object.assign(new Error('insert or update on table "logged_exercises" violates foreign key constraint'), {
      code: "23503",
      detail: "Key (exercise_id)=(983d7f92) is not present in table \"exercises\".",
    });
    expect(classifySyncError(error)).toEqual({
      ok: false, kind: "permanent", code: "23503",
      message: 'insert or update on table "logged_exercises" violates foreign key constraint (Key (exercise_id)=(983d7f92) is not present in table "exercises".)',
    });
  });

  it("une contrainte CHECK ou une donnée mal typée sont permanentes", () => {
    expect(classifySyncError(Object.assign(new Error("check"), { code: "23514" })).kind).toBe("permanent");
    expect(classifySyncError(Object.assign(new Error("type"), { code: "22P02" })).kind).toBe("permanent");
    expect(classifySyncError(Object.assign(new Error("column"), { code: "42703" })).kind).toBe("permanent");
  });

  it("le réseau, Neon indisponible ou une erreur inconnue restent transitoires", () => {
    expect(classifySyncError(new Error("fetch failed")).kind).toBe("transient");
    expect(classifySyncError(Object.assign(new Error("too many connections"), { code: "53300" })).kind).toBe("transient");
    expect(classifySyncError("chaîne").kind).toBe("transient");
  });

  it("une erreur métier déterministe est permanente même sans code SQL", () => {
    const error = new Error("exercice référencé");
    error.name = "PermanentMutationError";
    expect(classifySyncError(error)).toMatchObject({ kind: "permanent", code: "permanent_mutation" });
  });

  it("lit le code porté par la cause imbriquée", () => {
    const error = new Error("wrapper", { cause: Object.assign(new Error("inner"), { code: "23505" }) });
    expect(classifySyncError(error)).toMatchObject({ kind: "permanent", code: "23505" });
  });
});
