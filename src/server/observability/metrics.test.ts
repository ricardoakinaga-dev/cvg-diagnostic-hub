import { describe, expect, it } from "vitest";
import { createDemoState } from "../store/fixtures";
import { incrementGauge, recordHttpRequest, recordReadinessFailure, refreshOperationalMetrics, renderPrometheus, resetMetrics, setGauge } from "./metrics";

describe("bounded metrics", () => {
  it("renders stable labels without identifiers or request payloads", () => {
    resetMetrics();
    recordHttpRequest("GET", "/api/v1/diagnostic-items/[id]", 200, 12.5);
    setGauge("outbox_pending", 3);

    const output = renderPrometheus();

    expect(output).toContain('http_requests_total{method="GET",route="/api/v1/diagnostic-items/[id]",status="200"} 1');
    expect(output).toContain('http_request_duration_ms_count{method="GET",route="/api/v1/diagnostic-items/[id]"} 1');
    expect(output).toContain("cvg_outbox_pending 3");
    expect(output).not.toContain("patient-");
    expect(output).not.toContain("request-body");
  });

  it("ignores invalid gauges and normalizes malformed request measurements", () => {
    resetMetrics();
    recordHttpRequest("", "", 99, Number.NaN);
    setGauge("unknown_metric", 10);
    setGauge("outbox_pending", Number.NaN);

    const output = renderPrometheus();

    expect(output).toContain('method="UNKNOWN"');
    expect(output).toContain('route="/unknown"');
    expect(output).toContain('status="500"');
    expect(output).not.toContain("unknown_metric");
  });

  it("refreshes bounded operational gauges without exposing event identifiers", () => {
    resetMetrics();
    const state = createDemoState();
    state.outbox = [
      { id: "outbox-one", eventType: "one", aggregateType: "Patient", aggregateId: "patient-secret", payload: {}, status: "PENDING", attempts: 0, availableAt: "2026-08-20T09:59:00.000Z", correlationId: "corr-one" },
      { id: "outbox-two", eventType: "two", aggregateType: "Patient", aggregateId: "patient-secret", payload: {}, status: "PROCESSING", attempts: 1, availableAt: "2026-08-20T09:59:30.000Z", correlationId: "corr-two" },
      { id: "outbox-three", eventType: "three", aggregateType: "Patient", aggregateId: "patient-secret", payload: {}, status: "PROCESSED", attempts: 1, availableAt: "2026-08-20T09:58:00.000Z", correlationId: "corr-three" }
    ];

    refreshOperationalMetrics(state, new Date("2026-08-20T10:00:00.000Z"));
    incrementGauge("sse_connections");
    incrementGauge("sse_connections", -1);
    recordReadinessFailure();

    const output = renderPrometheus();
    expect(output).toContain("cvg_outbox_pending 2");
    expect(output).toContain("cvg_outbox_oldest_age_seconds 60");
    expect(output).toContain("cvg_sse_connections 0");
    expect(output).toContain("cvg_readiness_failures 1");
    expect(output).not.toContain("patient-secret");
  });
});
