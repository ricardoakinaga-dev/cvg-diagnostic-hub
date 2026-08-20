"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ItemState, Priority, WorkflowType } from "@cvg/contracts";
import { apiFetch, formatRelativeTime, getSafeErrorMessage } from "./api-client";
import { PriorityBadge, StatusBadge } from "./status-badge";

interface DiagnosticsData {
  patient: { id: string; displayName: string; species: string; breed: string; sex: string; externalId: string; ownerLabel: string };
  items: Array<{ id: string; requestCode: string; priority: Priority; aggregateStatus: string; createdAt: string; items: Array<{ id: string; status: ItemState; workflowType: WorkflowType; currentResultId?: string; service: { name: string } }> }>;
  events: Array<{ id: string; eventType: string; occurredAt: string; newState?: string }>;
}

export function PatientDiagnostics({ patientId }: { patientId: string }) {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try { setError(""); setData(await apiFetch<DiagnosticsData>(`/patients/${patientId}/diagnostics?limit=50`)); }
    catch (cause) { setError(getSafeErrorMessage(cause, "Não foi possível carregar o histórico diagnóstico.")); }
    finally { setLoading(false); }
  }, [patientId]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  if (!data && loading) return <div className="loading-state" role="status">Carregando paciente…</div>;
  if (!data) return <div className="error-state" role="alert"><strong>Paciente indisponível</strong><span>{error}</span><button className="button button-ghost" onClick={() => void load()}>Tentar novamente</button><Link className="button button-ghost" href="/patients">Voltar aos pacientes</Link></div>;
  return <div className="patient-detail-page"><Link href="/patients" className="back-link">← Meus pacientes</Link><div className="detail-heading"><div><p className="eyebrow">Contexto autorizado</p><h1>{data.patient.displayName} <em>e seus exames.</em></h1><p className="page-lede">{data.patient.species} · {data.patient.sex} · {data.patient.breed} · {data.patient.externalId} · tutor {data.patient.ownerLabel}</p></div><button className="button button-ghost" onClick={() => void load()}>↻ Atualizar</button></div>{error && <div className="error-state" role="status"><span>{error}</span><button className="button button-ghost" onClick={() => void load()}>Reconciliar</button></div>}<div className="patient-detail-grid"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Solicitações</p><h2>{data.items.length} protocolos</h2></div><span className="timeline-count">mais recente primeiro</span></div>{data.items.length === 0 ? <div className="empty-state"><span aria-hidden="true">✓</span><strong>Nenhum exame neste contexto</strong><p>Solicitações autorizadas aparecerão aqui.</p></div> : <div className="patient-request-list">{data.items.map((request) => <article className="patient-request" key={request.id}><div className="patient-request-heading"><Link href={`/requests/${request.id}`}><strong>{request.requestCode}</strong></Link><PriorityBadge priority={request.priority} /><span>{formatRelativeTime(request.createdAt)}</span></div>{request.items.map((item) => <div className="patient-request-item" key={item.id}><span><strong>{item.service.name}</strong><small>{item.workflowType} · {item.status.replaceAll("_", " ")}</small></span><StatusBadge status={item.status} />{item.currentResultId && <Link className="text-link" href={`/results/${item.currentResultId}`}>Abrir resultado →</Link>}</div>)}</article>)}</div>}</section><section className="panel timeline-panel"><div className="panel-heading"><div><p className="eyebrow">Histórico</p><h2>Eventos</h2></div><span className="timeline-count">{data.events.length}</span></div>{data.events.length === 0 ? <p className="panel-empty-copy">Nenhum evento disponível.</p> : <ol className="timeline">{data.events.slice(-20).reverse().map((event) => <li key={event.id}><span className="timeline-marker" /><div><strong>{event.eventType.replace(/([A-Z])/g, " $1").trim()}</strong><small>{event.newState ? `Estado: ${event.newState}` : "Ação registrada"} · {formatRelativeTime(event.occurredAt)}</small></div></li>)}</ol>}</section></div></div>;
}
