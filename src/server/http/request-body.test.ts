import { describe, expect, it } from "vitest";
import { readBytesWithLimit } from "./request-body";

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
