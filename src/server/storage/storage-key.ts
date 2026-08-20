export function safeStorageKey(key: string): string {
  const normalized = key.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => part === ".." || part === ".")) throw new Error("INVALID_STORAGE_KEY");
  return normalized;
}
