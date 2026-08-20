import { MemoryStore } from "./memory-store";
import { createDemoState } from "./fixtures";
import type { StateStore } from "../domain/models";
import { PostgresStore } from "./postgres-store";
import { createFileStoreFromEnv, type FileStore } from "../storage/file-store";

declare global {
  var __cvgDiagnosticsStore: StateStore | undefined;
  var __cvgDiagnosticsStorePromise: Promise<StateStore> | undefined;
  var __cvgDiagnosticsFileStore: FileStore | undefined;
}

export function getRuntimeStore(): StateStore {
  if (!globalThis.__cvgDiagnosticsStore) {
    if (process.env.APP_DATA_MODE === "postgres") {
      throw new Error("APP_DATA_MODE=postgres exige getRuntimeStoreAsync para inicializar a conexão.");
    }
    globalThis.__cvgDiagnosticsStore = new MemoryStore(createDemoState());
  }
  return globalThis.__cvgDiagnosticsStore;
}

export async function getRuntimeStoreAsync(): Promise<StateStore> {
  if (process.env.APP_DATA_MODE !== "postgres") return getRuntimeStore();
  if (!globalThis.__cvgDiagnosticsStorePromise) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL é obrigatório quando APP_DATA_MODE=postgres.");
    globalThis.__cvgDiagnosticsStorePromise = PostgresStore.create(connectionString, createDemoState());
  }
  globalThis.__cvgDiagnosticsStore = await globalThis.__cvgDiagnosticsStorePromise;
  return globalThis.__cvgDiagnosticsStore;
}

export function getRuntimeFileStore(): FileStore {
  if (!globalThis.__cvgDiagnosticsFileStore) globalThis.__cvgDiagnosticsFileStore = createFileStoreFromEnv();
  return globalThis.__cvgDiagnosticsFileStore;
}

export async function getRuntimeReadiness(): Promise<{ dataMode: string; storageMode: string }> {
  const store = await getRuntimeStoreAsync();
  await store.healthcheck?.();
  const storage = getRuntimeFileStore();
  await storage.healthcheck?.();
  return { dataMode: process.env.APP_DATA_MODE ?? "memory", storageMode: process.env.STORAGE_MODE ?? "local" };
}

export function resetRuntimeStore(): void {
  globalThis.__cvgDiagnosticsStore = new MemoryStore(createDemoState());
  globalThis.__cvgDiagnosticsStorePromise = undefined;
  globalThis.__cvgDiagnosticsFileStore = undefined;
}
