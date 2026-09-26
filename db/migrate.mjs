// Applies db/migrations/*.sql in order, once each. Usage: pnpm db:migrate
// Reads DATABASE_URL from the environment or apps/web/.env.local.
import { neon } from "@neondatabase/serverless";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const envFile = join(root, "../apps/web/.env.local");
if (!process.env.DATABASE_URL && existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?\s*$/);
    if (m) process.env.DATABASE_URL = m[1];
  }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (env or apps/web/.env.local).");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
const applied = new Set((await sql`select name from schema_migrations`).map((r) => r.name));

const dir = join(root, "migrations");
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (applied.has(file)) continue;
  const statements = readFileSync(join(dir, file), "utf8")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  await sql.transaction([...statements.map((s) => sql.query(s)), sql`insert into schema_migrations (name) values (${file})`]);
  console.log(`applied ${file}`);
}
console.log("database is up to date");
