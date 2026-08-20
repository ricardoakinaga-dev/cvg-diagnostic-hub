/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminConsole } from "./admin-console";
import * as apiClient from "./api-client";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => <a {...props}>{children}</a>,
}));

describe("AdminConsole", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("edits versioned catalog data and keeps external policy gates explicit", async () => {
    const apiFetchMock = vi.spyOn(apiClient, "apiFetch").mockImplementation((path, init) => {
      if (path.startsWith("/diagnostic-services") && init?.method === "PATCH") return Promise.resolve({ id: "service-1", name: "Hemograma revisado", active: false, version: 2 }) as never;
      if (path.startsWith("/diagnostic-services")) return Promise.resolve([{ id: "service-1", code: "HEMOGRAM", name: "Hemograma", departmentCode: "LABORATORY", workflowType: "LABORATORY", active: true, version: 1, slaHours: { ROUTINE: 8, URGENT: 4, EMERGENCY: 2 } }]) as never;
      if (path === "/reason-codes") return Promise.resolve([{ id: "reason-1", type: "RECOLLECTION", code: "HEMOLYZED", label: "Amostra hemolisada", active: true, version: 1 }]) as never;
      return Promise.reject(new Error("unexpected request")) as never;
    });

    render(<AdminConsole />);

    expect(await screen.findByRole("heading", { name: /Administração/ })).toBeInTheDocument();
    expect(screen.getByText(/política de resultado crítico/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar Hemograma" }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith("/diagnostic-services/service-1", expect.objectContaining({ method: "PATCH" })));
  });

  it("shows an explicit permission-denied state when both administration resources are out of scope", async () => {
    vi.spyOn(apiClient, "apiFetch").mockRejectedValue(new apiClient.ApiClientError(404, { error: { code: "SCOPE_DENIED" } }));

    render(<AdminConsole />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Administração fora do seu escopo");
    expect(screen.getByText("Seu perfil não pode consultar nem alterar o catálogo institucional.")).toBeInTheDocument();
  });
});
