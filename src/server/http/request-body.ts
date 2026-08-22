import { ApiError } from "./envelope";

export type JsonReadOptions = Readonly<{
  maxBytes: number;
  maxDepth: number;
}>;

export async function readBytesWithLimit(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new ApiError("VALIDATION_ERROR", "O limite do corpo da requisição é inválido.", 400);
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > maxBytes) {
      void request.body?.cancel("declared request body exceeds configured limit").catch(() => undefined);
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

export async function readJsonWithLimit(request: Request, options: JsonReadOptions): Promise<unknown> {
  if (!Number.isSafeInteger(options.maxDepth) || options.maxDepth < 1) {
    throw new ApiError("VALIDATION_ERROR", "O limite de profundidade JSON é inválido.", 400);
  }
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ApiError("UNSUPPORTED_MEDIA_TYPE", "O corpo da requisição deve usar application/json.", 415);
  }

  const bytes = await readBytesWithLimit(request, options.maxBytes);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ApiError("VALIDATION_ERROR", "O corpo JSON deve usar UTF-8 válido.", 400);
  }
  assertJsonTextDepth(text, options.maxDepth);

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "O corpo JSON da requisição é inválido.", 400);
  }
  return value;
}

function assertJsonTextDepth(text: string, maxDepth: number): void {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") inString = true;
    else if (character === "{" || character === "[") {
      depth += 1;
      if (depth > maxDepth) {
        throw new ApiError("VALIDATION_ERROR", "O corpo JSON excede a profundidade permitida.", 400);
      }
    } else if (character === "}" || character === "]") {
      depth -= 1;
    }
  }
}
