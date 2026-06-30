import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationDir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(migrationDir)
  .filter((name) => name.endsWith(".sql"))
  .filter((name) => name >= "20260600000000")
  .sort();

const destructiveStatement = /^\s*(drop|delete|truncate|reset)\b/im;
const alterDrop = /^\s*alter\s+table\b.*\bdrop\b/im;

let failed = false;

for (const file of files) {
  const path = join(migrationDir, file);
  const text = readFileSync(path, "utf8");
  const destructive = destructiveStatement.test(text);
  const dropAlter = alterDrop.test(text);
  if (destructive || dropAlter) {
    failed = true;
    console.error(`[migration-safety] blocked ${file}`);
    if (destructive) console.error("  - contains a DROP/DELETE/TRUNCATE/RESET statement");
    if (dropAlter) console.error("  - contains ALTER TABLE ... DROP");
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`[migration-safety] passed ${files.length} migration files`);
}
