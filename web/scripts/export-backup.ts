/**
 * Export LECTURE SEULE de la base vers `data/backups/db-export-<iso>.json`.
 *
 * Sûr à lancer sur la prod : ne fait QUE des SELECT (aucun write, aucun reset).
 * Usage : `npx tsx scripts/export-backup.ts`
 *
 * But : figer l'historique de séances sur disque ("hardcode") pour qu'un
 * incident de type wipe ne puisse plus jamais faire perdre de données —
 * chaque export est une sauvegarde complète et datée.
 */

import "dotenv/config";
import { dumpAllTables, writeBackupFile } from "./_safety";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("export-backup: DATABASE_URL absent — rien à exporter.");
    process.exit(1);
  }
  console.log("Export (lecture seule) de la base → data/backups/ ...");
  const data = await dumpAllTables();
  const file = writeBackupFile(data, "db-export");
  const counts = Object.entries(data)
    .map(([k, v]) => `${k}=${v.length}`)
    .join(", ");
  console.log(`\n✅ Export écrit : ${file}`);
  console.log(`   ${counts}`);
}

main().catch((error) => {
  console.error("\nexport-backup: échec —", error);
  process.exit(1);
});
