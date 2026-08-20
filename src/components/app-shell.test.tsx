/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
import { apiFetch } from "./api-client";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => <a {...props}>{children}</a>,
}));

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace, refresh }),
}));

vi.mock("./api-client", () => ({ apiFetch: vi.fn() }));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly close = vi.fn();
  readonly addEventListener = vi.fn();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  triggerError() {
    this.onerror?.();
  }

  triggerOpen() {
    this.onopen?.();
  }
}

const originalEventSource = globalThis.EventSource;

describe("AppShell", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    Object.defineProperty(globalThis, "EventSource", { configurable: true, writable: true, value: FakeEventSource });
    vi.mocked(apiFetch).mockResolvedValue({
      user: {
        id: "user-1",
        email: "vet@cvg.local",
        displayName: "Ana Silva",
        role: "VET",
        departmentCode: "LABORATORY",
        timezone: "America/Sao_Paulo",
      },
    });
  });

  afterEach(() => {
    cleanup();
    if (originalEventSource) {
      Object.defineProperty(globalThis, "EventSource", { configurable: true, writable: true, value: originalEventSource });
    } else {
      Reflect.deleteProperty(globalThis, "EventSource");
    }
    vi.clearAllMocks();
  });

  it("exposes an uncertainty banner and reconciliation action when SSE degrades", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    render(<AppShell><div>Conteúdo da página</div></AppShell>);

    await screen.findByRole("navigation", { name: "Navegação principal" });
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = FakeEventSource.instances[0];
    act(() => source.triggerError());

    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent("As informações podem estar desatualizadas");
    expect(banner).toHaveTextContent("Atualizações ao vivo indisponíveis");

    fireEvent.click(screen.getByRole("button", { name: "Atualizar agora" }));

    await waitFor(() => expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "cvg:realtime-resync" })));
    expect(source.close).toHaveBeenCalled();
  });

  it("keeps the main navigation semantic and marks the current page", async () => {
    render(<AppShell><div>Conteúdo da página</div></AppShell>);

    const navigation = await screen.findByRole("navigation", { name: "Navegação principal" });
    expect(navigation).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Visão geral" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Central de exames" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Notificações" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Meus pacientes" })).toHaveAttribute("href", "/patients");
    expect(screen.queryByRole("link", { name: "Indicadores" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Administração" })).not.toBeInTheDocument();
  });

  it("exposes the operational management navigation to a manager", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      user: {
        id: "user-management",
        email: "management@cvg.local",
        displayName: "Gestão",
        role: "MANAGER",
        departmentCode: "LABORATORY",
        timezone: "America/Sao_Paulo",
      },
    });

    render(<AppShell><div>Conteúdo da página</div></AppShell>);

    await screen.findByRole("navigation", { name: "Navegação principal" });
    expect(screen.getByRole("link", { name: "Central de exames" })).toHaveAttribute("href", "/queues");
    expect(screen.getByRole("link", { name: "Solicitações" })).toHaveAttribute("href", "/management?view=requests");
    expect(screen.getByRole("link", { name: "Pendências" })).toHaveAttribute("href", "/management?view=pending");
    expect(screen.getByRole("link", { name: "Estatísticas" })).toHaveAttribute("href", "/management?view=stats");
    expect(screen.getByRole("link", { name: "Acessos" })).toHaveAttribute("href", "/admin#users");
    expect(screen.getByRole("link", { name: "Catálogos" })).toHaveAttribute("href", "/admin#catalog");
    expect(screen.getByRole("link", { name: "Auditoria" })).toHaveAttribute("href", "/admin#audit");
    expect(screen.queryByRole("link", { name: "Administração" })).not.toBeInTheDocument();
  });

  it("limits a technical administrator to the technical administration area", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      user: {
        id: "user-admin",
        email: "admin@cvg.local",
        displayName: "Administração Técnica",
        role: "ADMIN",
        departmentCode: "IT",
        timezone: "America/Sao_Paulo",
      },
    });

    render(<AppShell><div>Conteúdo da página</div></AppShell>);

    await screen.findByRole("navigation", { name: "Navegação principal" });
    expect(screen.getByRole("link", { name: "Visão geral" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Administração" })).toHaveAttribute("href", "/admin");
    expect(screen.queryByRole("link", { name: "Central de exames" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Meus pacientes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Indicadores" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Notificações" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Abrir notificações" })).not.toBeInTheDocument();
  });
});
