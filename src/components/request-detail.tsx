"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ItemState, Priority, WorkflowType } from "@cvg/contracts";
import { apiFetch, formatRelativeTime, getSafeErrorMessage } from "./api-client";
import { PriorityBadge, StatusBadge } from "./status-badge";
import { WorkflowAction } from "./workflow-action";

interface Request {
  id: string;
  requestCode: string;
  priority: Priority;
  aggregateStatus: string;
  createdAt: string;
  patient: { displayName: string; species: string; sex: string; externalId: string; ownerLabel: string };
  items: Array<{ id: string; status: ItemState; workflowType: WorkflowType; priority: Priority; dueAt: string; version: number; currentResultId?: string; currentSampleId?: string; service: { name: string; workflowType: WorkflowType } }>;
}

interface Event { id: string; eventType: string; newState?: string; occurredAt: string }

export function RequestDetail({ requestId }: { requestId: string }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [timeline, setTimeline] = useState<Event[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [requestResult, timelineResult] = await Promise.allSettled([
      apiFetch<Request>(`/diagnostic-requests/${requestId}`),
      apiFetch<Event[]>(`/timeline?requestId=${encodeURIComponent(requestId)}`)
    ]);
    if (requestResult.status === "fulfilled") setRequest(requestResult.value);
    if (timelineResult.status === "fulfilled") setTimeline(timelineResult.value);
    const failures = [requestResult, timelineResult].filter((result) => result.status === "rejected");
    const firstFailure = failures[0];
    const failureMessage = firstFailure?.status === "rejected" ? getSafeErrorMessage(firstFailure.reason, "Não foi possível carregar o contexto.") : "";
    setError(failures.length === 2 ? failureMessage : failures.length === 1 ? "Parte da timeline está indisponível. Os dados visíveis podem estar desatualizados." : "");
    setLoading(false);
  }, [requestId]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  if (!request && loading) return <div className="loading-state" role="status">Carregando contexto…</div>;
  if (!request) return <div className="error-state" role="alert"><strong>Contexto indisponível</strong><span>{error || "A solicitação não foi encontrada."}</span><button className="button button-ghost" onClick={() => void load()}>Tentar novamente</button><Link className="button button-ghost" href="/">Voltar à visão geral</Link></div>;

  return <div className="detail-page"><Link href="/" className="back-link">← Visão geral</Link><div className="detail-heading"><div><p className="eyebrow">Solicitação {request.requestCode}</p><h1>{request.patient.displayName} <em>em acompanhamento.</em></h1><p className="page-lede">{request.patient.species} · {request.patient.sex} · {request.patient.externalId} · tutor {request.patient.ownerLabel}</p></div><PriorityBadge priority={request.priority} /></div>{error && <div className="error-state" role="status"><span>{error}</span><button className="button button-ghost" onClick={() => void load()}>Reconciliar visão</button></div>}<div className="detail-grid"><section className="panel detail-items"><div className="panel-heading"><div><p className="eyebrow">Itens independentes</p><h2>{request.items.length} exames nesta solicitação</h2></div><span className="aggregate-status">{request.aggregateStatus.replaceAll("_", " ")}</span></div>{request.items.map((item) => <article className="detail-item" key={item.id} id={item.id}><div className="detail-item-icon" aria-hidden="true">{item.service.workflowType === "LABORATORY" ? "✣" : "◌"}</div><div className="detail-item-copy"><h3>{item.service.name}</h3><small>{item.service.workflowType === "LABORATORY" ? "Laboratório" : "Imagem"} · prazo {formatRelativeTime(item.dueAt)}</small></div><StatusBadge status={item.status} /><WorkflowAction item={item} onComplete={() => void load()} /></article>)}</section><section className="panel timeline-panel"><div className="panel-heading"><div><p className="eyebrow">Fonte de verdade</p><h2>Timeline</h2></div><span className="timeline-count">{timeline.length} eventos</span></div>{timeline.length === 0 ? <div className="empty-state"><span aria-hidden="true">◌</span><strong>Nenhum evento disponível</strong><p>A timeline será reconciliada quando a dependência voltar.</p></div> : <ol className="timeline">{timeline.map((event) => <li key={event.id}><span className="timeline-marker" /><div><strong>{event.eventType.replace(/([A-Z])/g, " $1").trim()}</strong><small>{event.newState ? `Estado: ${event.newState}` : "Ação registrada"} · {formatRelativeTime(event.occurredAt)}</small></div></li>)}</ol>}</section></div></div>;
}
