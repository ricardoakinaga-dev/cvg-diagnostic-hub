import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL é obrigatório para executar as migrations.");

const pool = new Pool({ connectionString });

function migrationVersion(filename: string): string {
  if (!/^\d+_[a-z0-9_-]+\.sql$/.test(filename)) throw new Error(`Nome de migration inválido: ${filename}`);
  return filename.slice(0, -4);
}

async function main(): Promise<void> {
  try {
    const migrationDirectory = path.resolve(process.cwd(), "db/migrations");
    const files = (await readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort((left, right) => left.localeCompare(right));
    const client = await pool.connect();
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
      const applied = new Set((await client.query<{ version: string }>("SELECT version FROM schema_migrations")).rows.map((row) => row.version));
      for (const file of files) {
        const version = migrationVersion(file);
        if (applied.has(version)) {
          console.log(`Migration ${version} já aplicada.`);
          continue;
        }
        const sql = await readFile(path.join(migrationDirectory, file), "utf8");
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
          await client.query("COMMIT");
          console.log(`Migration ${version} aplicada.`);
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
