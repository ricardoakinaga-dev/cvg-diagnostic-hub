import { ApiError } from "./envelope";

export async function readBytesWithLimit(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new ApiError("VALIDATION_ERROR", "O limite do corpo da requisição é inválido.", 400);
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > maxBytes) {
      throw new ApiError("VALIDATION_ERROR", "O corpo da requisição excede o limite permitido.", 400);
    }
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("request body exceeds configured limit").catch(() => undefined);
      throw new ApiError("VALIDATION_ERROR", "O corpo da requisição excede o limite permitido.", 400);
    }
    chunks.push(next.value);
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
