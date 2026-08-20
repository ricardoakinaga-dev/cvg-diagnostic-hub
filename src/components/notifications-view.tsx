"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatRelativeTime, getSafeErrorMessage } from "./api-client";

interface Notification { id: string; category: string; priority: string; title: string; body: string; createdAt: string; state: string; deepLink: string; version: number }
export function NotificationsView() {
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [confirmations, setConfirmations] = useState<Record<string, boolean>>({});
  const load = useCallback(async () => {
    try { setError(""); setItems(await apiFetch<Notification[]>(`/notifications?filter=${filter}`)); }
    catch (cause) { setError(getSafeErrorMessage(cause, "Não foi possível carregar as notificações.")); }
  }, [filter]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const refresh = () => { void load(); }; window.addEventListener("cvg:realtime-updated", refresh); window.addEventListener("cvg:realtime-resync", refresh); return () => { window.removeEventListener("cvg:realtime-updated", refresh); window.removeEventListener("cvg:realtime-resync", refresh); }; }, [load]);
  async function acknowledge(notification: Notification) {
    const reason = reasons[notification.id]?.trim();
    if (!reason || !confirmations[notification.id]) {
      setError("Informe o motivo e confirme a ação antes de continuar.");
      return;
    }
    try {
      await apiFetch(`/notifications/${notification.id}/acknowledge`, { method: "POST", body: JSON.stringify({ expectedVersion: notification.version, reason, confirm: true }) });
      void load();
    } catch (cause) { setError(getSafeErrorMessage(cause, "Não foi possível confirmar a notificação.")); }
  }
  return <div className="notifications-page"><div className="page-heading"><div><p className="eyebrow">Comunicação interna</p><h1>Notificações <em>que encontram você.</em></h1><p className="page-lede">Cada item leva ao contexto autorizado e permanece na auditoria.</p></div></div><div className="tabs" role="tablist">{[["ALL", "Todas"], ["UNREAD", "Não lidas"], ["ACTIONABLE", "Ação necessária"], ["CRITICAL", "Críticas"]].map(([value, label]) => <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>{error && <div className="error-state" role="alert">{error}</div>}<section className="panel inbox-panel">{items.length === 0 ? <div className="empty-state"><span>✓</span><strong>Nenhuma notificação nesta visão</strong><p>Você está em dia no seu escopo.</p></div> : items.map((item) => <article key={item.id} className={`inbox-row inbox-${item.category.toLowerCase()} ${item.state === "ACKNOWLEDGED" ? "is-acknowledged" : ""}`}><span className={`notification-dot notification-${item.category.toLowerCase()}`} /><div><p className="inbox-meta">{item.category === "CRITICAL" ? "CRÍTICA" : item.category === "ACTIONABLE" ? "AÇÃO NECESSÁRIA" : "INFORMATIVA"} · {formatRelativeTime(item.createdAt)}</p><h2>{item.title}</h2><p>{item.body}</p></div><div className="inbox-actions"> <Link href={item.deepLink} className="button button-ghost">Abrir contexto →</Link>{item.state !== "ACKNOWLEDGED" && <div className="notification-confirmation"><label htmlFor={`reason-${item.id}`}>Motivo da confirmação</label><input id={`reason-${item.id}`} value={reasons[item.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={500} /><label><input type="checkbox" checked={confirmations[item.id] === true} onChange={(event) => setConfirmations((current) => ({ ...current, [item.id]: event.target.checked }))} /> Confirmo a ação</label><button className="button button-primary" disabled={!reasons[item.id]?.trim() || confirmations[item.id] !== true} onClick={() => void acknowledge(item)}>Confirmar</button></div>}</div></article>)}</section></div>;
}
