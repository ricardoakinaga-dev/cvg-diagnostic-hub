import { PostgresStore } from "../src/server/store/postgres-store";
import { createDemoState } from "../src/server/store/fixtures";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL é obrigatório para executar o seed.");
async function main(databaseUrl: string): Promise<void> {
  const store = await PostgresStore.create(databaseUrl, createDemoState());
  try {
    await store.reset(createDemoState(process.env.DEMO_PASSWORD ?? "local-demo-password"));
    console.log("Seed sintético aplicado. Nenhum dado clínico real deve ser usado neste ambiente.");
  } finally {
    await store.close();
  }
}

void main(connectionString).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
