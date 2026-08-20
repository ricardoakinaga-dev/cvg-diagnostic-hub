import { PostgresStore } from "../src/server/store/postgres-store";
import { createDemoState } from "../src/server/store/fixtures";
import { createApplicationService } from "../src/server/application/service";
import { InProcessEventBus, processOutboxBatch } from "../src/server/operations/outbox";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL é obrigatório para o smoke test.");
async function main(databaseUrl: string): Promise<void> {
  const first = await PostgresStore.create(databaseUrl, createDemoState());
  let requestId = "";
  try {
    await first.reset(createDemoState("db-smoke-password"));
    const service = createApplicationService(first);
    const actor = first.getState().users.find((user) => user.email === "vet@cvg.local");
    if (!actor) throw new Error("Fixture actor ausente.");
    const request = await service.createRequest(actor, { patientId: "patient-thor", encounterId: "encounter-thor", priority: "ROUTINE", items: [{ serviceId: "service-hemogram" }] }, { idempotencyKey: "db-smoke-request" });
    requestId = request.id;
  } finally {
    await first.close();
  }
  const second = await PostgresStore.create(databaseUrl, createDemoState());
  try {
    if (!second.getState().requests.some((request) => request.id === requestId)) throw new Error("Estado não persistiu após reabrir a conexão.");
    if (!second.getState().auditEvents.some((event) => event.entityId === requestId)) throw new Error("Auditoria não foi projetada no PostgreSQL.");
    const bus = new InProcessEventBus();
    const summary = await processOutboxBatch(second, bus, { workerId: "db-smoke-worker", batchSize: 10 });
    if (summary.processed < 1 || bus.read().length < 1) throw new Error("Outbox não foi processado após reabrir o PostgreSQL.");
    console.log("PostgreSQL smoke test passou: estado, lock transacional, auditoria e outbox persistem.");
  } finally {
    await second.close();
  }
}

void main(connectionString).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
