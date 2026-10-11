/**
 * Export LECTURE SEULE des données pour l'audit des suggestions (voir `web/SUGGESTIONS.md`).
 *
 * N'utilise JAMAIS le `.env` du projet (base de production en écriture) : l'URL vient de la variable
 * `JEERA_READONLY_DATABASE_URL`, celle du rôle Neon en lecture seule `barbis_backup` :
 *   JEERA_READONLY_DATABASE_URL="$(security find-generic-password -s jeera-backup-database-url -w)" \
 *     npx tsx scripts/suggestions-audit/export-data.ts ~/.local/share/jeera-audit/export.json
 * La sortie contient toutes les séances : elle est refusée à l'intérieur du dépôt, jamais commitée.
 */
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function insideRepo(path: string): boolean {
  let dir = dirname(resolve(path));
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, ".git"))) return true;
    dir = dirname(dir);
  }
  return false;
}

async function main() {
  const out = process.argv[2];
  const url = process.env.JEERA_READONLY_DATABASE_URL;
  if (!out || !url) {
    console.error("usage : JEERA_READONLY_DATABASE_URL=... export-data.ts <sortie.json> (hors du dépôt)");
    process.exit(1);
  }
  if (insideRepo(out)) {
    console.error("export-data.ts : la sortie contient des données personnelles, elle doit être écrite hors du dépôt.");
    process.exit(1);
  }
  process.env.DATABASE_URL = url;
  const { getAllData } = await import("@/lib/db/queries");
  const data = await getAllData();
  writeFileSync(out, JSON.stringify(data));
  console.log(`séances=${data.sessions.length} exercices=${data.exercises.length} → ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
