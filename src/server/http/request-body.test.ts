import { describe, expect, it } from "vitest";
import * as requestBody from "./request-body";

type JsonReadOptions = Readonly<{
  maxBytes: number;
  maxDepth: number;
}>;

type ReadJsonWithLimit = (
  request: Request,
  options: JsonReadOptions
) => Promise<unknown>;

function readJsonWithLimit(
  request: Request,
  options: JsonReadOptions
): Promise<unknown> {
  const candidate = (requestBody as unknown as Record<string, unknown>)[
    "readJsonWithLimit"
  ];
  if (typeof candidate !== "function") {
    return Promise.reject(new Error("readJsonWithLimit is not implemented"));
  }
  return (candidate as ReadJsonWithLimit)(request, options);
}

const { readBytesWithLimit } = requestBody;

function jsonRequest(body: BodyInit, headers?: HeadersInit): Request {
  return new Request("http://localhost/api/resource", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      ...headers
    },
    duplex: "half"
  } as RequestInit);
}

describe("bounded request body reader", () => {
  it("stops consuming a stream as soon as the byte limit is exceeded", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(6));
        if (pulled === 3) controller.close();
      }
    });

    await expect(readBytesWithLimit(new Request("http://localhost/upload", { method: "PUT", body, duplex: "half" } as RequestInit), 10)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(pulled).toBe(2);
  });

  it("returns a bounded empty body when no stream is present", async () => {
    await expect(readBytesWithLimit(new Request("http://localhost/upload"), 10)).resolves.toEqual(new Uint8Array());
  });
});

describe("bounded JSON request body reader", () => {
  it("parses valid JSON within the byte and nesting limits", async () => {
    const request = jsonRequest(
      JSON.stringify({ animalId: "animal-1", values: [1, 2, 3] }),
      { "content-type": "application/json; charset=utf-8" }
    );

    await expect(
      readJsonWithLimit(request, { maxBytes: 256, maxDepth: 4 })
    ).resolves.toEqual({ animalId: "animal-1", values: [1, 2, 3] });
  });

  it("does not count structural characters inside JSON strings as nesting", async () => {
    const request = jsonRequest(JSON.stringify({ text: "[[{{\\\"", nested: { ok: true } }));

    await expect(
      readJsonWithLimit(request, { maxBytes: 256, maxDepth: 2 })
    ).resolves.toEqual({ text: "[[{{\\\"", nested: { ok: true } });
  });

  it("rejects a declared oversized body before consuming its stream", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      }
    });
    const request = jsonRequest(body, { "content-length": "257" });

    await expect(
      readJsonWithLimit(request, { maxBytes: 256, maxDepth: 4 })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(pulled).toBe(0);
  });

  it("stops a chunked body as soon as the byte limit is exceeded", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(6).fill(0x20));
        if (pulled === 3) controller.close();
      }
    });

    await expect(
      readJsonWithLimit(jsonRequest(body), { maxBytes: 10, maxDepth: 4 })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(pulled).toBe(2);
  });

  it("rejects object nesting deeper than the configured maximum", async () => {
    const request = jsonRequest('{"one":{"two":{"three":true}}}');

    await expect(
      readJsonWithLimit(request, { maxBytes: 256, maxDepth: 2 })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });

  it("rejects array nesting deeper than the configured maximum", async () => {
    const request = jsonRequest("[[[1]]]");

    await expect(
      readJsonWithLimit(request, { maxBytes: 256, maxDepth: 2 })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });

  it("rejects malformed JSON", async () => {
    const request = jsonRequest('{"animalId":');

    await expect(
      readJsonWithLimit(request, { maxBytes: 256, maxDepth: 4 })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });

  it("rejects invalid UTF-8 instead of replacing invalid bytes", async () => {
    const request = jsonRequest(
      new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d])
    );

    await expect(
      readJsonWithLimit(request, { maxBytes: 256, maxDepth: 4 })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });

  it("rejects request bodies whose media type is not application/json", async () => {
    const request = jsonRequest("animalId=animal-1", {
      "content-type": "application/x-www-form-urlencoded"
    });

    await expect(
      readJsonWithLimit(request, { maxBytes: 256, maxDepth: 4 })
    ).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE", status: 415 });
  });
});
