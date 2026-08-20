/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IndicatorsView } from "./indicators-view";
import * as apiClient from "./api-client";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => <a {...props}>{children}</a>,
}));

describe("IndicatorsView", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows scoped indicators and labels unavailable distributions instead of inventing them", async () => {
    vi.spyOn(apiClient, "apiFetch").mockImplementation((path) => {
      if (path === "/session/me") return Promise.resolve({ user: { departmentCode: "LABORATORY" } }) as never;
      if (path === "/dashboard") return Promise.resolve({ overdue: 2, recollections: 1, newResults: 3, critical: 1, totalActive: 8, updatedAt: "2026-08-20T14:00:00.000Z" }) as never;
      if (path.startsWith("/queues/LABORATORY/items")) return Promise.resolve([{ id: "item-1", status: "IN_PROGRESS", priority: "URGENT", overdue: false }]) as never;
      return Promise.reject(new Error("unexpected request")) as never;
    });

    render(<IndicatorsView />);

    expect(await screen.findByRole("heading", { name: /Indicadores operacionais/ })).toBeInTheDocument();
    expect(screen.getByText("Não há distribuição de tempo de resposta disponível neste ambiente.")).toBeInTheDocument();
    expect(screen.getByText("Setor: LABORATORY")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });
});
