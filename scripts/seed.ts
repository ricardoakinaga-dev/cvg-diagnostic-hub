import { PostgresStore } from "../src/server/store/postgres-store";
import { createDemoState } from "../src/server/store/fixtures";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL é obrigatório para executar o seed.");
const demoPassword = process.env.DEMO_PASSWORD;
if (!demoPassword) throw new Error("DEMO_PASSWORD é obrigatório para executar o seed sintético.");
if (process.env.NODE_ENV === "production") throw new Error("O seed sintético é proibido em produção.");
if (process.env.ALLOW_SYNTHETIC_SEED !== "true") throw new Error("ALLOW_SYNTHETIC_SEED=true é obrigatório para confirmar a substituição por dados sintéticos.");
async function main(databaseUrl: string): Promise<void> {
  const demoState = createDemoState(demoPassword);
  const store = await PostgresStore.create(
    databaseUrl,
    demoState,
    { authorization: "ALLOW_SYNTHETIC_SEED" }
  );
  try {
    await store.reset(demoState, { authorization: "ALLOW_SYNTHETIC_SEED" });
    console.log("Seed sintético aplicado. Nenhum dado clínico real deve ser usado neste ambiente.");
  } finally {
    await store.close();
  }
}

void main(connectionString).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
