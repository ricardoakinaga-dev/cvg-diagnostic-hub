"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "./api-client";

interface SessionUser { id: string; email: string; displayName: string; role: string; departmentCode: string; timezone: string }

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState("connecting");

  useEffect(() => {
    apiFetch<{ user: SessionUser }>("/session/me")
      .then((result) => setUser(result.user))
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let retryCount = 0;
    const connect = () => {
      if (stopped) return;
      source = new EventSource("/api/v1/realtime/events");
      source.onopen = () => { retryCount = 0; setLive("connected"); };
      source.onmessage = () => window.dispatchEvent(new Event("cvg:realtime-updated"));
      source.addEventListener("resync_required", () => window.dispatchEvent(new Event("cvg:realtime-resync")));
      source.onerror = () => {
        setLive("degraded");
        source?.close();
        retryCount += 1;
        retryTimer = setTimeout(connect, Math.min(30_000, 1_000 * 2 ** Math.min(retryCount, 5)));
      };
    };
    connect();
    return () => { stopped = true; source?.close(); if (retryTimer) clearTimeout(retryTimer); };
  }, [router, user]);

  async function logout() {
    try { await apiFetch("/session/logout", { method: "POST", body: "{}" }); } finally { router.replace("/login"); }
  }

  if (loading) return <div className="screen-center"><div className="loading-mark" aria-label="Carregando" /></div>;
  if (!user) return null;

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="CVG Diagnostics Hub, início">
          <span className="brand-mark">CVG</span>
          <span><strong>Diagnostics</strong><small>HUB OPERACIONAL</small></span>
        </Link>
        <nav aria-label="Navegação principal" className="main-nav">
          <NavLink href="/" active={pathname === "/"} icon="⌂">Visão geral</NavLink>
          <NavLink href="/queues" active={pathname.startsWith("/queues")} icon="▤">Central de exames</NavLink>
          <NavLink href="/notifications" active={pathname.startsWith("/notifications")} icon="◌">Notificações</NavLink>
        </nav>
        <div className="sidebar-footer">
          <div className={`live-indicator live-${live}`}><span />{live === "connected" ? "Atualização ao vivo" : live === "degraded" ? "Atualização interrompida" : "Conectando"}</div>
          <div className="user-card"><span className="avatar">{user.displayName.slice(0, 1)}</span><span className="user-copy"><strong>{user.displayName}</strong><small>{user.role.replaceAll("_", " ")}</small></span><button onClick={logout} className="icon-button" aria-label="Sair">↪</button></div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div className="breadcrumb">CVG <span>/</span> Operação</div><div className="topbar-actions"><Link href="/notifications" className="notification-trigger" aria-label="Abrir notificações">◌</Link><span className="topbar-date">{new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(new Date())}</span></div></header>
        <div className="content-wrap">{children}</div>
      </main>
    </div>
  );
}

function NavLink({ href, active, icon, children }: { href: string; active: boolean; icon: string; children: React.ReactNode }) {
  return <Link href={href} className={`nav-link ${active ? "active" : ""}`}><span aria-hidden="true">{icon}</span>{children}</Link>;
}
