import { describe, expect, it, beforeEach } from "vitest";
import { assertRateLimit, resetRateLimits } from "./rate-limit";

describe("API rate limiter", () => {
  beforeEach(() => resetRateLimits());

  it("blocks a burst and opens a new fixed window", () => {
    assertRateLimit("test-client", 2, 1_000, 100);
    assertRateLimit("test-client", 2, 1_000, 100);
    expect(() => assertRateLimit("test-client", 2, 1_000, 100)).toThrowError(expect.objectContaining({ code: "RATE_LIMITED", status: 429 }));
    expect(() => assertRateLimit("test-client", 2, 1_000, 1_101)).not.toThrow();
  });
});
