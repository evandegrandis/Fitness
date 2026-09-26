import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Aucune PR ne peut effacer des données existantes (Evan, 26/09/2026, DATA_SAFETY.md).
 *
 * Ce test tourne avec `npm test`, donc dans les contrôles de chaque PR, qu'elle vienne d'un
 * agent ou d'un humain. Il refuse :
 * - une migration postérieure à 0016 qui efface ou réécrit des données (DROP, TRUNCATE, DELETE,
 *   UPDATE, changement de type, trigger coupé) sans la ligne `-- destructive-ok: <raison>`,
 *   que seul Evan peut décider d'ajouter ;
 * - du code applicatif qui vide une table, coupe un trigger ou écrit dans `row_history`.
 */

const WEB = join(__dirname, "..", "..", "..");
const BASELINE_MIGRATION = 16;

const DESTRUCTIVE_SQL = [
  /\bDROP\s+(TABLE|COLUMN|SCHEMA|TRIGGER|FUNCTION|VIEW)\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bUPDATE\s+("?\w+"?\.)?"?\w+"?\s+SET\b/i,
  /\bALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/i,
  /\bDISABLE\s+TRIGGER\b/i,
];

const FORBIDDEN_CODE = [
  /\bTRUNCATE\b/,
  /\bDISABLE\s+TRIGGER\b/i,
  /\bDROP\s+(TABLE|TRIGGER|FUNCTION)\b/i,
  /session_replication_role/,
  /(INSERT\s+INTO|DELETE\s+FROM|UPDATE)\s+"?row_history\b/i,
  /db\s*\.\s*(insert|update|delete)\s*\(\s*rowHistory\b/,
];

function files(dir: string, keep: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path, keep));
    else if (keep(path)) out.push(path);
  }
  return out;
}

describe("garde-fous de données", () => {
  it("aucune migration récente n'efface de données sans décision explicite", () => {
    const offenders: string[] = [];
    for (const name of readdirSync(join(WEB, "drizzle")).filter((file) => file.endsWith(".sql")).sort()) {
      if (Number(name.slice(0, 4)) <= BASELINE_MIGRATION) continue;
      const statements = readFileSync(join(WEB, "drizzle", name), "utf8").split("--> statement-breakpoint");
      for (const statement of statements) {
        if (/--\s*destructive-ok:\s*\S/.test(statement)) continue;
        const hit = DESTRUCTIVE_SQL.find((pattern) => pattern.test(statement));
        if (hit) offenders.push(`${name} : ${statement.trim().split("\n")[0]}`);
      }
    }
    expect(offenders, "Migration destructive : ajouter `-- destructive-ok: <raison>` exige l'accord d'Evan (DATA_SAFETY.md).").toEqual([]);
  });

  it("aucun code ne vide une table, ne coupe un trigger ni n'écrit dans le journal", () => {
    const sources = ["app", "lib", "components", "scripts"].flatMap((dir) =>
      files(join(WEB, dir), (path) => /\.(ts|tsx|mjs|js)$/.test(path) && !path.includes("__tests__") && !/\.test\.tsx?$/.test(path)),
    );
    const offenders = sources.flatMap((path) => {
      const text = readFileSync(path, "utf8");
      return FORBIDDEN_CODE.filter((pattern) => pattern.test(text)).map((pattern) => `${relative(WEB, path)} : ${pattern}`);
    });
    expect(offenders).toEqual([]);
  });

  it("la migration des garde-fous est bien celle qui pose triggers et journal", () => {
    const migration = readFileSync(join(WEB, "drizzle", "0016_data_safety.sql"), "utf8");
    expect(migration).toContain("jeera_touch_updated_at");
    expect(migration).toContain("jeera_keep_row_history");
    expect(migration).toContain("jeera_refuse_truncate");
  });
});
