import { readFile } from "node:fs/promises";

const document = JSON.parse(await readFile(new URL("../docs/api/openapi.json", import.meta.url), "utf8"));
const requiredPaths = ["/livez", "/readyz", "/session/login", "/diagnostic-requests", "/diagnostic-items/{itemId}", "/results/{resultId}", "/attachments/{attachmentId}/download", "/realtime/events"];
if (document.openapi !== "3.1.0") throw new Error("OpenAPI 3.1.0 é obrigatório.");
if (!document.info?.title || !document.info?.version) throw new Error("OpenAPI precisa de info.title e info.version.");
for (const path of requiredPaths) {
  if (!document.paths?.[path]) throw new Error(`OpenAPI não cobre a rota ${path}.`);
}
for (const [path, item] of Object.entries(document.paths ?? {})) {
  if (!path.startsWith("/")) throw new Error(`Path inválido: ${path}`);
  for (const [method, operation] of Object.entries(item)) {
    if (!["get", "post", "put", "patch", "delete", "head", "options", "trace"].includes(method)) continue;
    if (!operation || typeof operation !== "object") throw new Error(`Operação inválida: ${method.toUpperCase()} ${path}`);
    if ("$ref" in operation) {
      if (typeof operation.$ref !== "string" || !operation.$ref.startsWith("#/components/operations/")) throw new Error(`Ref de operação inválida: ${method.toUpperCase()} ${path}`);
      const name = operation.$ref.split("/").pop();
      if (!name || !document.components?.operations?.[name]?.responses) throw new Error(`Ref de operação sem responses: ${operation.$ref}`);
      continue;
    }
    if (!("responses" in operation)) throw new Error(`Operação sem responses: ${method.toUpperCase()} ${path}`);
  }
}
console.log(`OpenAPI validation PASS: ${Object.keys(document.paths).length} paths verificadas.`);
