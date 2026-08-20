"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ItemState, ResultVersionState, WorkflowType } from "@cvg/contracts";
import { apiFetch, formatRelativeTime, getSafeErrorMessage } from "./api-client";
import { StatusBadge } from "./status-badge";

interface ResultData {
  result: { id: string; lifecycleStatus: string; needsReReview: boolean; version: number };
  version: { id: string; sequence: number; status: ResultVersionState; narrative: string; conclusion?: string; authorId: string; createdAt: string; releasedAt?: string; critical: boolean; needsReReview: boolean; content: Record<string, unknown> };
  item: { id: string; status: ItemState; version: number; serviceId: string };
  request: { id: string; requestCode: string };
  patient: { displayName: string; species: string; sex: string; externalId: string };
  service: { name: string; workflowType: WorkflowType };
}

interface Attachment { id: string; safeName: string; detectedMime: string; sizeBytes: number; scanStatus: string; uploadStatus: string }

export function ResultView({ resultId }: { resultId: string }) {
  const [data, setData] = useState<ResultData | null>(null);
  const [versions, setVersions] = useState<Array<ResultData["version"]>>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [viewed, setViewed] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [resultResponse, versionResponse, reportResponse] = await Promise.allSettled([
      apiFetch<ResultData>(`/results/${resultId}`),
      apiFetch<Array<ResultData["version"]>>(`/results/${resultId}/versions`),
      apiFetch<{ attachments: Attachment[] }>(`/reports/${resultId}`)
    ]);
    if (resultResponse.status === "fulfilled") setData(resultResponse.value);
    if (versionResponse.status === "fulfilled") setVersions(versionResponse.value);
    if (reportResponse.status === "fulfilled") setAttachments(reportResponse.value.attachments);
    if (resultResponse.status === "rejected") {
      setError(getSafeErrorMessage(resultResponse.reason, "Não foi possível carregar o resultado."));
    } else if (versionResponse.status === "rejected" || reportResponse.status === "rejected") {
      setError("Parte do histórico ou dos anexos está indisponível; os dados visíveis podem estar desatualizados.");
    }
    setLoading(false);
  }, [resultId]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  useEffect(() => {
    if (!data || data.version.status === "DRAFT" || viewed) return;
    void apiFetch(`/results/${resultId}/view`, { method: "POST", body: JSON.stringify({ versionId: data.version.id }) })
      .then(() => setViewed(true))
      .catch((cause) => setError(getSafeErrorMessage(cause, "Não foi possível registrar a visualização.")));
  }, [data, resultId, viewed]);

  async function review() {
    if (!data || !viewed || reviewed) return;
    try {
      await apiFetch(`/results/${resultId}/review`, { method: "POST", body: JSON.stringify({ versionId: data.version.id, expectedVersion: data.item.version }) });
      setReviewed(true);
      await load();
    } catch (cause) {
      setError(getSafeErrorMessage(cause, "Não foi possível registrar a revisão."));
    }
  }

  if (!data && loading) return <div className="loading-state" role="status">Carregando resultado…</div>;
  if (!data) return <div className="error-state" role="alert"><strong>Resultado indisponível</strong><span>{error}</span><button className="button button-ghost" onClick={() => void load()}>Tentar novamente</button><Link className="button button-ghost" href="/notifications">Voltar às notificações</Link></div>;

  return <div className="result-page"><Link href={`/requests/${data.request.id}`} className="back-link">← Solicitação {data.request.requestCode}</Link><div className="page-heading"><div><p className="eyebrow">{data.service.name} · versão {data.version.sequence}</p><h1>Resultado de <em>{data.patient.displayName}.</em></h1><p className="page-lede">{data.patient.species} · {data.patient.sex} · {data.patient.externalId} · liberado {data.version.releasedAt ? formatRelativeTime(data.version.releasedAt) : "em rascunho"}</p></div><StatusBadge status={data.item.status} /></div>{error && <div className="error-state" role="status"><span>{error}</span><button className="button button-ghost" onClick={() => void load()}>Reconciliar</button></div>}<div className="result-grid"><section className="panel result-content"><div className="panel-heading"><div><p className="eyebrow">Versão atual</p><h2>{data.version.critical ? "Resultado crítico" : "Laudo confirmado"}</h2></div>{data.version.needsReReview && <span className="result-warning">Nova revisão necessária</span>}</div><div className="result-copy"><p>{data.version.narrative}</p>{data.version.conclusion && <div className="result-conclusion"><span>Conclusão</span><strong>{data.version.conclusion}</strong></div>}{Object.keys(data.version.content).length > 0 && <dl className="result-fields">{Object.entries(data.version.content).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl>}</div><div className="result-actions"><span className="result-view-state" role="status">{viewed ? "Visualização registrada" : "Registrando visualização…"}</span>{data.item.status === "RESULT_AVAILABLE" && <button className="button button-primary" onClick={() => void review()} disabled={!viewed || reviewed}>{reviewed ? "Revisão registrada" : "Marcar como revisado"}</button>}</div></section><aside className="result-side"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Histórico</p><h2>Versões</h2></div><span className="timeline-count">{versions.length}</span></div><ol className="version-list">{versions.map((version) => <li key={version.id} className={version.id === data.version.id ? "version-current" : ""}><strong>Versão {version.sequence}</strong><small>{version.status} · {formatRelativeTime(version.createdAt)}</small></li>)}</ol></section><section className="panel attachment-panel"><div className="panel-heading"><div><p className="eyebrow">Arquivos</p><h2>Anexos</h2></div><span className="timeline-count">{attachments.length}</span></div>{attachments.length === 0 ? <p className="panel-empty-copy">Nenhum anexo nesta versão.</p> : <ul className="attachment-list">{attachments.map((attachment) => <li key={attachment.id}><span><strong>{attachment.safeName}</strong><small>{attachment.detectedMime} · {Math.round(attachment.sizeBytes / 1024)} KB</small></span><span>{attachment.scanStatus === "CLEAN" && attachment.uploadStatus === "FINALIZED" ? "Disponível" : "Indisponível"}</span></li>)}</ul>}</section></aside></div></div>;
}
