/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagementDashboard } from "./management-dashboard";
import * as apiClient from "./api-client";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => <a {...props}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe("ManagementDashboard", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders one actionable management snapshot with scope and next actions", async () => {
    vi.spyOn(apiClient, "apiFetch").mockResolvedValue({
      asOf: "2026-08-20T12:00:00.000Z",
      scope: { departments: ["LABORATORY", "RADIOLOGY"], label: "INPATIENT · LABORATORY · RADIOLOGY" },
      summary: { totalRequests: 1, activeItems: 2, overdue: 1, recollections: 0, newResults: 1, critical: 0, pendingRequests: 1, completedToday: 0 },
      departments: [{ departmentCode: "LABORATORY", serviceCount: 2, totalRequests: 1, activeItems: 2, overdue: 1, pending: 2 }],
      pending: [{ id: "item-1", requestId: "request-1", requestCode: "EX-1", patient: "Thor", service: "Hemograma", departmentCode: "LABORATORY", status: "REQUESTED", priority: "URGENT", dueAt: "2026-08-20T11:00:00.000Z", overdue: true, nextAction: "Receber amostra", deepLink: "/requests/request-1#item-1" }],
      recentRequests: [{ id: "request-1", requestCode: "EX-1", patient: "Thor", aggregateStatus: "REQUESTED", priority: "URGENT", updatedAt: "2026-08-20T12:00:00.000Z", itemCount: 1, deepLink: "/requests/request-1" }],
    } as never);

    render(<ManagementDashboard />);

    expect(await screen.findByRole("heading", { name: "Controle operacional." })).toBeInTheDocument();
    expect(screen.getByText("INPATIENT · LABORATORY · RADIOLOGY")).toBeInTheDocument();
    expect(screen.getByText("Receber amostra")).toBeInTheDocument();
    expect(screen.getByText("Onde está a pressão")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Acessos" })).toHaveAttribute("href", "/admin#users");
    await waitFor(() => expect(apiClient.apiFetch).toHaveBeenCalledWith("/management/overview"));
  });

  it("keeps a safe retry state when the management snapshot is unavailable", async () => {
    vi.spyOn(apiClient, "apiFetch").mockRejectedValue(new Error("offline"));
    render(<ManagementDashboard />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Controle operacional indisponível");
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });
});
