import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";
import { applyMigrations } from "../src/server/store/migrations";

interface RunMigrationsOptions {
  readonly connectionString: string;
  readonly migrationDirectory?: string;
  readonly logger?: { info(message: string): void };
}

export async function runMigrations(options: RunMigrationsOptions): Promise<void> {
  const pool = new Pool({ connectionString: options.connectionString });
  try {
    const client = await pool.connect();
    try {
      await applyMigrations(
        { query: (text, values) => client.query(text, values) },
        {
          migrationDirectory: options.migrationDirectory ?? path.resolve(process.cwd(), "db/migrations"),
          logger: options.logger
        }
      );
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL é obrigatório para executar as migrations.");
  await runMigrations({ connectionString });
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (entrypoint === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
