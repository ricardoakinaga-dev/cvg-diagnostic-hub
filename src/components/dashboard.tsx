"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Priority } from "@cvg/contracts";
import { apiFetch, formatRelativeTime } from "./api-client";
import { PriorityBadge, StatusBadge } from "./status-badge";

interface Item { id: string; status: Parameters<typeof StatusBadge>[0]["status"]; priority: Priority; dueAt: string; service: { name: string; code: string }; note?: string }
interface Request { id: string; requestCode: string; patient: { displayName: string; species: string; sex: string; externalId: string }; priority: Priority; aggregateStatus: string; createdAt: string; items: Item[] }
interface Service { id: string; name: string; code: string; workflowType: string; category: string; requiresSample: boolean; requiresSchedule: boolean }
interface Stats { overdue: number; recollections: number; newResults: number; critical: number; totalActive: number; updatedAt: string }
interface Notification { id: string; category: string; priority: string; title: string; body: string; createdAt: string; state: string; deepLink: string }

function dashboardDateLabel(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} · ${day} de ${month}`;
}

export function Dashboard() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [userName, setUserName] = useState("equipe");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showRequest, setShowRequest] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; label: string; patient: string; deepLink: string; status: string }>>([]);

  const load = useCallback(async () => {
    setError("");
    try {
      const [requestData, statData, notificationData, serviceData, me] = await Promise.all([
        apiFetch<Request[]>("/diagnostic-requests?limit=20"),
        apiFetch<Stats>("/dashboard"),
        apiFetch<Notification[]>("/notifications?filter=UNREAD"),
        apiFetch<Service[]>("/diagnostic-services"),
        apiFetch<{ user: { displayName: string } }>("/session/me")
      ]);
      setRequests(requestData); setStats(statData); setNotifications(notificationData); setServices(serviceData); setUserName(me.user.displayName.split(" ")[1] ?? me.user.displayName);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar a visão geral."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const refresh = () => { void load(); };
    const resync = () => { void load(); };
    window.addEventListener("cvg:realtime-updated", refresh);
    window.addEventListener("cvg:realtime-resync", resync);
    return () => { window.removeEventListener("cvg:realtime-updated", refresh); window.removeEventListener("cvg:realtime-resync", resync); };
  }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search.trim().length < 2) { setSearchResults([]); return; }
      void apiFetch<typeof searchResults>(`/search?q=${encodeURIComponent(search)}`).then(setSearchResults).catch(() => setSearchResults([]));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [search]);

  const activeRequests = useMemo(() => requests.filter((request) => !["COMPLETED", "CANCELLED"].includes(request.aggregateStatus)), [requests]);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="dashboard-page">
      <div className="page-heading"><div><p className="eyebrow">{dashboardDateLabel()}</p><h1>Bom dia, <em>{userName}.</em></h1><p className="page-lede">Aqui está o que merece sua atenção agora.</p></div><button className="button button-primary" onClick={() => setShowRequest(true)}><span>＋</span> Nova solicitação</button></div>
      <div className="search-bar"><span aria-hidden="true">⌕</span><input aria-label="Buscar no Hub" placeholder="Buscar protocolo, paciente, serviço ou accession…" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd>{searchResults.length > 0 && <div className="search-popover">{searchResults.map((result) => <Link key={result.id} href={result.deepLink} onClick={() => setSearch("")}><span className="search-icon">↗</span><span><strong>{result.label}</strong><small>{result.patient} · {result.status}</small></span></Link>)}</div>}</div>
      {error && <div className="error-state" role="alert"><strong>Não foi possível atualizar a visão geral.</strong><span>{error}</span><button className="button button-ghost" onClick={() => void load()}>Tentar novamente</button></div>}
      <section className="metric-grid" aria-label="Indicadores de atenção">
        <MetricCard label="Atrasados" value={stats?.overdue ?? 0} tone="danger" caption="exigem intervenção" icon="◷" />
        <MetricCard label="Recoletas" value={stats?.recollections ?? 0} tone="warning" caption="aguardando nova amostra" icon="⌁" />
        <MetricCard label="Resultados novos" value={stats?.newResults ?? 0} tone="success" caption="aguardando revisão" icon="↗" />
        <MetricCard label="Críticos" value={stats?.critical ?? 0} tone="critical" caption="confirmação necessária" icon="!" />
      </section>
      <div className="dashboard-columns">
        <section className="panel attention-panel"><div className="panel-heading"><div><p className="eyebrow">Acompanhe de perto</p><h2>Solicitações em andamento</h2></div><Link href="/queues" className="text-link">Ver central <span>→</span></Link></div>{activeRequests.length === 0 ? <EmptyState title="Nenhuma solicitação pendente" description="Quando um exame precisar de ação, ele aparecerá aqui." /> : <div className="request-list">{activeRequests.slice(0, 6).map((request) => <RequestRow key={request.id} request={request} />)}</div>}</section>
        <section className="panel notification-panel"><div className="panel-heading"><div><p className="eyebrow">Ação necessária</p><h2>Últimas notificações</h2></div><Link href="/notifications" className="text-link">Ver todas <span>→</span></Link></div>{notifications.length === 0 ? <EmptyState title="Tudo em dia" description="Nenhuma nova ação no seu escopo." compact /> : <div className="notification-list">{notifications.slice(0, 4).map((notification) => <NotificationRow key={notification.id} notification={notification} />)}</div>}</section>
      </div>
      <section className="bottom-strip"><div><span className="strip-icon">✦</span><div><strong>Visibilidade ponta a ponta</strong><p>Os estados são confirmados pelo servidor e auditados em uma única timeline.</p></div></div><span className="strip-status">Atualizado {stats ? formatRelativeTime(stats.updatedAt) : "agora"}</span></section>
      {showRequest && <RequestDialog services={services} onClose={() => setShowRequest(false)} onCreated={() => { setShowRequest(false); void load(); }} />}
    </div>
  );
}

function MetricCard({ label, value, tone, caption, icon }: { label: string; value: number; tone: string; caption: string; icon: string }) {
  return <article className={`metric-card metric-${tone}`}><div className="metric-top"><span>{label}</span><b aria-hidden="true">{icon}</b></div><strong>{value}</strong><small>{caption}</small></article>;
}

function RequestRow({ request }: { request: Request }) {
  const primary = request.items[0];
  return <Link href={`/requests/${request.id}`} className="request-row"><div className="patient-chip"><span className="patient-avatar">{request.patient.displayName.slice(0, 1)}</span><span><strong>{request.patient.displayName}</strong><small>{request.patient.species} · {request.patient.sex} · {request.patient.externalId}</small></span></div><div className="request-service"><strong>{request.items.length > 1 ? `${primary.service.name} + ${request.items.length - 1}` : primary.service.name}</strong><small>{request.requestCode} · {formatRelativeTime(request.createdAt)}</small></div><div className="request-state"><PriorityBadge priority={request.priority} /><StatusBadge status={primary.status} /></div><span className="row-arrow" aria-hidden="true">→</span></Link>;
}

function NotificationRow({ notification }: { notification: Notification }) {
  return <Link href={notification.deepLink} className="notification-row"><span className={`notification-dot notification-${notification.category.toLowerCase()}`} /><span className="notification-copy"><strong>{notification.title}</strong><small>{notification.body}</small><time>{formatRelativeTime(notification.createdAt)}</time></span><span aria-hidden="true" className="row-arrow">→</span></Link>;
}

function EmptyState({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) { return <div className={`empty-state ${compact ? "empty-compact" : ""}`}><span aria-hidden="true">✓</span><strong>{title}</strong><p>{description}</p></div>; }

function DashboardSkeleton() { return <div className="dashboard-page"><div className="skeleton-heading skeleton-block" /><div className="skeleton-search skeleton-block" /><div className="metric-grid">{[1, 2, 3, 4].map((item) => <div key={item} className="metric-card skeleton-card" />)}</div><div className="dashboard-columns"><div className="panel skeleton-panel" /><div className="panel skeleton-panel" /></div></div>; }

function RequestDialog({ services, onClose, onCreated }: { services: Service[]; onClose: () => void; onCreated: () => void }) {
  const [patients, setPatients] = useState<Array<{ id: string; displayName: string; species: string; externalId: string }>>([]);
  const [patientId, setPatientId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [priority, setPriority] = useState<Priority>("ROUTINE");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { void apiFetch<typeof patients>("/patients").then(setPatients).catch(() => setError("Não foi possível carregar os pacientes.")); }, []);
  const encounter = patientId === "patient-thor" ? "encounter-thor" : patientId === "patient-mel" ? "encounter-mel" : "";
  async function submit() { setSubmitting(true); setError(""); try { if (!patientId || !encounter || selected.length === 0) throw new Error("Escolha paciente e pelo menos um serviço."); await apiFetch("/diagnostic-requests", { method: "POST", headers: { "x-correlation-id": `ui-${crypto.randomUUID()}` }, body: JSON.stringify({ patientId, encounterId: encounter, priority, items: selected.map((serviceId) => ({ serviceId })) }) }); onCreated(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar a solicitação."); } finally { setSubmitting(false); } }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="request-dialog-title"><div className="dialog-heading"><div><p className="eyebrow">Novo fluxo</p><h2 id="request-dialog-title">Solicitar exames</h2><p>O atendimento e o setor serão confirmados pelo servidor.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar">×</button></div><label>Paciente<select value={patientId} onChange={(event) => setPatientId(event.target.value)}><option value="">Selecione um paciente…</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.displayName} · {patient.species} · {patient.externalId}</option>)}</select></label><fieldset><legend>Serviços</legend><div className="service-options">{services.map((service) => <label key={service.id} className={`service-option ${selected.includes(service.id) ? "selected" : ""}`}><input type="checkbox" checked={selected.includes(service.id)} onChange={() => setSelected((current) => current.includes(service.id) ? current.filter((id) => id !== service.id) : [...current, service.id])} /><span><strong>{service.name}</strong><small>{service.workflowType === "LABORATORY" ? "Laboratório" : service.workflowType === "ULTRASOUND" ? "Ultrassom" : "Radiologia"}</small></span><b aria-hidden="true">✓</b></label>)}</div></fieldset><div className="priority-picker"><span>Prioridade</span>{(["ROUTINE", "URGENT", "EMERGENCY"] as Priority[]).map((value) => <button key={value} type="button" className={priority === value ? "selected" : ""} onClick={() => setPriority(value)}>{value === "ROUTINE" ? "Rotina" : value === "URGENT" ? "Urgente" : "Emergência"}</button>)}</div>{error && <div className="form-alert" role="alert">{error}</div>}<div className="dialog-actions"><button className="button button-ghost" onClick={onClose}>Cancelar</button><button className="button button-primary" onClick={() => void submit()} disabled={submitting}>{submitting ? "Confirmando…" : "Confirmar solicitação"}<span>→</span></button></div></section></div>;
}
